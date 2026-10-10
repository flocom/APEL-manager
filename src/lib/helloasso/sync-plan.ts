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

const VALID_STATES = new Set(["processed", "registered"]);
const CANCELLED_STATES = new Set(["canceled", "refused", "abandoned", "deleted"]);
/** Paiements encaissés (`Registered` : saisi hors ligne par l'association). */
const PAID_PAYMENT_STATES = new Set(["authorized", "registered"]);
const REFUNDED_PAYMENT_STATES = new Set(["refunded", "refunding"]);
const PENDING_PAYMENT_STATES = new Set(["pending", "waitingbankvalidation"]);

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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function lower(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function text(value: string | null | undefined, max: number): string | null {
  const t = (value ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

function cents(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

export function isDonationItem(item: HelloAssoApiItem): boolean {
  return DONATION_TYPES.has(lower(item.type));
}

/**
 * Nom comparable : sans accents, sans casse, sans espaces, tirets ni
 * apostrophes. « Lefèvre-Durand » et « LEFEVRE DURAND » se rejoignent.
 */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\s\-'’‘.,_]+/g, "");
}

export function nameKey(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return `${normalizeName(lastName)}|${normalizeName(firstName)}`;
}

/** Adresse e-mail comparable ; null si absente ou mal formée. */
export function normalizeEmail(value: string | null | undefined): string | null {
  const email = lower(value);
  return email && email.length <= 254 && EMAIL.test(email) ? email : null;
}

/** Cotisation d'une ligne : son prix (remise déduite) et ses options. */
export function itemAmountCents(item: HelloAssoApiItem): number {
  return (
    cents(item.amount) +
    (item.options ?? []).reduce((sum, option) => sum + cents(option?.amount), 0)
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
  const payments = (item.payments ?? []).map((p) => lower(p?.state));
  const paid = payments.some((p) => PAID_PAYMENT_STATES.has(p));
  if (!paid && payments.some((p) => REFUNDED_PAYMENT_STATES.has(p))) {
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

function country(value: string | null | undefined): string {
  const code = (value ?? "").trim();
  if (!code) return "France";
  return COUNTRIES.get(code.toUpperCase()) ?? code.slice(0, 120);
}

function orderDateOf(item: HelloAssoApiItem, fallback: Date): Date {
  const date = item.order?.date ? new Date(item.order.date) : null;
  return date && !Number.isNaN(date.getTime()) ? date : fallback;
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
  for (const item of items) {
    if (orderDateOf(item, now) < from) continue;
    const orderId = String(item.order?.id ?? `item-${item.id}`);
    const lines = orders.get(orderId);
    if (lines) lines.push(item);
    else orders.set(orderId, [item]);
  }

  let fetched = 0;
  const memberships: PlannedMembership[] = [];
  for (const [orderId, lines] of orders) {
    const donationCents = lines
      .filter((l) => isDonationItem(l) && classifyItem(l) === "valid")
      .reduce((sum, l) => sum + itemAmountCents(l), 0);
    const members = lines.filter((l) => !isDonationItem(l));
    fetched += members.length;
    let donationPending = donationCents;

    for (const item of members) {
      const status = classifyItem(item);
      if (status === "ignored") continue;
      const payer = item.payer ?? {};
      const user = item.user ?? {};
      const hasUser = Boolean(text(user.firstName, 120) || text(user.lastName, 120));
      const firstName =
        text(hasUser ? user.firstName : payer.firstName, 120) ?? "—";
      const lastName =
        text(hasUser ? user.lastName : payer.lastName, 120) ??
        `Adhésion HelloAsso n° ${item.id}`;
      const isPayer =
        !hasUser ||
        nameKey(user.firstName, user.lastName) ===
          nameKey(payer.firstName, payer.lastName);
      const donation = status === "valid" ? donationPending : 0;
      if (status === "valid") donationPending = 0;

      memberships.push({
        itemId: String(item.id),
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
 * Une fiche non payée l'emporte sur une fiche déjà réglée, et celle qui porte
 * le même nom sur celle qui ne partage que l'adresse (deux parents d'une même
 * famille ont souvent la même) : c'est elle que le paiement complète. Ne
 * reste qu'une fiche déjà payée ? Elle est renvoyée quand même, pour que le
 * bureau vérifie un possible doublon.
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
    const score =
      (candidate.feePaidAt === null ? 4 : 0) +
      (sameName ? 2 : 0) +
      (sameEmail ? 1 : 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
