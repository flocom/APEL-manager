import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import "server-only";

import { HttpError } from "@/lib/auth/guards";
import { deriveKeyFromAuthSecret } from "@/lib/auth/secrets";

/**
 * Chiffrement des secrets saisis dans Configuration (SMTP, Resend, Telegram,
 * reCAPTCHA, clé VAPID).
 *
 * Deux formats cohabitent, et l'étiquette dit la clé, jamais l'inverse :
 * - `v1` : clé = SHA-256 de SETTINGS_ENCRYPTION_KEY ou, à défaut,
 *   d'AUTH_SECRET — le même secret qui signe les sessions ;
 * - `v2` : clé tirée d'AUTH_SECRET par HKDF, propre à cet usage
 *   (lib/auth/secrets.ts).
 *
 * Avec SETTINGS_ENCRYPTION_KEY — toujours le cas sous Docker, où le point
 * d'entrée la génère —, on écrit encore `v1` : la clé est déjà dédiée au
 * chiffrement, et une étiquette nouvelle n'y ajouterait rien, sinon rendre
 * les identifiants illisibles à la version précédente après un retour en
 * arrière (docs/DOCKER.md) : plus un e-mail ne partirait, et les abonnements
 * aux notifications tomberaient avec la clé VAPID régénérée.
 *
 * Sans elle, un secret réenregistré passe en `v2`, pour ne plus chiffrer avec
 * la clé des sessions. Rien ne convertit ceux qu'on ne retouche pas : une
 * version antérieure ne sait pas lire `v2`, et chaque secret converti de
 * force serait à ressaisir après un retour en arrière (docs/DEPLOIEMENT.md).
 */

function sourceDediee(): string | null {
  const dediee = process.env.SETTINGS_ENCRYPTION_KEY?.trim();
  if (!dediee) return null;
  if (dediee.length < 32) {
    throw new HttpError(
      500,
      "SETTINGS_ENCRYPTION_KEY doit contenir au moins 32 caractères.",
    );
  }
  return dediee;
}

/** La clé historique (`v1`). */
function cleV1(): Buffer {
  const source = sourceDediee() ?? process.env.AUTH_SECRET?.trim();
  if (!source || source.length < 32) {
    throw new HttpError(
      500,
      "SETTINGS_ENCRYPTION_KEY doit contenir au moins 32 caractères.",
    );
  }
  return createHash("sha256").update(source).digest();
}

/**
 * La clé `v2`, tirée d'AUTH_SECRET même quand SETTINGS_ENCRYPTION_KEY est
 * définie : un secret écrit en `v2` avant qu'on ajoute cette variable reste
 * ainsi lisible après.
 */
function cleV2(): Buffer {
  // Même plancher qu'en `v1` : un AUTH_SECRET plus court ne chiffrait déjà rien.
  if ((process.env.AUTH_SECRET?.trim().length ?? 0) < 32) {
    throw new HttpError(
      500,
      "SETTINGS_ENCRYPTION_KEY doit contenir au moins 32 caractères.",
    );
  }
  return deriveKeyFromAuthSecret("chiffrement-des-reglages");
}

export function encryptSecret(secret: string): string {
  const cleDediee = sourceDediee() !== null;
  const version = cleDediee ? "v1" : "v2";
  const cle = cleDediee ? cleV1() : cleV2();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cle, iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [version, iv, tag, encrypted]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decryptSecret(payload: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(".");
  if (
    (version !== "v1" && version !== "v2") ||
    !ivRaw ||
    !tagRaw ||
    !encryptedRaw
  ) {
    throw new Error("Format de secret chiffré invalide.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    version === "v1" ? cleV1() : cleV2(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
