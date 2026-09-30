import "server-only";

import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  buildLedger,
  encodeLatin9,
  formatFec,
  formatLedgerCsv,
} from "@/lib/accounting/fec";
import { db } from "@/lib/db";
import {
  accountingCategories,
  accountingEntries,
  events,
  financialAccounts,
} from "@/lib/db/schema";

import { recordAudit, type AuditActor } from "./audit";

/** Contrôle de Luhn : un SIREN mal recopié donnerait un fichier au nom faux. */
function validSiren(value: string) {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = Number(value[8 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.");

export const accountingExportSchema = z
  .object({
    format: z.enum(["fec", "csv"]),
    from: day,
    to: day,
    siren: z
      .string()
      .transform((value) => value.replace(/\s+/g, ""))
      .refine((value) => value === "" || (/^\d{9}$/.test(value) && validSiren(value)), {
        message: "SIREN invalide : neuf chiffres, tels qu’ils figurent sur l’avis de situation INSEE.",
      })
      .optional(),
  })
  .refine((data) => data.from <= data.to, {
    message: "La date de début doit précéder la date de fin.",
    path: ["to"],
  })
  .refine(
    (data) => Date.parse(data.to) - Date.parse(data.from) <= 1000 * 24 * 60 * 60 * 1000,
    { message: "Période trop longue : un exercice ne dépasse pas deux ans.", path: ["to"] },
  );

/**
 * Fichier d'export de la période : FEC (nom réglementaire
 * « SIRENFECAAAAMMJJ.txt », AAAAMMJJ étant la date de clôture) ou tableur.
 */
export async function exportAccounting(input: unknown, actor: AuditActor) {
  const { format, from, to, siren } = accountingExportSchema.parse(input);
  const [accounts, categories, entries] = await Promise.all([
    db.select().from(financialAccounts),
    db.select().from(accountingCategories),
    db
      .select({
        entry: accountingEntries,
        eventTitle: events.title,
      })
      .from(accountingEntries)
      .leftJoin(events, eq(accountingEntries.eventId, events.id))
      .where(eq(accountingEntries.status, "posted"))
      .orderBy(asc(accountingEntries.occurredAt)),
  ]);
  const ledger = buildLedger({
    from,
    to,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      ledgerCode: account.ledgerCode,
      openingBalanceCents: account.openingBalanceCents,
      openingBalanceDate: account.openingBalanceDate?.toISOString() ?? null,
      createdAt: account.createdAt.toISOString(),
    })),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type,
      ledgerCode: category.ledgerCode,
    })),
    entries: entries.map(({ entry, eventTitle }) => ({
      id: entry.id,
      accountId: entry.accountId,
      type: entry.type,
      status: entry.status,
      amountCents: entry.amountCents,
      occurredAt: entry.occurredAt.toISOString(),
      label: entry.label,
      categoryId: entry.categoryId,
      eventTitle,
      reference: entry.reference,
      counterparty: entry.counterparty,
      attachmentUrl: entry.attachmentUrl,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    })),
  });
  if (ledger.totalDebitCents !== ledger.totalCreditCents) {
    // Impossible par construction (deux lignes égales par écriture) : si cela
    // arrive, c'est un défaut à corriger, pas un fichier à remettre.
    throw new Error("Export comptable déséquilibré.");
  }

  await recordAudit(actor, "accounting.export", "accounting_entry", undefined, {
    format,
    from,
    to,
    entries: ledger.entryCount,
    lines: ledger.lines.length,
  });

  const closing = to.replaceAll("-", "");
  if (format === "fec") {
    return {
      filename: `${siren ?? ""}FEC${closing}.txt`,
      contentType: "text/plain; charset=ISO-8859-15",
      body: encodeLatin9(formatFec(ledger)),
      ledger,
    };
  }
  return {
    filename: `grand-livre-${from}-au-${to}.csv`,
    contentType: "text/csv; charset=utf-8",
    body: Buffer.from(formatLedgerCsv(ledger), "utf8"),
    ledger,
  };
}
