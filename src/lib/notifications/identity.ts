import "server-only";

import { getAssociationSettings } from "@/lib/services/association-settings";

import type { NotificationIdentity } from "./emails";
import { emailLogo } from "./logo";

/** Ce que les réglages de l'association fournissent à l'identité. */
interface IdentitySource {
  associationName: string;
  schoolName: string | null;
  rna: string | null;
  logoUrl: string | null;
}

/**
 * L'identité de l'expéditeur telle que les e-mails l'affichent : nom de
 * l'association, école, RNA, et le logo quand il y en a un.
 *
 * Une seule fabrique pour tous les envois. Chaque route recopiait jusqu'ici
 * ses trois champs à la main : ajouter le logo aurait voulu le faire quinze
 * fois, et l'envoi oublié serait resté sans logo sans que rien ne le signale.
 *
 * `association` évite de relire les réglages quand l'appelant les a déjà.
 * Pas d'adresse du site à passer : le logo ne se charge que depuis l'adresse
 * configurée, jamais depuis celle d'une requête (voir `emailLogo`).
 */
export async function getNotificationIdentity(
  association?: IdentitySource,
): Promise<NotificationIdentity> {
  const source = association ?? (await getAssociationSettings());
  return {
    associationName: source.associationName,
    schoolName: source.schoolName,
    rna: source.rna,
    logo: await emailLogo(source.logoUrl),
  };
}
