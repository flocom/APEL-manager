import { estHelloAsso } from "@/lib/ticketing";

/**
 * Le formulaire HelloAsso désigné par une adresse publique :
 * `https://www.helloasso.com/associations/<organisme>/adhesions/<formulaire>`.
 *
 * Fichier sans dépendance serveur : l'écran des réglages s'en sert pendant la
 * frappe pour dire si la synchronisation est possible.
 */
export type HelloAssoFormType =
  | "Membership"
  | "PaymentForm"
  | "Donation"
  | "Event"
  | "Shop"
  | "CrowdFunding";

export type HelloAssoFormRef = {
  organizationSlug: string;
  formType: HelloAssoFormType;
  formSlug: string;
  /** Adresse publique nettoyée (sans suffixe de widget ni requête). */
  url: string;
};

/**
 * Segment de l'adresse publique → type de formulaire de l'API v5. Une Map, pas
 * un objet littéral : `types["constructor"]` rendrait une fonction.
 */
const FORM_TYPES = new Map<string, HelloAssoFormType>([
  ["adhesions", "Membership"],
  ["paiements", "PaymentForm"],
  ["formulaires", "Donation"],
  ["evenements", "Event"],
  ["boutiques", "Shop"],
  ["collectes", "CrowdFunding"],
]);

/**
 * Formulaires dont les paiements sont des cotisations : une adhésion, ou un
 * formulaire de paiement que l'association utilise pour la cotisation. Une
 * billetterie ou une boutique collée par erreur dans « Comment régler » ne
 * doit pas créer d'adhérents.
 */
export const SYNCABLE_FORM_TYPES: readonly HelloAssoFormType[] = [
  "Membership",
  "PaymentForm",
];

// Slug HelloAsso : lettres minuscules, chiffres et tirets.
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?$/;

/** Lit une adresse HelloAsso ; `null` si ce n'est pas un formulaire HelloAsso. */
export function parseHelloAssoFormUrl(
  url: string | null | undefined,
): HelloAssoFormRef | null {
  const brut = (url ?? "").trim();
  if (!brut) return null;
  let adresse: URL;
  try {
    adresse = new URL(/^[a-z][a-z0-9+.-]*:/i.test(brut) ? brut : `https://${brut}`);
  } catch {
    return null;
  }
  if (adresse.protocol !== "https:" && adresse.protocol !== "http:") return null;
  if (!estHelloAsso(adresse.hostname.toLowerCase())) return null;
  let segments: string[];
  try {
    segments = adresse.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment).toLowerCase());
  } catch {
    // « %E0%A4 » : un pourcentage orphelin fait lever `decodeURIComponent`.
    // Sans ce garde-fou, une phrase mal collée cassait la page des réglages
    // et la liste des adhérents, qui lisent ce lien au rendu.
    return null;
  }
  if (segments[0] !== "associations" || segments.length < 4) return null;
  const [, organizationSlug, typeSegment, formSlug] = segments;
  const formType = FORM_TYPES.get(typeSegment);
  if (!formType || !SLUG.test(organizationSlug) || !SLUG.test(formSlug)) {
    return null;
  }
  return {
    organizationSlug,
    formType,
    formSlug,
    url: `https://www.helloasso.com/associations/${organizationSlug}/${typeSegment}/${formSlug}`,
  };
}

// Mêmes règles que `splitPaymentNote` (src/components/payment-note.tsx).
const URL_PATTERN = /(https?:\/\/[^\s<>"«»]+|www\.[^\s<>"«»]+)/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

/** Tous les formulaires HelloAsso cités dans une phrase « Comment régler ». */
export function findHelloAssoForms(
  note: string | null | undefined,
): HelloAssoFormRef[] {
  const forms: HelloAssoFormRef[] = [];
  for (const match of (note ?? "").matchAll(URL_PATTERN)) {
    const form = parseHelloAssoFormUrl(
      match[0].replace(TRAILING_PUNCTUATION, ""),
    );
    if (form && !forms.some((f) => f.url === form.url)) forms.push(form);
  }
  return forms;
}

/**
 * Le formulaire des cotisations : le premier lien HelloAsso d'adhésion (ou de
 * paiement) de la phrase « Comment régler ». `null` s'il n'y en a pas.
 */
export function findMembershipForm(
  note: string | null | undefined,
): HelloAssoFormRef | null {
  const forms = findHelloAssoForms(note);
  return (
    forms.find((f) => f.formType === "Membership") ??
    forms.find((f) => SYNCABLE_FORM_TYPES.includes(f.formType)) ??
    null
  );
}

/**
 * Un lien HelloAsso figure dans la phrase, mais aucun n'est synchronisable
 * (billetterie, boutique…) : l'écran le dit au lieu de proposer les clés.
 */
export function hasHelloAssoLink(note: string | null | undefined): boolean {
  for (const match of (note ?? "").matchAll(URL_PATTERN)) {
    try {
      const raw = match[0].replace(TRAILING_PUNCTUATION, "");
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (estHelloAsso(u.hostname.toLowerCase())) return true;
    } catch {
      // adresse illisible : ignorée
    }
  }
  return false;
}
