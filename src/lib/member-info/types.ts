/**
 * Contrat entre le serveur et les écrans pour les fiches d'adhérents à
 * compléter et le tableau de l'Apel départementale.
 *
 * Le déroulé :
 * 1. La liste des adhérents signale les fiches incomplètes
 *    (`memberCompleteness`, src/lib/member-info/completeness.ts).
 * 2. Le bureau relance d'un coup les familles concernées
 *    (`POST /api/adherents/relances`), ou une seule depuis sa fiche
 *    (`POST /api/adherents/[id]/relance`). Chaque famille reçoit par e-mail
 *    un lien personnel, valable 30 jours.
 * 3. La famille ouvre `/adhesion/[token]`, voit ce qui manque, complète et
 *    enregistre (`POST /api/adhesion/[token]`) : la fiche est mise à jour
 *    directement.
 * 4. `GET /api/adherents/export/udapel?schoolYear=2026-2027` produit le
 *    tableau des familles adhérentes au format de l'Apel départementale.
 *
 * Ce fichier ne contient que des types : il est importé des deux côtés.
 */
import type { Civility, MemberInfoField } from "@/lib/member-info/completeness";

/** `POST /api/adherents/relances` : prévisualiser (`dryRun`) ou envoyer. */
export type MemberRelanceRequest = {
  schoolYear: string;
  /**
   * `required` : seulement les fiches où il manque une information
   * obligatoire (adresse postale, civilité…) ; `any` : aussi celles où ne
   * manque que le téléphone ou le numéro de voie.
   */
  scope: "required" | "any";
  /** Relancer aussi les familles déjà relancées il y a moins de 7 jours. */
  includeRecent: boolean;
  /** Mot facultatif du bureau, ajouté en tête du message. */
  message?: string | null;
  /** Vrai : ne rien envoyer, rendre seulement qui serait relancé. */
  dryRun: boolean;
};

export type MemberRelanceTarget = {
  memberId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  missing: MemberInfoField[];
  /** Instant ISO de la dernière relance, s'il y en a une. */
  lastRequestedAt: string | null;
};

export type MemberRelanceResult = {
  /** Familles qui reçoivent (ou recevraient) le lien. */
  targets: MemberRelanceTarget[];
  /** Fiches incomplètes sans adresse e-mail : à contacter autrement. */
  withoutEmail: MemberRelanceTarget[];
  /** Fiches relancées il y a moins de 7 jours, laissées de côté. */
  recent: MemberRelanceTarget[];
  /** Après envoi : e-mails partis et échecs (0 en prévisualisation). */
  sent: number;
  failed: number;
  dryRun: boolean;
};

/** Historique des liens d'une fiche, affiché sur la fiche adhérent. */
export type MemberUpdateRequestView = {
  id: string;
  sentTo: string;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  revokedAt: string | null;
  createdByName: string | null;
};

/** Réponse de `POST /api/adherents/[id]/relance`. */
export type MemberSingleRelanceResult = {
  request: MemberUpdateRequestView;
};

/** Ce que voit la famille sur `/adhesion/[token]` (sa seule fiche). */
export type PublicMemberForm = {
  associationName: string;
  schoolYear: string;
  firstName: string;
  lastName: string;
  civility: Civility | null;
  email: string | null;
  phone: string | null;
  streetNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  locality: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  nationalFeeElsewhere: boolean;
  otherSchoolName: string | null;
  missing: MemberInfoField[];
  /** Instant ISO d'expiration du lien. */
  expiresAt: string;
};

/** `POST /api/adhesion/[token]` : ce que la famille peut modifier. */
export type PublicMemberUpdateInput = {
  civility: Civility;
  email: string | null;
  phone: string | null;
  streetNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  locality: string | null;
  postalCode: string;
  city: string;
  country: string;
  nationalFeeElsewhere: boolean;
  otherSchoolName: string | null;
};
