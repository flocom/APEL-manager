import "server-only";

import { accountBalance, type BalanceEntry } from "./balances";
import { DEFAULT_CODES, defaultCategoryLedger, normalizeLedgerCode } from "./ledger-codes";
import { toDateInput } from "@/lib/dates";

/**
 * Export comptable au format du Fichier des Écritures Comptables (FEC),
 * article A. 47 A-1 du livre des procédures fiscales : le format que
 * l'administration fiscale et les experts-comptables savent relire.
 *
 * La comptabilité de l'application est une comptabilité de trésorerie : une
 * écriture = un mouvement sur un compte (banque, caisse). Le FEC demande une
 * comptabilité en partie double : chaque écriture devient ici deux lignes
 * équilibrées, le compte de trésorerie (512 banque, 530 caisse) d'un côté, le
 * compte de charge (6) ou de produit (7) de sa catégorie de l'autre. Les
 * soldes de départ deviennent des écritures d'à-nouveaux (journal AN) contre
 * le report à nouveau (110 / 119).
 *
 * Seules les écritures VALIDÉES sont exportées : elles seules sont
 * intangibles (une écriture validée ne se modifie plus), ce que la norme
 * exige. Les écritures sont numérotées sur une séquence continue, dans
 * l'ordre chronologique.
 */

export const FEC_COLUMNS = [
  "JournalCode",
  "JournalLib",
  "EcritureNum",
  "EcritureDate",
  "CompteNum",
  "CompteLib",
  "CompAuxNum",
  "CompAuxLib",
  "PieceRef",
  "PieceDate",
  "EcritureLib",
  "Debit",
  "Credit",
  "EcritureLet",
  "DateLet",
  "ValidDate",
  "Montantdevise",
  "Idevise",
] as const;

export type FecAccount = {
  id: string;
  name: string;
  type: "bank" | "cash";
  ledgerCode: string | null;
  openingBalanceCents: number | null;
  openingBalanceDate: string | null;
  createdAt: string;
};

export type FecCategory = {
  id: string;
  name: string;
  type: "income" | "expense";
  ledgerCode: string | null;
};

export type FecEntry = BalanceEntry & {
  id: string;
  label: string;
  categoryId: string | null;
  eventTitle: string | null;
  reference: string | null;
  counterparty: string | null;
  attachmentUrl: string | null;
  createdAt: string;
  /** Dernière modification : pour une écriture validée (immuable), le moment de sa validation. */
  updatedAt: string;
};

/** Une ligne du FEC, et ce qu'il faut pour l'export tableur. */
export type LedgerLine = {
  journalCode: string;
  journalLib: string;
  number: number;
  day: string /* AAAA-MM-JJ */;
  accountCode: string;
  accountLabel: string;
  pieceRef: string;
  label: string;
  debitCents: number;
  creditCents: number;
  validDay: string;
  category: string | null;
  event: string | null;
  hasAttachment: boolean;
};

export type LedgerExport = {
  lines: LedgerLine[];
  entryCount: number;
  totalDebitCents: number;
  totalCreditCents: number;
  /** Écritures validées antérieures au solde de départ de leur compte : déjà comprises dedans, non exportées. */
  coveredByOpening: number;
};

const SUSPENSE = { code: "471000", label: "Compte d’attente" };
const RETAINED_EARNINGS = {
  credit: { code: "110000", label: "Report à nouveau (solde créditeur)" },
  debit: { code: "119000", label: "Report à nouveau (solde débiteur)" },
};

/**
 * Comptes de trésorerie : 512xxx pour les banques, 530xxx pour les caisses,
 * dans l'ordre de création ; un compte saisi à la main l'emporte.
 */
