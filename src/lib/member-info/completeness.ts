/**
 * Ce qui manque à une fiche d'adhérent pour le tableau des familles
 * adhérentes de l'Apel départementale (UDAPEL).
 *
 * Deux niveaux :
 * - `required` : sans cela, la famille ne peut pas être déclarée — l'adresse
 *   postale complète (voie ou lieu-dit, code postal, ville, pays), la
 *   civilité, et l'établissement quand la part nationale est réglée ailleurs ;
 * - `recommended` : utile au bureau mais pas bloquant — téléphone, e-mail,
 *   numéro dans la voie.
 *
 * Pur et sans dépendance serveur : la liste des adhérents, la fiche, le
 * formulaire public et l'envoi des relances lisent les mêmes règles.
 */

export const CIVILITIES = ["M", "Mme", "Mrme"] as const;
export type Civility = (typeof CIVILITIES)[number];

export const CIVILITY_LABELS: Record<Civility, string> = {
  M: "Monsieur",
  Mme: "Madame",
  Mrme: "Monsieur et Madame",
};

export function isCivility(value: unknown): value is Civility {
  return typeof value === "string" && (CIVILITIES as readonly string[]).includes(value);
}

export type MemberInfoField =
  | "civility"
  | "street"
  | "postalCode"
  | "city"
  | "country"
  | "otherSchoolName"
  | "phone"
  | "email"
  | "streetNumber";

/** Champs sans lesquels la famille ne peut pas être déclarée (`required`). */
export const REQUIRED_MEMBER_INFO_FIELDS: readonly MemberInfoField[] = [
  "civility",
  "street",
  "postalCode",
  "city",
  "country",
  "otherSchoolName",
];

/** Libellés lus par le bureau et par les familles (« Il manque : … »). */
export const MEMBER_INFO_FIELD_LABELS: Record<MemberInfoField, string> = {
  civility: "Civilité",
  street: "Adresse (voie ou lieu-dit)",
  postalCode: "Code postal",
  city: "Ville",
  country: "Pays",
  otherSchoolName: "Établissement où la part nationale est réglée",
  phone: "Téléphone",
  email: "Adresse e-mail",
  streetNumber: "Numéro dans la voie",
};

export type MemberInfoInput = {
  civility?: string | null;
  streetNumber?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  locality?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  nationalFeeElsewhere?: boolean | null;
  otherSchoolName?: string | null;
};

export type MemberCompleteness = {
  required: MemberInfoField[];
  recommended: MemberInfoField[];
  /** Rien d'obligatoire ne manque. */
  complete: boolean;
  /** L'adresse postale (voie ou lieu-dit, code postal, ville, pays) est complète. */
  addressComplete: boolean;
};

function filled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Un code postal français : cinq chiffres (« 85100 », « 2A004 » n'en est pas un). */
export function isFrenchPostalCode(value: string): boolean {
  return /^\d{5}$/.test(value.replace(/\s+/g, ""));
}

export function isFrance(country: string | null | undefined): boolean {
  const c = (country ?? "").trim().toLowerCase();
  return c === "" || c === "france" || c === "fr" || c === "fra";
}

export function memberCompleteness(member: MemberInfoInput): MemberCompleteness {
  const required: MemberInfoField[] = [];
  const recommended: MemberInfoField[] = [];

  if (!isCivility(member.civility)) required.push("civility");
  // Un lieu-dit sans nom de voie suffit à La Poste : l'un ou l'autre.
  if (!filled(member.addressLine1) && !filled(member.locality)) {
    required.push("street");
  }
  const postal = (member.postalCode ?? "").trim();
  if (!postal || (isFrance(member.country) && !isFrenchPostalCode(postal))) {
    required.push("postalCode");
  }
  if (!filled(member.city)) required.push("city");
  if (!filled(member.country)) required.push("country");
  if (member.nationalFeeElsewhere && !filled(member.otherSchoolName)) {
    required.push("otherSchoolName");
  }

  if (!filled(member.phone)) recommended.push("phone");
  if (!filled(member.email)) recommended.push("email");
  if (filled(member.addressLine1) && !filled(member.streetNumber)) {
    recommended.push("streetNumber");
  }

  const addressFields: MemberInfoField[] = ["street", "postalCode", "city", "country"];
  return {
    required,
    recommended,
    complete: required.length === 0,
    addressComplete: !required.some((field) => addressFields.includes(field)),
  };
}

/**
 * Sépare le numéro d'une voie saisie d'un bloc (« 12 bis rue des Lilas » →
 * « 12 bis » + « rue des Lilas »), pour les fiches d'avant le champ dédié.
 * Rien n'est séparé quand la voie ne commence pas par un numéro.
 */
export function splitStreetNumber(street: string | null | undefined): {
  number: string | null;
  street: string | null;
} {
  const value = (street ?? "").trim();
  if (!value) return { number: null, street: null };
  const match = value.match(
    /^(\d{1,5}(?:\s?(?:bis|ter|quater|quinquies|[a-d]))?)\b[\s,]+(.+)$/i,
  );
  if (!match) return { number: null, street: value };
  return { number: match[1].replace(/\s+/g, " "), street: match[2].trim() };
}
