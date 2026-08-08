import "server-only";

import { HttpError } from "@/lib/auth/guards";

/**
 * reCAPTCHA v3 sur les formulaires publics.
 *
 * Google ne rend pas un verdict mais une note de 0 à 1 : à l'association de
 * fixer le seuil, dans Configuration. Le jeton est vérifié côté serveur —
 * seul endroit où la clé secrète existe — et pour l'action attendue, sans quoi
 * un jeton obtenu sur un formulaire servirait pour un autre.
 */

const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const TIMEOUT_MS = 6000;

export type RecaptchaAction = "inscription" | "contact" | "compte" | "motdepasse";

interface VerifyResponse {
  success?: boolean;
  score?: number;
  action?: string;
  "error-codes"?: string[];
}

async function callGoogle(
  secret: string,
  token: string,
  ip?: string | null,
): Promise<VerifyResponse | null> {
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as VerifyResponse;
  } catch {
    return null;
  }
}

/**
 * Confirme qu'une clé secrète est bien celle d'un compte reCAPTCHA, en la
 * présentant avec un jeton volontairement invalide : Google distingue le jeton
 * refusé (`invalid-input-response`) de la clé refusée (`invalid-input-secret`).
 */
export async function checkRecaptchaSecret(
  secret: string,
): Promise<
  { ok: true } | { ok: false; reason: "refused" | "unreachable" }
> {
  const payload = await callGoogle(secret, "verification-de-la-cle");
  if (!payload) return { ok: false, reason: "unreachable" };
  const codes = payload["error-codes"] ?? [];
  if (codes.includes("invalid-input-secret")) {
    return { ok: false, reason: "refused" };
  }
  return { ok: true };
}

/**
 * Vérifie le jeton d'un formulaire public.
 *
 * Une note trop basse ou un jeton refusé arrêtent l'envoi. En revanche, si
 * Google est injoignable, le formulaire passe : sur le site d'une association,
 * bloquer l'inscription d'un parent parce qu'un service tiers est en panne
 * coûte plus cher que de laisser filer un message indésirable. La panne est
 * journalisée.
 */
export async function verifyRecaptcha({
  secret,
  token,
  action,
  minScore,
  ip,
}: {
  secret: string;
  token: string | undefined | null;
  action: RecaptchaAction;
  /** Note minimale acceptée, de 0 à 1. */
  minScore: number;
  ip?: string | null;
}): Promise<void> {
  if (!token) {
    throw new HttpError(
      400,
      "Vérification anti-robot absente : rechargez la page, et si le problème persiste désactivez votre bloqueur de publicité sur ce site.",
    );
  }

  const payload = await callGoogle(secret, token, ip);
  if (!payload) {
    console.warn(
      "[recaptcha] service injoignable — formulaire accepté sans vérification",
    );
    return;
  }

  if (!payload.success) {
    const codes = payload["error-codes"] ?? [];
    // Une clé serveur invalide est une erreur d'exploitation, pas la faute du
    // visiteur : elle ne doit pas lui fermer le formulaire au nez.
    if (codes.includes("invalid-input-secret")) {
      console.error(
        "[recaptcha] clé secrète refusée par Google — formulaire accepté sans vérification",
      );
      return;
    }
    throw new HttpError(
      400,
      "Vérification anti-robot échouée. Rechargez la page et réessayez.",
    );
  }

  if (payload.action && payload.action !== action) {
    throw new HttpError(
      400,
      "Vérification anti-robot invalide. Rechargez la page et réessayez.",
    );
  }

  if (typeof payload.score === "number" && payload.score < minScore) {
    throw new HttpError(
      400,
      "Votre envoi a été pris pour celui d’un robot. Réessayez, ou écrivez directement à l’association.",
    );
  }
}
