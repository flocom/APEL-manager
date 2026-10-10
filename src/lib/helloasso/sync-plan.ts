import { fromZonedTime } from "date-fns-tz";

import { APP_TIMEZONE } from "@/lib/dates";
import type { HelloAssoApiItem } from "@/lib/helloasso/client";

/**
 * Ce que la synchronisation tire des lignes HelloAsso, sans base ni réseau :
 * l'état de chaque adhésion, les montants, le don rattaché, l'identité et
 * l'adresse à reporter sur la fiche, et la recherche d'un adhérent existant.
 *
 * Tout est pur, pour se vérifier sur des lignes écrites à la main ; le
 * service (`src/lib/services/helloasso.ts`) décide ensuite sous verrou.
 */

/**
 * - `valid` : payée (ou saisie par l'association), à importer ;
 * - `pending` : paiement pas encore encaissé (prélèvement SEPA…) ;
 * - `refunded` : remboursée, annulée ou refusée — plus valable ;
 * - `ignored` : état inconnu, laissée de côté.
 */
export type HelloAssoItemStatus = "valid" | "pending" | "refunded" | "ignored";

/** Une adhésion lue sur HelloAsso, prête à être rapprochée des fiches. */
export type PlannedMembership = {
  itemId: string;
  orderId: string;
  orderDate: Date;
  status: Exclude<HelloAssoItemStatus, "ignored">;
  firstName: string;
  lastName: string;
  /**
   * Adresse du payeur, quand c'est bien celle de l'adhérent : seule adhésion
   * de la commande, ou adhérent qui est lui-même le payeur. Un parent qui
   * paie pour trois enfants ne donne pas son adresse à chacun.
   */
  email: string | null;
  /** Cotisation : prix de la ligne + options, contribution HelloAsso exclue. */
  feeCents: number;
  /** Don de la commande, porté par sa première adhésion valable seulement. */
  donationCents: number;
  addressLine1: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
};

export type HelloAssoSyncPlan = {
  /** Adhésions lues (dons exclus), y compris celles laissées de côté. */
  fetched: number;
  memberships: PlannedMembership[];
};

/** Lignes qui ne sont pas des adhésions mais des dons faits en même temps. */
const DONATION_TYPES = new Set(["donation", "monthlydonation", "offlinedonation"]);
/**
 * Lignes qui font un adhérent : une adhésion, ou le paiement d'un formulaire
 * de paiement utilisé pour la cotisation. Le reste (produit, assurance,
 * bonus…) ne crée personne.
 */
const MEMBERSHIP_TYPES = new Set(["membership", "payment", "monthlypayment"]);

const VALID_STATES = new Set(["processed", "registered"]);
const CANCELLED_STATES = new Set(["canceled", "refused", "abandoned", "deleted"]);
/**
 * Paiements encaissés (`Registered` : saisi hors ligne par l'association ;
 * `AuthorizedPreprod` : l'équivalent d'`Authorized` dans le bac à sable).
 */
const PAID_PAYMENT_STATES = new Set(["authorized", "registered", "authorizedpreprod"]);
/** Remboursé, ou contesté par la banque du payeur : l'argent repart. */
const REFUNDED_PAYMENT_STATES = new Set(["refunded", "refunding", "contested"]);
const PENDING_PAYMENT_STATES = new Set([
  "pending",
  "waiting",
  "waitingbankvalidation",
  "waitingbankwithdraw",
  "waitingauthentication",
  "init",
]);
/** Paiements qui n'ont jamais abouti (carte refusée, prélèvement rejeté…). */
const FAILED_PAYMENT_STATES = new Set([
  "refused",
  "canceled",
  "abandoned",
  "error",
  "deleted",
]);
/** Plafond des montants d'une fiche (`associationMemberSchema`). */
const MAX_CENTS = 10_000_000;
/** Identifiants HelloAsso : des entiers, ou à défaut une chaîne courte. */
const API_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Codes pays ISO 3166 alpha-3 que HelloAsso renvoie le plus souvent. */
const COUNTRIES = new Map([
  ["FRA", "France"],
  ["BEL", "Belgique"],
  ["CHE", "Suisse"],
  ["LUX", "Luxembourg"],
  ["MCO", "Monaco"],
  ["ESP", "Espagne"],
  ["ITA", "Italie"],
  ["DEU", "Allemagne"],
  ["GBR", "Royaume-Uni"],
]);

// Ni espace ni caractère de contrôle : Postgres refuse le caractère nul,
// et une seule fiche fautive ferait échouer toute la synchronisation.
const EMAIL = /^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

