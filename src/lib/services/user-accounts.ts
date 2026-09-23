import "server-only";

import { createHash } from "node:crypto";

import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";

import { HttpError } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { oauthTokens, users, type Role } from "@/lib/db/schema";

import { recordAudit, type AuditActor } from "./audit";

/**
 * Les comptes de l'application : validation, refus, changement de rôle.
 *
 * Ces opérations sont partagées entre l'écran « Utilisateurs » et les outils
 * MCP. Elles vivaient en double dans les deux, et un seul des deux journalisait
 * : c'est précisément le genre d'écart qu'un audit relève après coup.
 */

/**
 * L'identifiant d'un compte tel qu'il arrive dans une URL, vérifié.
 *
 * Postgres rejette une chaîne qui n'est pas un UUID par une erreur de syntaxe
 * que `handleApiError` ne sait pas lire : un lien tronqué ou retouché valait
 * « erreur serveur » au lieu de « introuvable ». Le contrôle se fait avant
 * toute requête, pour toutes les routes qui reçoivent un compte par l'URL.
 */
export function parseAccountId(id: string): string {
  if (!z.string().uuid().safeParse(id).success) {
    throw new HttpError(404, "Compte introuvable.");
  }
  return id;
}

/**
 * Empreinte SHA-256 d'une adresse, casse et espaces normalisés : la même
 * adresse donne toujours la même empreinte, quelle que soit sa saisie.
 */
function empreinteAdresse(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/**
 * Nombre de comptes qui attendent qu'un administrateur les valide.
 *
 * Mémoïsé par requête : le layout du tableau de bord (pastille du menu) et la
 * page d'accueil (bandeau) le demandent tous deux au même rendu.
 */
export const countPendingAccounts = cache(async (): Promise<number> => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(isNull(users.approvedAt));
  return Number(row?.count ?? 0);
});

/**
 * Coupe les jetons MCP d'un compte.
 *
 * Les sessions web, elles, tombent par l'incrément de `sessionEpoch`, fait dans
 * la même requête que le changement de droits. Les jetons OAuth ne connaissent
 * pas cette époque : sans cette révocation, un connecteur autorisé avant une
 * rétrogradation garderait la portée « écriture » accordée à l'ancien rôle.
 */
async function revokeOAuthTokens(userId: string) {
  await db
    .update(oauthTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(oauthTokens.userId, userId), isNull(oauthTokens.revokedAt)));
}

/**
 * Valide un compte en attente.
 *
 * La condition `approved_at IS NULL` est dans la requête, pas dans un test
 * préalable : deux administrateurs qui valident au même moment ne produisent
 * qu'une validation, et une seule ligne de journal.
 *
 * L'époque de session est incrémentée : la session ouverte pendant l'attente
 * est close, et la personne se reconnecte sur un compte qui voit désormais
 * l'espace. Garder une session émise pour un compte sans droits, puis lui en
 * donner, c'est exactement ce qu'on évite partout ailleurs.
 */
export async function approveAccount(id: string, actor: AuditActor) {
  const [approved] = await db
    .update(users)
    .set({
      approvedAt: new Date(),
      approvedBy: actor.userId,
      sessionEpoch: sql`${users.sessionEpoch} + 1`,
    })
    .where(and(eq(users.id, id), isNull(users.approvedAt)))
    .returning({ id: users.id, name: users.name, email: users.email });

  if (!approved) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    throw existing
      ? new HttpError(409, "Ce compte a déjà été validé.")
      : new HttpError(404, "Compte introuvable.");
  }

  await recordAudit(actor, "user.approve", "user", approved.id, {
    email: approved.email,
  });
  return approved;
}

/**
 * Refuse un compte en attente : il est supprimé.
 *
 * Ne supprime qu'un compte ENCORE en attente. Le bouton « Refuser » d'un écran
 * resté ouvert ne doit pas effacer un compte qu'un autre administrateur vient
 * de valider : la suppression d'un compte actif reste un geste à part, avec sa
 * propre confirmation.
 */
export async function refuseAccount(id: string, actor: AuditActor) {
  const [refused] = await db
    .delete(users)
    .where(and(eq(users.id, id), isNull(users.approvedAt)))
    .returning({ id: users.id, name: users.name, email: users.email });

  if (!refused) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    throw existing
      ? new HttpError(
          409,
          "Ce compte a été validé entre-temps : il ne peut plus être refusé, seulement supprimé.",
        )
      : new HttpError(404, "Compte introuvable.");
  }

  // Au journal, une empreinte de l'adresse, ni l'adresse ni le nom. Le journal
  // ne se purge jamais, et la personne refusée n'a aucun lien avec
  // l'association : garder ses coordonnées pour toujours n'aurait pas de
  // justification. L'empreinte suffit à voir qu'une même adresse revient —
  // deux refus portent la même — sans permettre de la relire.
  await recordAudit(actor, "user.refuse", "user", refused.id, {
    emailHash: empreinteAdresse(refused.email),
  });
  return refused;
}

/**
 * Change le rôle d'un compte validé.
 *
 * Un changement de rôle ferme les sessions en cours et les jetons MCP : les
 * droits se relisent déjà en base à chaque requête, mais un jeton OAuth garde
 * la portée accordée à l'ancien rôle, et une session ouverte sur un écran
 * garde ce qu'il a déjà chargé. Rien ne change si le rôle est le même — un
 * clic sans effet ne doit déconnecter personne.
 */
export async function changeUserRole(
  id: string,
  role: Role,
  actor: AuditActor,
) {
  // Un admin ne peut pas se retirer lui-même ses droits (anti-verrouillage).
  if (id === actor.userId && role !== "admin") {
    throw new HttpError(
      400,
      "Vous ne pouvez pas retirer votre propre rôle administrateur.",
    );
  }

  const [existing] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      approvedAt: users.approvedAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!existing) throw new HttpError(404, "Utilisateur introuvable.");
  // Donner un rôle à un compte en attente le laisserait en attente : la
  // validation est un geste distinct, qu'on ne doit pas croire avoir fait.
  if (!existing.approvedAt) {
    throw new HttpError(
      409,
      "Ce compte est en attente : validez-le avant de changer son rôle.",
    );
  }

  const [updated] = await db
    .update(users)
    .set({ role, sessionEpoch: sql`${users.sessionEpoch} + 1` })
    .where(
      and(eq(users.id, id), ne(users.role, role), isNotNull(users.approvedAt)),
    )
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    });
  if (!updated) {
    return {
      user: {
        id: existing.id,
        name: existing.name,
        email: existing.email,
        role: existing.role,
      },
      changed: false,
    };
  }

  await revokeOAuthTokens(id);
  await recordAudit(actor, "user.role_update", "user", id, {
    from: existing.role,
    role,
  });
  return { user: updated, changed: true };
}

/**
 * Supprime un compte. Ses sessions tombent avec lui (la session relit le compte
 * à chaque requête) et ses jetons MCP partent en cascade.
 */
export async function deleteUserAccount(id: string, actor: AuditActor) {
  if (id === actor.userId) {
    throw new HttpError(400, "Vous ne pouvez pas supprimer votre propre compte.");
  }
  const [deleted] = await db
    .delete(users)
    .where(eq(users.id, id))
    .returning({ id: users.id, email: users.email });
  if (!deleted) throw new HttpError(404, "Utilisateur introuvable.");
  await recordAudit(actor, "user.delete", "user", id);
  return deleted;
}
