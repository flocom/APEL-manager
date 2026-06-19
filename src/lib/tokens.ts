import { randomBytes } from "node:crypto";

/** Jeton URL-safe pour les liens publics d'inscription bénévoles. */
export function generateShareToken(): string {
  return randomBytes(12).toString("base64url");
}