function lower(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Saisie du payeur, ramenée à une ligne et aux limites de la fiche. Une
 * valeur qui ne serait pas une chaîne (réponse inattendue) compte pour vide.
 */
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max).trim() : null;
}

function cents(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(Math.round(value), MAX_CENTS)
    : 0;
}

/** Un identifiant HelloAsso utilisable (clé d'unicité en base) ; null sinon. */
export function apiId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  return typeof value === "string" && API_ID.test(value) ? value : null;
}

export function isDonationItem(item: HelloAssoApiItem): boolean {
  return DONATION_TYPES.has(lower(item.type));
}

/** Une ligne d'adhésion ; sans type annoncé, la ligne d'un formulaire d'adhésion en est une. */
export function isMembershipItem(item: HelloAssoApiItem): boolean {
  const type = lower(item.type);
  return type === "" || MEMBERSHIP_TYPES.has(type);
}

/**
 * Nom comparable : sans accents, sans casse, sans espaces, tirets ni
 * apostrophes. « Lefèvre-Durand » et « LEFEVRE DURAND » se rejoignent.
 */
export function normalizeName(value: unknown): string {
  return (typeof value === "string" ? value : "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\s\-'’‘.,_]+/g, "");
}

export function nameKey(firstName: unknown, lastName: unknown): string {
  return `${normalizeName(lastName)}|${normalizeName(firstName)}`;
}

/** Adresse e-mail comparable ; null si absente ou mal formée. */
export function normalizeEmail(value: unknown): string | null {
  const email = lower(value);
  return email && email.length <= 254 && EMAIL.test(email) ? email : null;
}

/** Cotisation d'une ligne : son prix (remise déduite) et ses options. */
export function itemAmountCents(item: HelloAssoApiItem): number {
  const options = Array.isArray(item.options) ? item.options : [];
  return Math.min(
    cents(item.amount) +
      options.reduce((sum, option) => sum + cents(option?.amount), 0),
    MAX_CENTS,
  );
}

/**
 * L'état effectif d'une ligne, d'après son état et ceux de ses paiements.
 * Un remboursement passe le paiement en `Refunded` et la ligne en
 * `Canceled` ; un prélèvement SEPA reste `WaitingBankValidation` quelques
 * jours ; une échéance future (`Pending`) n'empêche pas une adhésion dont la
 * première échéance est encaissée d'être valable.
 */
export function classifyItem(item: HelloAssoApiItem): HelloAssoItemStatus {
  const state = lower(item.state);
  if (CANCELLED_STATES.has(state)) return "refunded";
  const payments = (Array.isArray(item.payments) ? item.payments : []).map(
    (p) => lower(p?.state),
  );
  const paid = payments.some((p) => PAID_PAYMENT_STATES.has(p));
  if (!paid && payments.some((p) => REFUNDED_PAYMENT_STATES.has(p))) {
    return "refunded";
  }
  // Tous les paiements ont échoué (carte refusée, prélèvement rejeté) : rien
  // n'a été encaissé, même si la ligne reste « Processed ».
  if (
    !paid &&
    payments.length > 0 &&
    payments.every((p) => FAILED_PAYMENT_STATES.has(p))
  ) {
    return "refunded";
  }
  if (state === "waiting") return "pending";
  if (VALID_STATES.has(state)) {
    return !paid && payments.some((p) => PENDING_PAYMENT_STATES.has(p))
      ? "pending"
      : "valid";
  }
  return "ignored";
}

function country(value: unknown): string {
  const code = text(value, 120);
  // La fiche exige au moins deux caractères.
  if (!code || code.length < 2) return "France";
  return COUNTRIES.get(code.toUpperCase()) ?? code;
}

/**
 * HelloAsso date ses commandes à l'heure française avec le décalage
 * (« 2026-09-12T14:03:22.1234567+02:00 », que `new Date` lit bien, sept
 * décimales comprises). Une date sans décalage est lue à l'heure de Paris,
 * pas à celle du serveur.
 */
function orderDateOf(item: HelloAssoApiItem, fallback: Date): Date {
  const raw = typeof item.order?.date === "string" ? item.order.date.trim() : "";
  if (!raw) return fallback;
  const date = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)
    ? new Date(raw)
    : fromZonedTime(raw, APP_TIMEZONE);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

/**
 * Les adhésions des lignes HelloAsso, commande par commande, avec le don de
 * la commande rattaché à sa première adhésion valable.
 *
 * Les lignes commandées avant `from` (début de l'année scolaire) sont
 * écartées, même si l'API les renvoyait.
 */
export function planSync(
  items: HelloAssoApiItem[],
  from: Date,
  now: Date = new Date(),
): HelloAssoSyncPlan {
  const orders = new Map<string, HelloAssoApiItem[]>();
  const seen = new Set<string>();
  for (const item of items) {
    // Sans identifiant fiable, une ligne ne peut pas être importée une seule
    // fois : elle est laissée de côté. Une ligne renvoyée sur deux pages (la
    // liste a bougé pendant la lecture) ne compte qu'une fois.
    const itemId = apiId(item.id);
    if (!itemId || seen.has(itemId)) continue;
    seen.add(itemId);
    if (orderDateOf(item, now) < from) continue;
    const orderId = apiId(item.order?.id) ?? `item-${itemId}`;
    const lines = orders.get(orderId);
    if (lines) lines.push(item);
    else orders.set(orderId, [item]);
  }

  let fetched = 0;
  const memberships: PlannedMembership[] = [];
  for (const [orderId, lines] of orders) {
    const donationCents = Math.min(
      lines
        .filter((l) => isDonationItem(l) && classifyItem(l) === "valid")
        .reduce((sum, l) => sum + itemAmountCents(l), 0),
      MAX_CENTS,
    );
    const members = lines.filter(isMembershipItem);
    fetched += members.length;
    let donationPending = donationCents;

    for (const item of members) {
      const status = classifyItem(item);
      if (status === "ignored") continue;
      const payer = item.payer && typeof item.payer === "object" ? item.payer : {};
      const user = item.user && typeof item.user === "object" ? item.user : {};
      const hasUser = Boolean(text(user.firstName, 120) || text(user.lastName, 120));
      const firstName =
        text(hasUser ? user.firstName : payer.firstName, 120) ?? "—";
      const lastName =
        text(hasUser ? user.lastName : payer.lastName, 120) ??
        `Adhésion HelloAsso n° ${apiId(item.id)}`;
      const isPayer =
        !hasUser ||
        nameKey(user.firstName, user.lastName) ===
          nameKey(payer.firstName, payer.lastName);
      const donation = status === "valid" ? donationPending : 0;
      if (status === "valid") donationPending = 0;

      memberships.push({
        itemId: apiId(item.id) as string,
        orderId,
        orderDate: orderDateOf(item, now),
        status,
        firstName,
        lastName,
        email:
          members.length === 1 || isPayer ? normalizeEmail(payer.email) : null,
        feeCents: itemAmountCents(item),
        donationCents: donation,
        addressLine1: text(payer.address, 200),
        postalCode: text(payer.zipCode, 20),
        city: text(payer.city, 120),
        country: country(payer.country),
      });
    }
  }
  return { fetched, memberships };
}

/** Ce qu'il faut d'une fiche d'adhérent pour la rapprocher d'une adhésion. */
export type MatchCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  feePaidAt: Date | null;
};

