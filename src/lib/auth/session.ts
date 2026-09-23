import { createHash, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { cache } from "react";

import { configuredBaseUrl } from "@/lib/base-url";
import { db } from "@/lib/db";
import { revokedSessions, users, type User } from "@/lib/db/schema";

import { AUTH_SECRET_MINIMUM, AUTH_SECRET_RECOMMANDE } from "./secrets";

const COOKIE_NAME = "apel_session";
const ALG = "HS256";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 jours

/** Utilisateur sans le hash du mot de passe — sûr à exposer côté serveur. */
export type SafeUser = Omit<User, "passwordHash">;

/**
 * La clé de signature des sessions : AUTH_SECRET lui-même, comme avant. Les
 * autres usages (chiffrement, consentement OAuth, limiteur) en dérivent des
 * clés à part (lib/auth/secrets.ts) ; changer celle-ci déconnecterait tout le
 * monde sans rien gagner.
 *
 * Un secret court mais au-dessus du plancher historique est accepté : le
 * refuser enfermerait dehors une installation existante. Le journal de
 * démarrage et l'écran Configuration le signalent (instrumentation.ts).
 */
function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < AUTH_SECRET_MINIMUM) {
    throw new Error(
      `AUTH_SECRET est manquant ou trop court. Définissez une chaîne aléatoire d'au moins ${AUTH_SECRET_RECOMMANDE} caractères.`,
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Le cookie ne part qu'en HTTPS dès que le site est servi en HTTPS.
 *
 * Seul le schéma d'APP_URL en décidait : un site servi en HTTPS derrière un
 * proxy, mais déclaré en `http://` (ou sans APP_URL hors production), posait
 * un cookie de session qu'une page en clair sur le même nom pouvait laisser
 * fuir. On regarde donc aussi ce que dit le reverse proxy
 * (`X-Forwarded-Proto`). Un client qui mentirait sur cet en-tête n'y gagne
 * rien : il ne ferait que marquer son propre cookie « Secure ».
 *
 * Sans APP_URL, la production reste en « Secure » par défaut ; seule une
 * APP_URL explicitement en `http://` (instance locale, test) l'enlève.
 */
async function shouldUseSecureCookies(): Promise<boolean> {
  const configured = configuredBaseUrl();
  if (configured.startsWith("https:")) return true;
  try {
    const proto = (await headers())
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim()
      .toLowerCase();
    if (proto === "https") return true;
  } catch {
    // Hors requête : on s'en tient à la configuration.
  }
  if (configured.startsWith("http:")) return false;
  return process.env.NODE_ENV === "production";
}

/**
 * Identifiant de la session, porté par le jeton. Les jetons émis avant son
 * introduction n'en ont pas : leur empreinte en tient lieu, pour qu'une
 * déconnexion les ferme aussi.
 */
function sessionIdOf(token: string, sid: unknown): string {
  if (typeof sid === "string" && sid.length >= 16 && sid.length <= 64) {
    return sid;
  }
  return `ancien:${createHash("sha256").update(token).digest("base64url").slice(0, 32)}`;
}

export async function createSession(
  userId: string,
  sessionEpoch: number,
): Promise<void> {
  const token = await new SignJWT({
    sub: userId,
    epoch: sessionEpoch,
    sid: randomBytes(16).toString("base64url"),
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: await shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

type JetonDeSession = {
  userId: string;
  epoch: number;
  sessionId: string;
  expiresAt: Date;
};

/** Le jeton du cookie, vérifié, sans toucher à la base. */
async function lireJeton(): Promise<JetonDeSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.sub !== "string") return null;
    return {
      userId: payload.sub,
      epoch: typeof payload.epoch === "number" ? payload.epoch : 0,
      sessionId: sessionIdOf(token, payload.sid),
      expiresAt: new Date(
        (typeof payload.exp === "number"
          ? payload.exp
          : Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS) * 1000,
      ),
    };
  } catch {
    return null;
  }
}

/** Efface le cookie de ce navigateur, sans rien noter en base. */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Se déconnecter : la session est fermée côté serveur, puis le cookie effacé.
 *
 * Effacer le cookie seul laissait le jeton valable sept jours : une copie
 * prise sur un ordinateur partagé, ou dans une sauvegarde du navigateur,
 * rouvrait la session après la déconnexion. Le jeton est désormais inscrit
 * parmi les sessions fermées jusqu'à son échéance.
 */
export async function destroySession(): Promise<void> {
  const jeton = await lireJeton();
  if (jeton) {
    await db
      .insert(revokedSessions)
      .values({
        sessionId: jeton.sessionId,
        userId: jeton.userId,
        expiresAt: jeton.expiresAt,
      })
      .onConflictDoNothing()
      .catch((erreur: unknown) => {
        // Un compte supprimé entre-temps : la clé étrangère refuse la ligne, et
        // il n'y a de toute façon plus rien à fermer. Toute autre erreur
        // remonte : avaler une panne passagère de la base répondait « vous
        // êtes déconnecté » et effaçait le cookie, alors que le jeton restait
        // valable sept jours pour qui en avait gardé une copie.
        if (estViolationDeCleEtrangere(erreur)) return;
        throw erreur;
      });
  }
  await clearSessionCookie();
}

/** SQLSTATE 23503, que Drizzle range parfois dans `cause`. */
function estViolationDeCleEtrangere(erreur: unknown): boolean {
  const e = erreur as { code?: unknown; cause?: { code?: unknown } } | null;
  return e?.code === "23503" || e?.cause?.code === "23503";
}

/**
 * Lit le cookie de session, vérifie le JWT, puis recharge l'utilisateur depuis
 * la base (pour que les changements de rôle prennent effet immédiatement).
 *
 * La liste des sessions fermées est lue dans la même requête, par une
 * jointure sur sa clé primaire : la déconnexion côté serveur ne coûte pas un
 * aller-retour de plus par page.
 *
 * Mémoïsé par `cache()` : plusieurs appels pendant le rendu d'une même requête
 * (layout + page, gardes…) ne déclenchent qu'une seule requête SQL.
 */
export const getCurrentUser = cache(async (): Promise<SafeUser | null> => {
  const jeton = await lireJeton();
  if (!jeton) return null;

  const rows = await db
    .select({ user: users, fermee: revokedSessions.sessionId })
    .from(users)
    .leftJoin(revokedSessions, eq(revokedSessions.sessionId, jeton.sessionId))
    .where(eq(users.id, jeton.userId))
    .limit(1);

  const ligne = rows[0];
  if (!ligne || ligne.fermee) return null;
  const user = ligne.user;

  // Session émise avant un changement de mot de passe, ou avant un « se
  // déconnecter de tous les appareils » → invalide.
  if (jeton.epoch !== user.sessionEpoch) return null;

  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
});
