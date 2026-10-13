import type { associationMembers } from "@/lib/db/schema";
import type { PaymentMethod } from "@/lib/labels";
import { type Civility, isCivility } from "@/lib/member-info/completeness";

/**
 * Ce que les écrans des adhérents reçoivent d'une fiche : des dates en texte,
 * pour passer du serveur au navigateur sans changer de sens.
 */
export interface AdherentView {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  civility: Civility | null;
  /** Numéro dans la voie (« 12 bis »). */
  streetNumber: string | null;
  /** La voie. */
  addressLine1: string | null;
  /** Résidence, bâtiment, lotissement. */
  addressLine2: string | null;
  /** Lieu-dit ou commune déléguée. */
  locality: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  /** Part nationale réglée dans un autre établissement (`otherSchoolName`). */
  nationalFeeElsewhere: boolean;
  otherSchoolName: string | null;
  status: "active" | "pending" | "inactive";
  schoolYear: string;
  membershipFeeCents: number;
  /** Don facultatif versé en plus de la cotisation ; 0 sans don. */
  donationCents: number;
  feePaidAt: string | null;
  feePaymentMethod: PaymentMethod | null;
  joinedAt: string;
  notes: string | null;
  version: number;
}

export function adherentView(
  member: typeof associationMembers.$inferSelect,
): AdherentView {
  return {
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    phone: member.phone,
    civility: isCivility(member.civility) ? member.civility : null,
    streetNumber: member.streetNumber,
    addressLine1: member.addressLine1,
    addressLine2: member.addressLine2,
    locality: member.locality,
    postalCode: member.postalCode,
    city: member.city,
    country: member.country,
    nationalFeeElsewhere: member.nationalFeeElsewhere,
    otherSchoolName: member.otherSchoolName,
    status: member.status,
    schoolYear: member.schoolYear,
    membershipFeeCents: member.membershipFeeCents,
    donationCents: member.donationCents,
    feePaidAt: member.feePaidAt?.toISOString() ?? null,
    feePaymentMethod: member.feePaymentMethod,
    joinedAt: member.joinedAt.toISOString(),
    notes: member.notes,
    version: member.version,
  };
}

// ---------------------------------------------------------------------------
// Filtres de la liste, dans l'adresse
// ---------------------------------------------------------------------------

/**
 * La recherche et les filtres de la liste vivent dans son adresse
 * (`?q=…&statut=…&annee=…&fiche=incomplete`), et une fiche ouverte depuis
 * la liste reçoit les mêmes paramètres : son lien « Tous les adhérents » ramène à la liste telle
 * qu'on l'avait laissée, que l'on revienne par ce lien, par le bouton retour
 * du navigateur, ou après avoir rechargé la fiche.
 */
export interface FiltresAdherents {
  q: string;
  statut: "all" | AdherentView["status"];
  annee: string;
  /** `incomplete` : seulement les fiches où manque une information obligatoire. */
  fiche: "all" | "incomplete";
}

export const FILTRES_PAR_DEFAUT: FiltresAdherents = {
  q: "",
  statut: "all",
  annee: "all",
  fiche: "all",
};

const STATUTS = new Set(["active", "pending", "inactive"]);

type SourceParametres =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function lire(source: SourceParametres, nom: string): string {
  const valeur =
    source instanceof URLSearchParams ? source.get(nom) : source[nom];
  return (Array.isArray(valeur) ? valeur[0] : valeur) ?? "";
}

/**
 * Relit les filtres d'une adresse. Tout ce qui n'est pas une valeur attendue
 * retombe sur « tous » : un lien abîmé ouvre la liste entière, pas une liste
 * vide sans explication.
 */
export function filtresDepuis(source: SourceParametres): FiltresAdherents {
  const statut = lire(source, "statut");
  const annee = lire(source, "annee");
  return {
    q: lire(source, "q").slice(0, 100),
    statut: STATUTS.has(statut)
      ? (statut as AdherentView["status"])
      : "all",
    annee: /^\d{4}-\d{4}$/.test(annee) ? annee : "all",
    fiche: lire(source, "fiche") === "incomplete" ? "incomplete" : "all",
  };
}

/** `?q=…&statut=…`, ou une chaîne vide quand aucun filtre n'est posé. */
export function requeteFiltres(filtres: FiltresAdherents): string {
  const params = new URLSearchParams();
  if (filtres.q.trim()) params.set("q", filtres.q);
  if (filtres.statut !== "all") params.set("statut", filtres.statut);
  if (filtres.annee !== "all") params.set("annee", filtres.annee);
  if (filtres.fiche !== "all") params.set("fiche", filtres.fiche);
  const requete = params.toString();
  return requete ? `?${requete}` : "";
}