/**
 * L'adhérent existant qui correspond à une adhésion HelloAsso, parmi des
 * fiches de la même année que la synchronisation n'a pas encore reliées : par
 * adresse e-mail, puis par prénom et nom normalisés.
 *
 * Une fiche au même nom l'emporte sur une fiche qui ne partage que l'adresse
 * (deux parents d'une même famille ont souvent la même), et, à nom égal, une
 * fiche non payée sur une fiche déjà réglée : c'est elle que le paiement
 * complète. La fiche retenue est déjà payée ? Elle est renvoyée quand même,
 * pour que le bureau vérifie un possible doublon.
 */
export function findMatchingMember<T extends MatchCandidate>(
  candidates: readonly T[],
  membership: Pick<PlannedMembership, "firstName" | "lastName" | "email">,
): T | null {
  const key = nameKey(membership.firstName, membership.lastName);
  let best: T | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const sameName = nameKey(candidate.firstName, candidate.lastName) === key;
    const sameEmail =
      membership.email !== null &&
      normalizeEmail(candidate.email) === membership.email;
    if (!sameName && !sameEmail) continue;
    // Le nom passe avant tout : si Marie, déjà réglée par chèque, repaie en
    // ligne, c'est un doublon à signaler — pas une raison de marquer payé
    // Jean, qui partage son adresse e-mail sans avoir réglé.
    const score =
      (sameName ? 4 : 0) +
      (candidate.feePaidAt === null ? 2 : 0) +
      (sameEmail ? 1 : 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
