import { createHash, randomBytes } from "node:crypto";

/** Jeton URL-safe pour les liens publics (partage, désinscription, reset…). */
export function generateToken(bytes = 18): string {
  return randomBytes(bytes).toString("base64url");
}

/** Jeton public pour les liens d'inscription bénévoles (alias historique). */
export function generateShareToken(): string {
  return generateToken(12);
}

/** Empreinte SHA-256 d'un jeton, à stocker en base (on ne stocke jamais le jeton brut). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
