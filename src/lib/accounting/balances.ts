import { toDateInput } from "@/lib/dates";

/**
 * Soldes des comptes de trésorerie, partagés par l'écran et l'export
 * comptable.
 *
 * Le solde d'un compte est son solde de départ plus les écritures validées
 * datées APRÈS le jour de ce solde : celles du jour même ou d'avant y sont
 * déjà comprises (c'est le solde du relevé en fin de journée). Sans solde de
 * départ, le compte part de zéro, comme avant.
 */

export type BalanceAccount = {
  id: string;
  openingBalanceCents: number | null;
  /** Instant ISO (minuit à Paris du jour du solde). */
  openingBalanceDate: string | null;
};

export type BalanceEntry = {
  accountId: string | null;
  type: "income" | "expense";
  status: "draft" | "posted";
  amountCents: number;
  occurredAt: string;
};

export type AccountBalance = {
  /** Solde de départ + écritures validées jusqu'au jour demandé inclus. */
  cents: number;
  /** Brouillons de la même période (signés) : ce que le solde deviendrait une fois validés. */
  draftCents: number;
  draftCount: number;
  /** Écritures validées antérieures au solde de départ, donc déjà comprises dedans. */
  coveredByOpening: number;
};

function signed(entry: BalanceEntry) {
  return entry.type === "income" ? entry.amountCents : -entry.amountCents;
}

/** `until` : jour « AAAA-MM-JJ » inclus (à Paris) ; absent, toutes les écritures. */
export function accountBalance(
  account: BalanceAccount,
  entries: BalanceEntry[],
  until?: string,
): AccountBalance {
  const openingDay = account.openingBalanceDate ? toDateInput(account.openingBalanceDate) : null;
  const result: AccountBalance = {
    cents: openingDay !== null ? (account.openingBalanceCents ?? 0) : 0,
    draftCents: 0,
    draftCount: 0,
    coveredByOpening: 0,
  };
  for (const entry of entries) {
    if (entry.accountId !== account.id) continue;
    const day = toDateInput(entry.occurredAt);
    if (openingDay !== null && day <= openingDay) {
      if (entry.status === "posted") result.coveredByOpening += 1;
      continue;
    }
    if (until !== undefined && day > until) continue;
    if (entry.status === "posted") {
      result.cents += signed(entry);
    } else {
      result.draftCents += signed(entry);
      result.draftCount += 1;
    }
  }
  return result;
}

/**
 * Trésorerie de l'association : la somme des soldes des comptes, plus les
 * écritures validées sans compte (saisies avant qu'un compte existe).
 */
export function treasuryBalance(accounts: BalanceAccount[], entries: BalanceEntry[]): number {
  const known = new Set(accounts.map((account) => account.id));
  let cents = 0;
  for (const account of accounts) cents += accountBalance(account, entries).cents;
  for (const entry of entries) {
    if (entry.status === "posted" && (!entry.accountId || !known.has(entry.accountId))) {
      cents += signed(entry);
    }
  }
  return cents;
}

export type StatementCheck =
  | { kind: "none" }
  | { kind: "missing_opening"; statementDate: string; closingCents: number }
  | { kind: "ok"; statementDate: string; closingCents: number }
  | { kind: "ok_with_drafts"; statementDate: string; closingCents: number; draftCount: number }
  | { kind: "gap"; statementDate: string; closingCents: number; computedCents: number; gapCents: number };

/**
 * Contrôle d'un compte avec son dernier relevé importé : le solde calculé au
 * jour du relevé doit retomber sur le solde imprimé.
 */
export function checkAgainstStatement(
  account: BalanceAccount,
  entries: BalanceEntry[],
  statement: { periodEnd: string; closingBalanceCents: number } | null,
): StatementCheck {
  if (!statement) return { kind: "none" };
  const base = { statementDate: statement.periodEnd, closingCents: statement.closingBalanceCents };
  if (!account.openingBalanceDate) return { kind: "missing_opening", ...base };
  const balance = accountBalance(account, entries, statement.periodEnd);
  if (balance.cents === statement.closingBalanceCents) return { kind: "ok", ...base };
  if (balance.draftCount > 0 && balance.cents + balance.draftCents === statement.closingBalanceCents) {
    return { kind: "ok_with_drafts", ...base, draftCount: balance.draftCount };
  }
  return {
    kind: "gap",
    ...base,
    computedCents: balance.cents,
    gapCents: balance.cents - statement.closingBalanceCents,
  };
}