function treasuryLedger(accounts: FecAccount[]) {
  const byType = { bank: [] as FecAccount[], cash: [] as FecAccount[] };
  for (const account of [...accounts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    byType[account.type].push(account);
  }
  const ledger = new Map<string, { code: string; label: string; journalCode: string; journalLib: string }>();
  for (const type of ["bank", "cash"] as const) {
    byType[type].forEach((account, index) => {
      const root = type === "bank" ? "512" : "530";
      const code = account.ledgerCode
        ? normalizeLedgerCode(account.ledgerCode)
        : `${root}${index}00`;
      const suffix = byType[type].length > 1 ? String(index + 1) : "";
      ledger.set(account.id, {
        code,
        label: account.name,
        journalCode: `${type === "bank" ? "BQ" : "CA"}${suffix}`,
        journalLib: `${type === "bank" ? "Banque" : "Caisse"} — ${account.name}`,
      });
    });
  }
  return ledger;
}

function previousDay(day: string) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Écritures de la période [from ; to] (jours à Paris, inclus), en partie
 * double, avec les à-nouveaux d'ouverture.
 */
export function buildLedger(input: {
  from: string;
  to: string;
  accounts: FecAccount[];
  categories: FecCategory[];
  entries: FecEntry[];
}): LedgerExport {
  const { from, to, accounts, categories, entries } = input;
  const treasury = treasuryLedger(accounts);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const posted = entries.filter((entry) => entry.status === "posted");

  const groups: { sortKey: string; lines: Omit<LedgerLine, "number">[] }[] = [];
  let coveredByOpening = 0;

  // À-nouveaux : solde de chaque compte à l'ouverture de la période (ou à
  // son solde de départ, s'il tombe dans la période).
  for (const account of accounts) {
    const ledger = treasury.get(account.id)!;
    const openingDay = account.openingBalanceDate ? toDateInput(account.openingBalanceDate) : null;
    let day: string;
    let cents: number;
    if (openingDay && openingDay >= from) {
      if (openingDay > to) continue;
      day = openingDay;
      cents = account.openingBalanceCents ?? 0;
    } else {
      day = from;
      cents = accountBalance(account, posted, previousDay(from)).cents;
    }
    if (cents === 0) continue;
    const counterpart = cents > 0 ? RETAINED_EARNINGS.credit : RETAINED_EARNINGS.debit;
    const amount = Math.abs(cents);
    const common = {
      journalCode: "AN",
      journalLib: "À-nouveaux",
      day,
      pieceRef: `AN-${account.id.slice(0, 8)}`,
      label: `Solde de départ — ${account.name}`,
      validDay: day,
      category: null,
      event: null,
      hasAttachment: false,
    };
    groups.push({
      sortKey: `${day}|0|${account.id}`,
      lines: [
        { ...common, accountCode: ledger.code, accountLabel: ledger.label, debitCents: cents > 0 ? amount : 0, creditCents: cents > 0 ? 0 : amount },
        { ...common, accountCode: counterpart.code, accountLabel: counterpart.label, debitCents: cents > 0 ? 0 : amount, creditCents: cents > 0 ? amount : 0 },
      ],
    });
  }

  let entryCount = 0;
  for (const entry of posted) {
    const day = toDateInput(entry.occurredAt);
    if (day < from || day > to) continue;
    const account = entry.accountId ? accounts.find((a) => a.id === entry.accountId) : undefined;
    const openingDay = account?.openingBalanceDate ? toDateInput(account.openingBalanceDate) : null;
    if (openingDay && day <= openingDay) {
      // Déjà comprise dans le solde de départ : l'exporter la compterait deux fois.
      coveredByOpening += 1;
      continue;
    }
    entryCount += 1;
    const ledger = account ? treasury.get(account.id)! : null;
    const category = entry.categoryId ? categoryById.get(entry.categoryId) : undefined;
    const counterpart = category?.ledgerCode
      ? { code: normalizeLedgerCode(category.ledgerCode), label: category.name }
      : category
        ? { code: defaultCategoryLedger(category.name, entry.type).code, label: category.name }
        : DEFAULT_CODES[entry.type];
    const treasuryLine = ledger ?? { code: SUSPENSE.code, label: SUSPENSE.label, journalCode: "OD", journalLib: "Opérations diverses" };
    const income = entry.type === "income";
    const common = {
      journalCode: treasuryLine.journalCode,
      journalLib: treasuryLine.journalLib,
      day,
      pieceRef: entry.reference?.trim() || `E-${entry.id.slice(0, 8)}`,
      label: entry.counterparty ? `${entry.label} — ${entry.counterparty}` : entry.label,
      validDay: toDateInput(entry.updatedAt),
      category: category?.name ?? null,
      event: entry.eventTitle,
      hasAttachment: Boolean(entry.attachmentUrl),
    };
    groups.push({
      sortKey: `${day}|1|${entry.createdAt}|${entry.id}`,
      lines: [
        { ...common, accountCode: treasuryLine.code, accountLabel: treasuryLine.label, debitCents: income ? entry.amountCents : 0, creditCents: income ? 0 : entry.amountCents },
        { ...common, accountCode: counterpart.code, accountLabel: counterpart.label, debitCents: income ? 0 : entry.amountCents, creditCents: income ? entry.amountCents : 0 },
      ],
    });
  }

  groups.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const lines: LedgerLine[] = [];
  let totalDebitCents = 0;
  let totalCreditCents = 0;
  groups.forEach((group, index) => {
    for (const line of group.lines) {
      lines.push({ ...line, number: index + 1 });
      totalDebitCents += line.debitCents;
      totalCreditCents += line.creditCents;
    }
  });
  return { lines, entryCount, totalDebitCents, totalCreditCents, coveredByOpening };
}

/* ------------------------------------------------------------------------ */
/* Mise en forme                                                             */
/* ------------------------------------------------------------------------ */

/** « 1234,56 » : virgule décimale, sans séparateur de milliers, comme le veut le FEC. */
function fecAmount(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** Texte d'une zone : ni séparateur, ni tabulation, ni retour à la ligne. */
function fecText(value: string) {
  return value
    .normalize("NFC")
    .replace(/[|\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactDay(day: string) {
  return day.replaceAll("-", "");
}

export function formatFec(ledger: LedgerExport): string {
  const rows = [FEC_COLUMNS.join("|")];
  for (const line of ledger.lines) {
    rows.push(
      [
        line.journalCode,
        fecText(line.journalLib),
        String(line.number).padStart(6, "0"),
        compactDay(line.day),
        line.accountCode,
        fecText(line.accountLabel),
        "",
        "",
        fecText(line.pieceRef),
        compactDay(line.day),
        fecText(line.label),
        fecAmount(line.debitCents),
        fecAmount(line.creditCents),
        "",
        "",
        compactDay(line.validDay),
        "",
        "",
      ].join("|"),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}

/**
 * ISO 8859-15 (latin-9), l'un des jeux de caractères admis pour le FEC. Il
 * diffère du latin-1 sur huit positions (€, Œ, œ, Š, š, Ž, ž, Ÿ) ; ce qui n'y
 * figure pas est remplacé par un équivalent (’ → ', … → ...) ou « ? ».
 */
const LATIN9_SPECIALS: Record<string, number> = {
  "€": 0xa4, "Š": 0xa6, "š": 0xa8, "Ž": 0xb4, "ž": 0xb8, "Œ": 0xbc, "œ": 0xbd, "Ÿ": 0xbe,
};
const LATIN1_ONLY = new Set([0xa4, 0xa6, 0xa8, 0xb4, 0xb8, 0xbc, 0xbd, 0xbe]);
const SUBSTITUTES: Record<string, string> = {
  "’": "'", "‘": "'", "‚": "'", "“": '"', "”": '"', "„": '"', "…": "...",
  "–": "-", "—": "-", "‑": "-", " ": " ", " ": " ",
};

export function encodeLatin9(text: string): Buffer {
  const bytes: number[] = [];
  for (const char of text.normalize("NFC")) {
    const substitute = SUBSTITUTES[char];
    if (substitute) {
      for (const c of substitute) bytes.push(c.charCodeAt(0));
      continue;
    }
    const special = LATIN9_SPECIALS[char];
    if (special !== undefined) {
      bytes.push(special);
      continue;
    }
    const code = char.codePointAt(0) ?? 0x3f;
    if (code < 0x80 || (code >= 0xa0 && code <= 0xff && !LATIN1_ONLY.has(code))) {
      bytes.push(code);
    } else {
      bytes.push(0x3f);
    }
  }
  return Buffer.from(bytes);
}

/** Export tableur (CSV « ; », UTF-8 avec BOM pour Excel), mêmes lignes que le FEC. */
export function formatLedgerCsv(ledger: LedgerExport): string {
  const header = [
    "Date", "Journal", "N° écriture", "Compte", "Intitulé du compte", "Pièce",
    "Libellé", "Débit", "Crédit", "Catégorie", "Événement", "Justificatif", "Validée le",
  ];
  const cell = (value: string) => (/[;"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
  const frDay = (day: string) => day.split("-").reverse().join("/");
  const rows = [header.join(";")];
  for (const line of ledger.lines) {
    rows.push(
      [
        frDay(line.day),
        line.journalCode,
        String(line.number),
        line.accountCode,
        line.accountLabel,
        line.pieceRef,
        line.label,
        line.debitCents ? fecAmount(line.debitCents) : "",
        line.creditCents ? fecAmount(line.creditCents) : "",
        line.category ?? "",
        line.event ?? "",
        line.journalCode === "AN" ? "" : line.hasAttachment ? "oui" : "non",
        frDay(line.validDay),
      ]
        .map(cell)
        .join(";"),
    );
  }
  rows.push(
    ["", "", "", "", "", "", "Totaux", fecAmount(ledger.totalDebitCents), fecAmount(ledger.totalCreditCents), "", "", "", ""].join(";"),
  );
  return `﻿${rows.join("\r\n")}\r\n`;
}
