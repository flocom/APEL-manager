import "server-only";

import { createHash } from "node:crypto";

import { EncryptJWT, jwtDecrypt } from "jose";
import { z } from "zod";

/**
 * Le lien qui confirme un changement de réponse à une réunion.
 *
 * Quand quelqu'un répond depuis la page publique avec une adresse qui a déjà
 * répondu, rien n'est modifié : un lien part à cette adresse, et c'est son
 * titulaire qui confirme. Sans cela, connaître l'adresse d'un parent suffisait
 * pour changer sa réponse, son nom et son téléphone dans la liste que lit le
 * bureau.
 *
 * Le changement demandé voyage dans le lien lui-même, chiffré et signé
 * (JWE, AES-256-GCM) : aucune table à créer, et rien à nettoyer pour les liens
 * jamais ouverts. Chiffré et pas seulement signé, parce qu'il porte un nom et
 * un numéro de téléphone, et qu'une URL finit dans des journaux de serveur
 * et dans l'historique d'un navigateur.
 *
 * Le lien est à usage unique sans rien stocker : il emporte la date de
 * dernière modification de la réponse, et ne s'applique que si elle n'a pas
 * bougé. Une fois le changement fait, cette date change, et le lien — comme
 * tout lien plus ancien — ne sert plus.
 *
 * La clé est dérivée du secret de session avec un libellé propre : un jeton
 * de ce type ne peut pas être pris pour un autre, ni l'inverse.
 */

/** Durée de validité : deux jours, le temps de lire un e-mail sans se presser. */
const VALIDITE = "48h";

const payloadSchema = z.object({
  /** La réponse visée. */
  a: z.string().uuid(),
  /** La réunion, contrôlée à l'arrivée. */
  e: z.string().uuid(),
  s: z.enum(["yes", "maybe", "no"]),
  n: z.string().min(1).max(200),
  p: z.string().max(60).nullable(),
  /** Date de dernière modification de la réponse, en millisecondes. */
  u: z.number().int(),
});

export type PresenceChange = {
  attendanceId: string;
  eventId: string;
  status: "yes" | "maybe" | "no";
  name: string;
  phone: string | null;
  /** `updatedAt` de la réponse au moment de la demande. */
  updatedAtMs: number;
};

function cle(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET est manquant ou trop court.");
  }
  return new Uint8Array(
    createHash("sha256")
      .update(`apel-manager:changement-de-presence:${secret}`)
      .digest(),
  );
}

export async function sealPresenceChange(
  change: PresenceChange,
): Promise<string> {
  return new EncryptJWT({
    a: change.attendanceId,
    e: change.eventId,
    s: change.status,
    n: change.name,
    p: change.phone,
    u: change.updatedAtMs,
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(VALIDITE)
    .encrypt(cle());
}

/** Le changement porté par le lien, ou `null` s'il est illisible ou expiré. */
export async function openPresenceChange(
  token: string,
): Promise<PresenceChange | null> {
  // Un jeton de cette forme fait quelques centaines de caractères ; au-delà,
  // ce n'en est pas un, inutile de le déchiffrer.
  if (token.length > 2000) return null;
  try {
    const { payload } = await jwtDecrypt(token, cle());
    const lu = payloadSchema.safeParse(payload);
    if (!lu.success) return null;
    return {
      attendanceId: lu.data.a,
      eventId: lu.data.e,
      status: lu.data.s,
      name: lu.data.n,
      phone: lu.data.p,
      updatedAtMs: lu.data.u,
    };
  } catch {
    return null;
  }
}
