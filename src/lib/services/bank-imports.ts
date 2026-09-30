import "server-only";

import { createHash } from "node:crypto";

import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { HttpError } from "@/lib/auth/guards";
import {
  BankStatementError,
  parseCreditMutuelStatement,
  type BankStatementLine as ParsedLine,
  type BankStatementSection as ParsedSection,
  type ParsedBankStatement,
} from "@/lib/banking/credit-mutuel";
import type {
  AnalyzedLine,
  AnalyzedSection,
  AnalyzedStatement,
  BankImportAnalysis,
  BankImportCommitResult,
  BankImportSummary,
  BankLinkOptions,
  DuplicateCandidate,
  LineDecision,
  SupportedBank,
} from "@/lib/banking/import-types";
import { analyzeLabel, cardPurchaseDate, labelKey, normalizeLabel } from "@/lib/banking/labels";
import { parseLocalDateTime, toDateInput } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  accountingCategories,
  accountingEntries,
  bankStatementImports,
  bankStatementLines,
  events,
  financialAccounts,
  membershipPayments,
  users,
} from "@/lib/db/schema";
import { redactError } from "@/lib/errors";
import { readUpload, storedUploadIdFromUrl } from "@/lib/uploads";
import {
  bankImportAnalyzeSchema,
  bankImportCommitSchema,
} from "@/lib/validation";

import { insertAccountingEntry, uniqueViolation } from "./accounting";
import { recordAudit, type AuditActor } from "./audit";
import {
  delaiLisible,
  hitRateLimit,
  PLAFONDS,
  rateLimitError,
  type RateLimitRule,
} from "./rate-limit";

/**
 * Import des relevés bancaires : lecture des PDF, classement de chaque
 * opération (nouvelle, déjà importée, doublon possible), puis enregistrement
 * des écritures décidées par le trésorier.
 *
 * Le contrat avec l'écran est dans `@/lib/banking/import-types`. Deux règles
 * tiennent tout le reste :
 * - une opération déjà traitée ne revient jamais : son empreinte est unique en
 *   base (`bank_statement_lines`), qu'elle ait été importée, rattachée ou
 *   écartée ;
 * - dans le doute, on demande : une écriture existante qui ressemble à
 *   l'opération (même sens, même montant, date proche) n'est jamais doublée
 *   sans que le trésorier l'ait dit.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Lecteur = Pick<typeof db, "select">;

type StatementFile = { fileUrl: string; fileName: string };

type FailedStatement = Extract<AnalyzedStatement, { ok: false }>;

type ReadStatement =
  | { ok: false; statement: FailedStatement }
  | { ok: true; file: StatementFile; sha: string; parsed: ParsedBankStatement };

type LineContext = {
  line: AnalyzedLine;
  source: ParsedLine;
  /** Ligne déjà en base dont l'écriture a été supprimée (`deleted_entry`). */
  existing: { id: string; importId: string; cashEntryId: string | null } | null;
};

type SectionContext = {
  section: AnalyzedSection;
  source: ParsedSection;
  previousImportId: string | null;
  lines: LineContext[];
};

type StatementContext = {
  file: StatementFile;
  sha: string;
  parsed: ParsedBankStatement;
  sections: SectionContext[];
};

type Classification = {
  analysis: BankImportAnalysis;
  statements: StatementContext[];
};

const BANK: SupportedBank = "credit_mutuel";
const BANK_LABEL = "Crédit Mutuel";

/** Écart toléré entre la date d'une écriture saisie et celle de l'opération. */
const DOUBT_WINDOW_DAYS = 3;
/** Paiement par carte sans date d'achat lisible : la fenêtre remonte d'une semaine. */
const CARD_WINDOW_DAYS = 7;

/**
 * Jours auxquels une écriture saisie à la main peut correspondre à
 * l'opération : date d'opération, date de valeur, et date d'achat d'un
 * paiement par carte (celle du ticket).
 */
function matchDays(line: ParsedLine): string[] {
  const days = [line.operationDate];
  if (line.valueDate) days.push(line.valueDate);
  const purchase = cardPurchaseDate(line.label, line.operationDate);
  if (purchase) days.push(purchase);
  return days;
}
const MAX_CANDIDATES = 5;
/** Écritures relues pour deviner une catégorie d'après un libellé semblable. */
const CATEGORY_HISTORY_LIMIT = 3000;

const MESSAGE_ILLISIBLE =
  "Ce fichier n’a pas pu être lu. Vérifiez qu’il s’agit bien du relevé PDF d’origine, téléchargé depuis l’espace Crédit Mutuel.";
const MESSAGE_INTROUVABLE =
  "Fichier introuvable : téléversez-le de nouveau.";

/* ------------------------------------------------------------------------ */
/* Outils                                                                    */
/* ------------------------------------------------------------------------ */

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

/** Jour calendaire décalé : « 2026-03-01 » − 3 → « 2026-02-26 ». */
function shiftDay(day: string, delta: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function dayDistance(a: string, b: string) {
  const toUtc = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.abs(Math.round((toUtc(a) - toUtc(b)) / 86_400_000));
}

/** « 2026-03-31 » → « 31/03/2026 ». */
function frenchDay(day: string) {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

function clip(value: string | null, max: number) {
  return value ? value.slice(0, max) : null;
}

async function plafond(rule: RateLimitRule, actor: AuditActor, message: string) {
  const verdict = await hitRateLimit(rule, actor.userId);
  if (!verdict.ok) {
    throw rateLimitError(
      verdict,
      `${message} Réessayez ${delaiLisible(verdict.retryAfterSeconds)}.`,
    );
  }
}

/**
 * Empreinte d'une opération. Le rang (`occurrence`) départage deux
 * opérations identiques du même relevé — deux cotisations de 15 € le même
 * jour —, qui sont bien deux opérations.
 */
function fingerprints(accountNumber: string, lines: ParsedLine[]) {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const base = [
      BANK,
      accountNumber,
      line.operationDate,
      line.valueDate,
      line.direction,
      line.amountCents,
      normalizeLabel(line.label),
      normalizeLabel(line.details.join(" ")),
    ];
    const key = JSON.stringify(base);
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return sha256(JSON.stringify([...base, occurrence]));
  });
}

/* ------------------------------------------------------------------------ */
/* Lecture des fichiers                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Relit chaque relevé sur le disque, dans l'ordre de l'envoi. Un fichier
 * refusé (autre banque, soldes discordants…) n'arrête pas les autres : sa
 * carte s'affiche en rouge, le reste de l'envoi se poursuit.
 */
async function readStatements(files: StatementFile[]): Promise<ReadStatement[]> {
  const shas = new Set<string>();
  const out: ReadStatement[] = [];
  const failed = (file: StatementFile, code: string, error: string) =>
    out.push({ ok: false, statement: { ok: false, ...file, code, error } });

  // Un fichier après l'autre : chaque lecture de PDF réserve plusieurs
  // mégaoctets, douze en parallèle chargeraient inutilement le serveur.
  for (const file of files) {
    const id = storedUploadIdFromUrl(file.fileUrl, "accounting");
    if (!id) {
      failed(file, "not_found", MESSAGE_INTROUVABLE);
      continue;
    }
    let data: Buffer;
    try {
      const name = file.fileUrl.slice(file.fileUrl.lastIndexOf("/") + 1);
      data = (await readUpload(id, name)).data;
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        failed(file, "not_found", MESSAGE_INTROUVABLE);
        continue;
      }
      throw error;
    }

    const sha = sha256(data);
    if (shas.has(sha)) {
      failed(
        file,
        "duplicate_file",
        "Ce fichier figure deux fois dans la sélection.",
      );
      continue;
    }
    shas.add(sha);

    try {
      const parsed = await parseCreditMutuelStatement(new Uint8Array(data));
      out.push({ ok: true, file, sha, parsed });
    } catch (error) {
      if (error instanceof BankStatementError) {
        failed(file, error.code, error.message);
      } else {
        // Le message d'origine peut citer le contenu du relevé : seul le
        // résumé expurgé va au journal, et le trésorier lit un message simple.
        console.error("[releves] lecture impossible", redactError(error));
        failed(file, "unreadable", MESSAGE_ILLISIBLE);
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Classement                                                                */
/* ------------------------------------------------------------------------ */

type AccountRow = typeof financialAccounts.$inferSelect;

type AccountSuggestion = Pick<AnalyzedSection, "suggestedAccountId" | "accountMatch">;

const NO_SUGGESTION: AccountSuggestion = { suggestedAccountId: null, accountMatch: "none" };

/**
 * Compte proposé pour une section de relevé, et pourquoi. Seuls les comptes
 * bancaires comptent : une caisse ne reçoit jamais un relevé, même si un
 * numéro y a été saisi par erreur.
 */
function suggestAccount(
  accounts: AccountRow[],
  accountNumber: string,
): AccountSuggestion {
  const byNumber = accounts.find(
    (a) => a.type === "bank" && a.bankAccountNumber === accountNumber,
  );
  if (byNumber) {
    // Rattaché à un compte archivé : ne rien proposer d'autre, l'enregistrement
    // refuserait de toute façon de donner ce numéro à un second compte.
    return byNumber.isActive
      ? { suggestedAccountId: byNumber.id, accountMatch: "number" }
      : NO_SUGGESTION;
  }
  const activeBanks = accounts.filter((a) => a.isActive && a.type === "bank");
  const byName = activeBanks.find(
    (a) =>
      !a.bankAccountNumber &&
      [a.name, a.description ?? ""].some((text) =>
        text.replace(/\D/g, "").includes(accountNumber),
      ),
  );
  if (byName) return { suggestedAccountId: byName.id, accountMatch: "name" };
  const unnumbered = activeBanks.filter((a) => !a.bankAccountNumber);
  if (unnumbered.length === 1) {
    return { suggestedAccountId: unnumbered[0].id, accountMatch: "single" };
  }
  return NO_SUGGESTION;
}

/**
 * Un compte sans numéro n'en recevra qu'un : proposé d'après son nom, ou
 * comme seul compte bancaire, pour deux numéros différents du même envoi
 * (compte courant et livret d'un même relevé), il ferait échouer
 * l'enregistrement sur la seconde section. Il revient à la première section
 * qui a quelque chose à importer — d'abord à celle dont le numéro figure dans
 * son nom — et les autres numéros restent sans proposition. Une section sans
 * rien à importer ne réclame rien : le serveur ignore son compte.
 */
function claimSuggestions(
  sections: {
    accountNumber: string;
    actionable: boolean;
    suggestion: AccountSuggestion;
  }[],
) {
  const claimed = new Map<string, string>();
  for (const match of ["name", "single"] as const) {
    for (const { accountNumber, actionable, suggestion } of sections) {
      const id = suggestion.suggestedAccountId;
      if (actionable && suggestion.accountMatch === match && id && !claimed.has(id)) {
        claimed.set(id, accountNumber);
      }
    }
  }
  return sections.map(({ accountNumber, suggestion }) => {
    const owner = suggestion.suggestedAccountId
      ? claimed.get(suggestion.suggestedAccountId)
      : undefined;
    return suggestion.accountMatch !== "number" && owner && owner !== accountNumber
      ? NO_SUGGESTION
      : suggestion;
  });
}

const NATURE_CATEGORY_PATTERNS: Partial<
  Record<NonNullable<ReturnType<typeof analyzeLabel>["natureKey"]>, RegExp>
> = {
  bank_fees: /FRAIS|BANCAIRE|BANQUE|COMMISSION|AGIOS/,
  interest: /INTERET|PRODUITS FINANCIERS/,
  cash_withdrawal: /ESPECE|CAISSE|INTERNE/,
  cash_deposit: /ESPECE|CAISSE|INTERNE/,
};

/** Mots trop courants pour rapprocher une opération d'un événement. */
const EVENT_STOP_WORDS = new Set(["POUR", "AVEC", "DANS"]);

function words(text: string) {
  return normalizeLabel(text).split(/[^A-Z0-9]+/).filter(Boolean);
}

type EventRow = { id: string; title: string; day: string; words: string[] };

/**
 * Événement probable : son titre partage un mot significatif avec
 * l'opération (« VIR KERMESSE 2026 » ↔ « Kermesse de juin »), et il a lieu
 * entre deux mois avant et trois semaines après — on paie les achats avant,
 * on encaisse les chèques après.
 */
function suggestEvent(eventRows: EventRow[], line: ParsedLine) {
  const lineWords = words(`${line.label} ${line.details.join(" ")}`);
  const from = shiftDay(line.operationDate, -60);
  const to = shiftDay(line.operationDate, 21);
  let best: { id: string; distance: number } | null = null;
  for (const event of eventRows) {
    if (event.day < from || event.day > to) continue;
    // Préfixe : « GALETTES » sur le relevé retrouve la « Galette des rois ».
    const matches = event.words.some((word) =>
      lineWords.some((candidate) => candidate.startsWith(word)),
    );
    if (!matches) continue;
    const distance = dayDistance(event.day, line.operationDate);
    if (!best || distance < best.distance) best = { id: event.id, distance };
  }
  return best?.id ?? null;
}

/**
 * Classe chaque opération des relevés lus, avec l'état de la base vue par
 * `lecteur` : à l'enregistrement, la transaction qui tient les verrous.
 */
async function classify(
  reads: ReadStatement[],
  lecteur: Lecteur,
): Promise<Classification> {
  const okReads = reads.filter(
    (read): read is Extract<ReadStatement, { ok: true }> => read.ok,
  );
  const allFingerprints = okReads.flatMap((read) =>
    read.parsed.sections.flatMap((section) =>
      fingerprints(section.accountNumber, section.lines),
    ),
  );
  const allDays = okReads.flatMap((read) =>
    read.parsed.sections.flatMap((section) =>
      section.lines.map((line) => line.operationDate),
    ),
  );
  const minDay = allDays.reduce((a, b) => (b < a ? b : a), allDays[0] ?? "");
  const maxDay = allDays.reduce((a, b) => (b > a ? b : a), allDays[0] ?? "");

  const [accounts, existingLines, previousImports, categories, history, eventList] =
    await Promise.all([
      lecteur.select().from(financialAccounts),
      allFingerprints.length
        ? lecteur
            .select({
              id: bankStatementLines.id,
              importId: bankStatementLines.importId,
              fingerprint: bankStatementLines.fingerprint,
              decision: bankStatementLines.decision,
              entryId: bankStatementLines.entryId,
              cashEntryId: bankStatementLines.cashEntryId,
              createdAt: bankStatementLines.createdAt,
              entryLabel: accountingEntries.label,
            })
            .from(bankStatementLines)
            .leftJoin(
              accountingEntries,
              eq(bankStatementLines.entryId, accountingEntries.id),
            )
            .where(inArray(bankStatementLines.fingerprint, allFingerprints))
        : Promise.resolve([]),
      okReads.length
        ? lecteur
            .select({
              id: bankStatementImports.id,
              fileSha256: bankStatementImports.fileSha256,
              accountNumber: bankStatementImports.accountNumber,
              createdAt: bankStatementImports.createdAt,
              createdByName: users.name,
            })
            .from(bankStatementImports)
            .leftJoin(users, eq(bankStatementImports.createdBy, users.id))
            .where(
              inArray(
                bankStatementImports.fileSha256,
                okReads.map((read) => read.sha),
              ),
            )
        : Promise.resolve([]),
      lecteur
        .select({
          id: accountingCategories.id,
          name: accountingCategories.name,
          type: accountingCategories.type,
        })
        .from(accountingCategories)
        .where(eq(accountingCategories.isActive, true)),
      lecteur
        .select({
          label: accountingEntries.label,
          type: accountingEntries.type,
          categoryId: accountingEntries.categoryId,
        })
        .from(accountingEntries)
        .where(sql`${accountingEntries.categoryId} is not null`)
        .orderBy(desc(accountingEntries.occurredAt), desc(accountingEntries.createdAt))
        .limit(CATEGORY_HISTORY_LIMIT),
      allDays.length
        ? lecteur
            .select({
              id: events.id,
              title: events.title,
              startAt: events.startAt,
            })
            .from(events)
            .where(
              and(
                eq(events.kind, "event"),
                gte(events.startAt, parseLocalDateTime(shiftDay(minDay, -61))),
                lt(events.startAt, parseLocalDateTime(shiftDay(maxDay, 23))),
              ),
            )
        : Promise.resolve([]),
    ]);

  const linesByFingerprint = new Map(
    existingLines.map((line) => [line.fingerprint, line]),
  );
  const previousByKey = new Map(
    previousImports.map((row) => [`${row.fileSha256}:${row.accountNumber}`, row]),
  );

  // Catégorie d'une écriture passée au libellé semblable : la plus récente,
  // à condition que la catégorie soit encore active et du bon sens.
  const activeCategory = new Map(categories.map((c) => [c.id, c]));
  const categoryByLabel = new Map<string, string>();
  for (const entry of history) {
    const category = entry.categoryId ? activeCategory.get(entry.categoryId) : null;
    if (!category || category.type !== entry.type) continue;
    const key = `${entry.type}|${labelKey(entry.label)}`;
    if (!categoryByLabel.has(key)) categoryByLabel.set(key, category.id);
  }

  const eventRows: EventRow[] = eventList.map((event) => ({
    id: event.id,
    title: event.title,
    day: toDateInput(event.startAt),
    words: words(event.title).filter(
      (word) => /^[A-Z]{4,}$/.test(word) && !EVENT_STOP_WORDS.has(word),
    ),
  }));

  const suggestCategory = (
    type: "income" | "expense",
    keys: string[],
    natureKey: ReturnType<typeof analyzeLabel>["natureKey"],
  ) => {
    for (const key of keys) {
      if (!key) continue;
      const found = categoryByLabel.get(`${type}|${key}`);
      if (found) return found;
    }
    const pattern = natureKey ? NATURE_CATEGORY_PATTERNS[natureKey] : undefined;
    if (!pattern) return null;
    return (
      categories.find(
        (c) => c.type === type && pattern.test(normalizeLabel(c.name)),
      )?.id ?? null
    );
  };

  // Premier passage, sans requête : ce que devient chaque opération (déjà
  // traitée, en double dans l'envoi, ou à décider). Il faut le savoir avant
  // de proposer les comptes : une section sans rien à décider n'en réclame
  // aucun (voir `claimSuggestions`).
  const batch = new Set<string>();
  const firstPass = new Map(
    okReads.map((read) => [
      read,
      read.parsed.sections.map((source) => {
        const prints = fingerprints(source.accountNumber, source.lines);
        const states = prints.map((fingerprint) => {
          const stored = linesByFingerprint.get(fingerprint);
          const entryDeleted =
            stored &&
            (stored.decision === "imported" || stored.decision === "linked") &&
            !stored.entryId;
          if (stored && !entryDeleted) return { kind: "stored" as const, stored };
          // Avant la reprise d'une écriture supprimée : la même opération
          // présente dans deux relevés de l'envoi ne se décide qu'une fois.
          if (batch.has(fingerprint)) return { kind: "batch" as const };
          batch.add(fingerprint);
          return stored
            ? { kind: "deleted" as const, stored }
            : { kind: "fresh" as const };
        });
        return {
          source,
          prints,
          states,
          actionable: states.some(
            (state) => state.kind === "deleted" || state.kind === "fresh",
          ),
        };
      }),
    ]),
  );
  const allSections = [...firstPass.values()].flat();
  const suggestions = claimSuggestions(
    allSections.map((section) => ({
      accountNumber: section.source.accountNumber,
      actionable: section.actionable,
      suggestion: suggestAccount(accounts, section.source.accountNumber),
    })),
  );
  const suggestionOf = new Map(
    allSections.map((section, index) => [section, suggestions[index]]),
  );
  /** Comptes qu'une section sans numéro connu peut recevoir sans être refusée. */
  const unnumberedBankIds = accounts
    .filter((a) => a.isActive && a.type === "bank" && !a.bankAccountNumber)
    .map((a) => a.id);

  const statements: StatementContext[] = [];
  const analyzed: AnalyzedStatement[] = [];

  for (const read of reads) {
    if (!read.ok) {
      analyzed.push(read.statement);
      continue;
    }
    const sections: SectionContext[] = [];
    for (const first of firstPass.get(read) ?? []) {
      const { source, prints, states } = first;
      const key = `${read.sha}:${source.accountNumber}`;
      const suggestion = suggestionOf.get(first) ?? NO_SUGGESTION;
      const previous = previousByKey.get(key) ?? null;

      // Écritures qui pourraient être ces opérations, saisies à la main ou
      // par un autre moyen : même montant, date proche, sans compte ou sur
      // un compte que la section peut recevoir. Numéro connu : son seul
      // compte. Compte proposé d'après son nom ou faute d'autre : tous les
      // comptes bancaires sans numéro, car le trésorier peut en choisir un
      // autre que celui proposé, et une écriture saisie sur celui-là doit
      // aussi être signalée. Rien de proposé : partout. Une écriture déjà
      // rattachée à une ligne de relevé est hors jeu — elle a déjà son
      // opération.
      const accountFilter =
        suggestion.accountMatch === "number" && suggestion.suggestedAccountId
          ? or(
              eq(accountingEntries.accountId, suggestion.suggestedAccountId),
              isNull(accountingEntries.accountId),
            )
          : suggestion.accountMatch === "none"
            ? undefined
            : or(
                inArray(accountingEntries.accountId, unnumberedBankIds),
                isNull(accountingEntries.accountId),
              );
      const amounts = [...new Set(source.lines.map((line) => line.amountCents))];
      const sectionDays = source.lines.flatMap(matchDays);
      const pool =
        amounts.length && sectionDays.length
          ? await lecteur
              .select({
                id: accountingEntries.id,
                type: accountingEntries.type,
                label: accountingEntries.label,
                amountCents: accountingEntries.amountCents,
                occurredAt: accountingEntries.occurredAt,
                status: accountingEntries.status,
                counterparty: accountingEntries.counterparty,
                accountName: financialAccounts.name,
                categoryName: accountingCategories.name,
              })
              .from(accountingEntries)
              .leftJoin(
                financialAccounts,
                eq(accountingEntries.accountId, financialAccounts.id),
              )
              .leftJoin(
                accountingCategories,
                eq(accountingEntries.categoryId, accountingCategories.id),
              )
              .where(
                and(
                  inArray(accountingEntries.amountCents, amounts),
                  // Marge d'un jour de plus de chaque côté : le filtre exact,
                  // en jours de Paris, se fait ensuite ligne par ligne.
                  gte(
                    accountingEntries.occurredAt,
                    parseLocalDateTime(
                      shiftDay(
                        sectionDays.reduce((a, b) => (b < a ? b : a)),
                        -CARD_WINDOW_DAYS - 1,
                      ),
                    ),
                  ),
                  lt(
                    accountingEntries.occurredAt,
                    parseLocalDateTime(
                      shiftDay(
                        sectionDays.reduce((a, b) => (b > a ? b : a)),
                        DOUBT_WINDOW_DAYS + 2,
                      ),
                    ),
                  ),
                  accountFilter,
                  sql`not exists (select 1 from ${bankStatementLines} where ${bankStatementLines.entryId} = ${accountingEntries.id} or ${bankStatementLines.cashEntryId} = ${accountingEntries.id})`,
                ),
              )
          : [];
      const poolWithDays = pool.map((entry) => ({
        ...entry,
        day: toDateInput(entry.occurredAt),
      }));

      const lines: LineContext[] = source.lines.map((parsedLine, index) => {
        const fingerprint = prints[index];
        const type = parsedLine.direction === "credit" ? "income" : "expense";
        const insight = analyzeLabel(
          parsedLine.label,
          parsedLine.details,
          parsedLine.direction,
        );
        const line: AnalyzedLine = {
          fingerprint,
          operationDate: parsedLine.operationDate,
          valueDate: parsedLine.valueDate,
          label: parsedLine.label,
          details: parsedLine.details,
          amountCents: parsedLine.amountCents,
          direction: parsedLine.direction,
          type,
          labelKey: insight.labelKey,
          paymentMethod: insight.paymentMethod,
          reference: insight.reference,
          counterparty: insight.counterparty,
          nature: insight.nature,
          cashMovement: insight.cashMovement,
          suggestedCategoryId: null,
          suggestedEventId: null,
          state: "new",
          alreadyImported: null,
          doubtReason: null,
          candidates: [],
        };
        let existing: LineContext["existing"] = null;

        const state = states[index];
        if (state.kind === "stored") {
          const { stored } = state;
          line.state = "already_imported";
          line.alreadyImported = {
            source: "previous_import",
            importedAt: stored.createdAt.toISOString(),
            decision: stored.decision as "imported" | "linked" | "skipped",
            entryId: stored.entryId,
            entryLabel: stored.entryLabel,
          };
          return { line, source: parsedLine, existing };
        }
        if (state.kind === "batch") {
          line.state = "already_imported";
          line.alreadyImported = {
            source: "batch",
            importedAt: null,
            decision: null,
            entryId: null,
            entryLabel: null,
          };
          return { line, source: parsedLine, existing };
        }

        if (state.kind === "deleted") {
          line.state = "doubt";
          line.doubtReason = "deleted_entry";
          existing = {
            id: state.stored.id,
            importId: state.stored.importId,
            cashEntryId: state.stored.cashEntryId,
          };
        } else {
          const days = matchDays(parsedLine).sort();
          // Petit paiement par carte regroupé, sans date d'achat imprimée
          // (« METRO FRANCE CARTE 1716383241 ») : le ticket peut dater d'une
          // semaine avant le passage en banque.
          const before =
            insight.paymentMethod === "card" && days.length === 1 + (parsedLine.valueDate ? 1 : 0)
              ? CARD_WINDOW_DAYS
              : DOUBT_WINDOW_DAYS;
          const from = shiftDay(days[0], -before);
          const to = shiftDay(days[days.length - 1], DOUBT_WINDOW_DAYS);
          const candidates: DuplicateCandidate[] = poolWithDays
            .filter(
              (entry) =>
                entry.type === type &&
                entry.amountCents === parsedLine.amountCents &&
                entry.day >= from &&
                entry.day <= to,
            )
            .sort(
              (a, b) =>
                dayDistance(a.day, parsedLine.operationDate) -
                  dayDistance(b.day, parsedLine.operationDate) ||
                b.occurredAt.getTime() - a.occurredAt.getTime(),
            )
            .slice(0, MAX_CANDIDATES)
            .map((entry) => ({
              entryId: entry.id,
              label: entry.label,
              amountCents: entry.amountCents,
              occurredAt: entry.occurredAt.toISOString(),
              status: entry.status,
              accountName: entry.accountName,
              categoryName: entry.categoryName,
              counterparty: entry.counterparty,
            }));
          if (candidates.length) {
            line.state = "doubt";
            line.doubtReason = "similar_entry";
            line.candidates = candidates;
          }
        }

        line.suggestedCategoryId = suggestCategory(
          type,
          [insight.labelKey, labelKey(parsedLine.label)],
          insight.natureKey,
        );
        line.suggestedEventId = suggestEvent(eventRows, parsedLine);
        return { line, source: parsedLine, existing };
      });

      sections.push({
        source,
        previousImportId: previous?.id ?? null,
        lines,
        section: {
          key,
          accountNumber: source.accountNumber,
          accountLabel: source.accountLabel,
          openingDate: source.openingDate,
          closingDate: source.closingDate,
          openingBalanceCents: source.openingBalanceCents,
          closingBalanceCents: source.closingBalanceCents,
          totalDebitCents: source.totalDebitCents,
          totalCreditCents: source.totalCreditCents,
          ...suggestion,
          previousImport: previous
            ? {
                importedAt: previous.createdAt.toISOString(),
                importedBy: previous.createdByName,
              }
            : null,
          lines: lines.map((context) => context.line),
        },
      });
    }

    statements.push({ file: read.file, sha: read.sha, parsed: read.parsed, sections });
    analyzed.push({
      ok: true,
      fileUrl: read.file.fileUrl,
      fileName: read.file.fileName,
      fileSha256: read.sha,
      bank: BANK,
      statementDate: read.parsed.statementDate,
      holder: read.parsed.holder,
      iban: read.parsed.iban,
      sections: sections.map((context) => context.section),
    });
  }

  // L'empreinte de l'analyse ne retient que ce qui change une décision :
  // l'état de chaque opération, ses doublons possibles et le compte proposé.
  // Les fichiers refusés n'y entrent pas : l'écran peut ne renvoyer que les
  // relevés acceptés.
  const token = sha256(
    JSON.stringify(
      statements.map((statement) => [
        statement.sha,
        statement.sections.map(({ section }) => [
          section.key,
          section.suggestedAccountId,
          section.lines.map((line) => [
            line.fingerprint,
            line.state,
            line.candidates.map((candidate) => candidate.entryId).sort(),
          ]),
        ]),
      ]),
    ),
  );

  return { analysis: { bank: BANK, statements: analyzed, token }, statements };
}

/* ------------------------------------------------------------------------ */
/* Analyse                                                                   */
/* ------------------------------------------------------------------------ */

export async function analyzeBankImport(
  input: unknown,
  actor: AuditActor,
): Promise<BankImportAnalysis> {
  const request = bankImportAnalyzeSchema.parse(input);
  await plafond(
    PLAFONDS.analyseReleves,
    actor,
    "Trop d’analyses de relevés en une heure.",
  );
  const reads = await readStatements(request.files);
  const { analysis } = await classify(reads, db);
  return analysis;
}

/* ------------------------------------------------------------------------ */
/* Enregistrement                                                            */
/* ------------------------------------------------------------------------ */

function entryNotes(
  statement: StatementContext,
  section: SectionContext,
  line: ParsedLine,
) {
  const statementDay = statement.parsed.statementDate ?? section.source.closingDate;
  return [
    `Importée du relevé ${BANK_LABEL} du ${frenchDay(statementDay)} (compte n° ${section.source.accountNumber}).`,
    ...line.details,
    ...(line.valueDate && line.valueDate !== line.operationDate
      ? [`Date de valeur : ${frenchDay(line.valueDate)}`]
      : []),
  ].join("\n");
}

function lineName(line: ParsedLine) {
  return `« ${line.label} » du ${frenchDay(line.operationDate)}`;
}

const MESSAGE_CONCURRENT =
  "Ces opérations viennent d’être importées par ailleurs. Relancez l’analyse.";
const MESSAGE_CHANGED =
  "Les imports de relevés viennent de changer par ailleurs (un import enregistré ou annulé en même temps, une écriture supprimée). Relancez l’analyse.";

/**
 * Code SQLSTATE d'une erreur de la base, ou null. Drizzle enveloppe l'erreur
 * de PostgreSQL : on remonte la chaîne des causes.
 */
function sqlState(error: unknown): string | null {
  let current: unknown = error;
  for (let i = 0; i < 4 && current; i += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = current instanceof Error ? (current as { cause?: unknown }).cause : null;
  }
  return null;
}

export async function commitBankImport(
  input: unknown,
  actor: AuditActor,
): Promise<BankImportCommitResult> {
  const request = bankImportCommitSchema.parse(input);
  await plafond(
    PLAFONDS.enregistrementReleves,
    actor,
    "Trop d’imports de relevés en une heure.",
  );

  // Choix des sections et décisions, contrôlés avant toute lecture.
  const sectionChoice = new Map<string, string | null>();
  for (const statement of request.statements) {
    for (const section of statement.sections) {
      if (sectionChoice.has(section.key)) {
        throw new HttpError(400, "Une section de relevé figure deux fois.");
      }
      sectionChoice.set(section.key, section.accountId);
    }
  }
  const decisions = new Map<string, LineDecision>();
  for (const decision of request.decisions) {
    if (decisions.has(decision.fingerprint)) {
      throw new HttpError(400, "Une opération a reçu deux décisions.");
    }
    decisions.set(decision.fingerprint, decision);
  }

  // Lecture des PDF hors transaction : c'est le plus long, et rien n'y
  // dépend de la base.
  const reads = await readStatements(request.statements);

  const lockedIds = [
    ...new Set([
      ...[...sectionChoice.values()].filter((id): id is string => Boolean(id)),
      ...request.decisions.flatMap((d) =>
        d.action === "import" && d.cashAccountId ? [d.cashAccountId] : [],
      ),
    ]),
  ].sort();

  let touched: { importIds: string[]; imported: number; linked: number; skipped: number };
  try {
    touched = await db.transaction(async (tx) => {
      // Verrou sur les comptes visés : deux imports du même compte (deux
      // onglets, deux trésoriers) passent l'un après l'autre, et le second
      // refait son analyse en voyant ce que le premier a enregistré.
      const lockedAccounts = lockedIds.length
        ? await tx
            .select()
            .from(financialAccounts)
            .where(inArray(financialAccounts.id, lockedIds))
            .orderBy(financialAccounts.id)
            .for("update")
        : [];
      const accountById = new Map(lockedAccounts.map((a) => [a.id, a]));

      const { analysis, statements } = await classify(reads, tx);
      if (analysis.token !== request.token) {
        throw new HttpError(
          409,
          "Les écritures ont changé depuis l’analyse (un autre import, une écriture ajoutée ?). Relancez l’analyse.",
        );
      }

      const knownKeys = new Set(
        statements.flatMap((s) => s.sections.map(({ section }) => section.key)),
      );
      for (const key of sectionChoice.keys()) {
        if (!knownKeys.has(key)) {
          throw new HttpError(400, "Section de relevé inconnue : relancez l’analyse.");
        }
      }

      return applyDecisions(tx, {
        actor,
        status: request.status,
        statements,
        sectionChoice,
        decisions,
        accountById,
      });
    });
  } catch (error) {
    const constraint = uniqueViolation(error);
    if (
      constraint === "bank_statement_lines_fingerprint_idx" ||
      constraint === "bank_statement_imports_file_account_idx" ||
      constraint === "bank_statement_lines_entry_idx" ||
      constraint === "bank_statement_lines_cash_entry_idx"
    ) {
      throw new HttpError(409, MESSAGE_CONCURRENT);
    }
    // Filets sous les verrous : un import ou une écriture supprimé entre
    // l'analyse et l'insertion (clé étrangère, 23503), ou une annulation
    // croisée avec cet enregistrement (interblocage, 40P01). La base a tout
    // annulé ; relancer l'analyse suffit.
    const state = sqlState(error);
    if (state === "23503" || state === "40P01") {
      throw new HttpError(409, MESSAGE_CHANGED);
    }
    if (constraint === "financial_accounts_bank_account_number_idx") {
      throw new HttpError(
        409,
        "Ce numéro de compte vient d’être associé à un autre compte. Relancez l’analyse.",
      );
    }
    throw error;
  }

  const imports = await importSummaries(db, touched.importIds);
  return {
    imports,
    imported: touched.imported,
    linked: touched.linked,
    skipped: touched.skipped,
  };
}

type PlannedSection = {
  statement: StatementContext;
  section: SectionContext;
  account: AccountRow;
  lines: { context: LineContext; decision: LineDecision }[];
};

/**
 * Écritures à rattacher, verrouillées puis relues. L'analyse les a trouvées
 * sans verrou : depuis, un autre administrateur a pu supprimer le brouillon
 * ou en changer le montant, et un autre import — vers un autre compte, donc
 * sans verrou commun avec celui-ci — a pu rattacher la même écriture sans
 * compte à sa propre opération. Le verrou exclusif fait passer ces actions
 * l'une après l'autre, et la relecture qui le suit voit ce qu'elles ont
 * enregistré : ce qui a changé est refusé avec l'invitation à relancer
 * l'analyse, plutôt qu'une erreur de clé étrangère (500) ou une écriture
 * comptée pour deux opérations.
 */
async function lockLinkedEntries(tx: Transaction, planned: PlannedSection[]) {
  const links = planned.flatMap(({ lines }) =>
    lines.flatMap(({ context, decision }) =>
      decision.action === "link" ? [{ context, entryId: decision.entryId }] : [],
    ),
  );
  if (!links.length) return;
  const ids = [...new Set(links.map((link) => link.entryId))].sort();
  const rows = await tx
    .select({
      id: accountingEntries.id,
      type: accountingEntries.type,
      amountCents: accountingEntries.amountCents,
    })
    .from(accountingEntries)
    .where(inArray(accountingEntries.id, ids))
    .orderBy(accountingEntries.id)
    .for("update");
  const taken = await tx
    .select({
      entryId: bankStatementLines.entryId,
      cashEntryId: bankStatementLines.cashEntryId,
    })
    .from(bankStatementLines)
    .where(
      or(
        inArray(bankStatementLines.entryId, ids),
        inArray(bankStatementLines.cashEntryId, ids),
      ),
    );
  const takenIds = new Set(taken.flatMap((row) => [row.entryId, row.cashEntryId]));
  const entryById = new Map(rows.map((row) => [row.id, row]));
  for (const { context, entryId } of links) {
    const entry = entryById.get(entryId);
    if (
      !entry ||
      entry.type !== context.line.type ||
      entry.amountCents !== context.line.amountCents ||
      takenIds.has(entryId)
    ) {
      throw new HttpError(
        409,
        `L’écriture choisie pour l’opération ${lineName(context.source)} vient d’être supprimée, modifiée ou rattachée à une autre opération. Relancez l’analyse.`,
      );
    }
  }
}

/**
 * Catégories et événements choisis, contrôlés tous ensemble avant la moindre
 * écriture. Ils ne font pas partie de l'empreinte de l'analyse : une
 * catégorie désactivée entre-temps ne ressortirait sinon qu'à l'insertion,
 * en « Catégorie comptable invalide ou inactive. », sans dire laquelle ni
 * pour quelle opération.
 */
async function checkReferences(tx: Transaction, planned: PlannedSection[]) {
  const imports = planned.flatMap(({ lines }) =>
    lines.flatMap(({ context, decision }) =>
      decision.action === "import" ? [{ context, decision }] : [],
    ),
  );
  const categoryIds = [
    ...new Set(imports.flatMap(({ decision }) => decision.categoryId ?? [])),
  ].sort();
  const eventIds = [
    ...new Set(imports.flatMap(({ decision }) => decision.eventId ?? [])),
  ].sort();
  // Verrou partagé, comme à la saisie d'une écriture : la catégorie ou
  // l'événement ne peut plus être supprimé avant la fin de l'import.
  const categoryRows = categoryIds.length
    ? await tx
        .select({
          id: accountingCategories.id,
          name: accountingCategories.name,
          type: accountingCategories.type,
          isActive: accountingCategories.isActive,
        })
        .from(accountingCategories)
        .where(inArray(accountingCategories.id, categoryIds))
        .orderBy(accountingCategories.id)
        .for("key share")
    : [];
  const eventRows = eventIds.length
    ? await tx
        .select({ id: events.id })
        .from(events)
        .where(inArray(events.id, eventIds))
        .orderBy(events.id)
        .for("key share")
    : [];
  const categoryById = new Map(categoryRows.map((row) => [row.id, row]));
  const knownEvents = new Set(eventRows.map((row) => row.id));
  for (const { context, decision } of imports) {
    const name = lineName(context.source);
    if (decision.categoryId) {
      const category = categoryById.get(decision.categoryId);
      if (!category || !category.isActive) {
        throw new HttpError(
          409,
          `La catégorie ${category ? `« ${category.name} » ` : ""}choisie pour l’opération ${name} n’existe plus ou vient d’être désactivée. Relancez l’analyse.`,
        );
      }
      if (category.type !== context.line.type) {
        throw new HttpError(
          400,
          `La catégorie « ${category.name} » est une catégorie de ${category.type === "income" ? "recettes" : "dépenses"} : elle ne convient pas à l’opération ${name}.`,
        );
      }
    }
    if (decision.eventId && !knownEvents.has(decision.eventId)) {
      throw new HttpError(
        409,
        `L’événement choisi pour l’opération ${name} n’existe plus. Relancez l’analyse.`,
      );
    }
  }
}

async function applyDecisions(
  tx: Transaction,
  {
    actor,
    status,
    statements,
    sectionChoice,
    decisions,
    accountById,
  }: {
    actor: AuditActor;
    status: "draft" | "posted";
    statements: StatementContext[];
    sectionChoice: Map<string, string | null>;
    decisions: Map<string, LineDecision>;
    accountById: Map<string, AccountRow>;
  },
) {
  // --- Contrôles, avant la moindre écriture -----------------------------
  const accountNumbers = [
    ...new Set(
      statements.flatMap((s) => s.sections.map(({ source }) => source.accountNumber)),
    ),
  ];
  const owners = accountNumbers.length
    ? await tx
        .select({
          id: financialAccounts.id,
          name: financialAccounts.name,
          bankAccountNumber: financialAccounts.bankAccountNumber,
        })
        .from(financialAccounts)
        .where(inArray(financialAccounts.bankAccountNumber, accountNumbers))
    : [];
  const ownerByNumber = new Map(
    owners.map((owner) => [owner.bankAccountNumber as string, owner]),
  );
  /** Numéros à inscrire sur les comptes qui n'en avaient pas. */
  const numberToSet = new Map<string, string>();

  type Planned = PlannedSection;
  const planned: Planned[] = [];
  const decided = new Set<string>();
  const ignorable = new Set<string>();
  const linkedEntries = new Set<string>();
  let actionableSections = 0;
  let importedSections = 0;

  for (const statement of statements) {
    for (const section of statement.sections) {
      const actionable = section.lines.filter(
        (context) => context.line.state !== "already_imported",
      );
      if (actionable.length) actionableSections += 1;
      const accountId = sectionChoice.get(section.section.key) ?? null;
      // Section laissée de côté, ou sans rien à importer (tout y est déjà
      // traité) : ses décisions éventuelles sont ignorées, et le compte
      // envoyé pour elle n'est ni contrôlé ni numéroté. L'écran n'affiche pas
      // de choix de compte pour une telle section : un compte proposé
      // d'office, mais rattaché à un autre numéro, ferait sinon échouer tout
      // l'envoi sur une section que le trésorier ne peut pas corriger.
      if (!accountId || !actionable.length) {
        for (const context of section.lines) ignorable.add(context.line.fingerprint);
        continue;
      }
      for (const context of section.lines) {
        if (context.line.state === "already_imported") {
          ignorable.add(context.line.fingerprint);
        }
      }
      importedSections += 1;

      const account = accountById.get(accountId);
      if (!account || !account.isActive) {
        throw new HttpError(
          400,
          "Le compte de destination choisi n’existe plus ou est archivé.",
        );
      }
      if (account.type !== "bank") {
        throw new HttpError(
          400,
          `« ${account.name} » est une caisse : un relevé bancaire s’importe sur un compte bancaire.`,
        );
      }
      const number = section.source.accountNumber;
      const bound = account.bankAccountNumber;
      if (bound && bound !== number) {
        throw new HttpError(
          409,
          `Ce relevé concerne le compte n° ${number}, et « ${account.name} » est rattaché au n° ${bound}.`,
        );
      }
      // Pas encore numéroté, mais déjà choisi pour un autre numéro dans ce
      // même envoi : l'envoi se contredit, relancer l'analyse n'y changerait
      // rien — il faut choisir un autre compte.
      const chosenFor = numberToSet.get(account.id);
      if (chosenFor && chosenFor !== number) {
        throw new HttpError(
          400,
          `« ${account.name} » est déjà choisi pour le relevé du compte n° ${chosenFor} dans cet envoi : un compte ne reçoit les relevés que d’un seul numéro. Choisissez un autre compte pour le compte n° ${number}.`,
        );
      }
      const owner =
        ownerByNumber.get(number) ??
        [...numberToSet.entries()]
          .filter(([, n]) => n === number)
          .map(([id]) => accountById.get(id))
          .find(Boolean);
      if (owner && owner.id !== account.id) {
        throw new HttpError(
          409,
          `Le compte n° ${number} est déjà rattaché à « ${owner.name} ».`,
        );
      }
      if (!bound && !chosenFor) numberToSet.set(account.id, number);

      const lines: Planned["lines"] = [];
      for (const context of actionable) {
        const { line } = context;
        const decision = decisions.get(line.fingerprint);
        if (!decision) {
          throw new HttpError(
            400,
            `Il manque une décision pour l’opération ${lineName(context.source)}.`,
          );
        }
        decided.add(line.fingerprint);
        if (decision.action === "link") {
          if (
            line.doubtReason !== "similar_entry" ||
            !line.candidates.some((c) => c.entryId === decision.entryId)
          ) {
            throw new HttpError(
              400,
              `Rattachement impossible : cette écriture ne fait pas partie des doublons possibles de l’opération ${lineName(context.source)}.`,
            );
          }
          if (linkedEntries.has(decision.entryId)) {
            throw new HttpError(
              400,
              "Une même écriture ne peut être rattachée qu’à une seule opération du relevé.",
            );
          }
          linkedEntries.add(decision.entryId);
        }
        if (decision.action === "import" && decision.cashAccountId) {
          const cash = accountById.get(decision.cashAccountId);
          if (!line.cashMovement) {
            throw new HttpError(
              400,
              `L’opération ${lineName(context.source)} n’est pas un mouvement d’espèces : pas d’écriture en caisse.`,
            );
          }
          if (!cash || !cash.isActive || cash.type !== "cash") {
            throw new HttpError(400, "La caisse choisie n’existe plus ou est archivée.");
          }
        }
        lines.push({ context, decision });
      }
      if (lines.length) planned.push({ statement, section, account, lines });
    }
  }

  for (const fingerprint of decisions.keys()) {
    if (!decided.has(fingerprint) && !ignorable.has(fingerprint)) {
      throw new HttpError(400, "Décision pour une opération inconnue : relancez l’analyse.");
    }
  }
  if (!actionableSections) {
    throw new HttpError(
      409,
      "Ce relevé a déjà été importé : il n’y a rien de nouveau à enregistrer.",
    );
  }
  if (!importedSections || !planned.length) {
    throw new HttpError(
      400,
      "Choisissez le compte de destination d’au moins un relevé.",
    );
  }

  await lockLinkedEntries(tx, planned);
  await checkReferences(tx, planned);

  // --- Écritures ----------------------------------------------------------
  for (const [accountId, number] of numberToSet) {
    await tx
      .update(financialAccounts)
      .set({ bankAccountNumber: number, updatedAt: new Date() })
      .where(eq(financialAccounts.id, accountId));
    // Même trace qu'une modification du compte à la main : l'historique du
    // compte dit d'où vient son numéro.
    await recordAudit(
      actor,
      "accounting.account_update",
      "financial_account",
      accountId,
      {
        changedFields: ["bankAccountNumber"],
        bankAccountNumber: number,
        source: "bank_import",
      },
      tx,
    );
  }

  await learnOpeningBalances(tx, planned, actor);

  const touchedImports = new Set<string>();
  const totals = { imported: 0, linked: 0, skipped: 0 };

  for (const { statement, section, account, lines } of planned) {
    /**
     * Compteurs par import touché : une opération reprise (écriture
     * supprimée puis réimportée) reste sur la ligne, et donc l'import, où
     * elle avait été enregistrée. Chaque import touché reçoit sa trace.
     */
    const countsByImport = new Map<
      string,
      { imported: number; linked: number; skipped: number }
    >();
    let importId: string | null = null;
    const needsImportRow = lines.some(({ context }) => !context.existing);
    if (needsImportRow) {
      // Même fichier, même compte, déjà importé une fois : les nouvelles
      // lignes rejoignent cet import plutôt que d'en créer un second.
      importId = section.previousImportId;
      if (!importId) {
        const source = section.source;
        // L'IBAN de la section quand le relevé en donne un par compte ; à
        // défaut, celui de l'en-tête ne vaut que pour un relevé à un seul
        // compte — sur un relevé multi-comptes, il désigne le compte courant
        // et serait faux sur la ligne du livret.
        const sectionIban = (source as { iban?: string | null }).iban;
        const [created] = await tx
          .insert(bankStatementImports)
          .values({
            bank: BANK,
            accountId: account.id,
            accountNumber: source.accountNumber,
            accountLabel: source.accountLabel,
            iban:
              sectionIban ??
              (statement.parsed.sections.length === 1 ? statement.parsed.iban : null),
            statementDate: statement.parsed.statementDate
              ? parseLocalDateTime(statement.parsed.statementDate)
              : null,
            periodStart: parseLocalDateTime(source.openingDate),
            periodEnd: parseLocalDateTime(source.closingDate),
            openingBalanceCents: source.openingBalanceCents,
            closingBalanceCents: source.closingBalanceCents,
            totalDebitCents: source.totalDebitCents,
            totalCreditCents: source.totalCreditCents,
            fileUrl: statement.file.fileUrl,
            fileName: statement.file.fileName.slice(0, 300),
            fileSha256: statement.sha,
            createdBy: actor.userId,
          })
          .returning({ id: bankStatementImports.id });
        importId = created.id;
      }
      touchedImports.add(importId);
    }

    for (const { context, decision } of lines) {
      const { line, source, existing } = context;
      let entryId: string | null = null;
      let cashEntryId: string | null = existing?.cashEntryId ?? null;
      const lineImportId = (existing?.importId ?? importId) as string;
      const counts = countsByImport.get(lineImportId) ?? {
        imported: 0,
        linked: 0,
        skipped: 0,
      };
      countsByImport.set(lineImportId, counts);

      if (decision.action === "import") {
        const occurredAt = parseLocalDateTime(line.operationDate);
        const entry = await insertAccountingEntry(
          tx,
          {
            type: line.type,
            status,
            accountId: account.id,
            categoryId: decision.categoryId,
            eventId: decision.eventId,
            label: decision.label,
            amountCents: line.amountCents,
            occurredAt,
            counterparty: clip(line.counterparty, 300),
            paymentMethod: line.paymentMethod,
            reference: clip(line.reference, 160),
            notes: entryNotes(statement, section, source),
          },
          actor,
        );
        entryId = entry.id;
        await recordAudit(
          actor,
          "accounting.create",
          "accounting_entry",
          entry.id,
          {
            type: entry.type,
            status: entry.status,
            amountCents: entry.amountCents,
            source: "bank_import",
            importId: lineImportId,
          },
          tx,
        );

        // L'écriture miroir en caisse annule le mouvement interne dans le
        // résultat. Une miroir restée d'un import précédent (seule l'écriture
        // bancaire avait été supprimée) est gardée, pas doublée.
        if (decision.cashAccountId && !cashEntryId) {
          const mirror = await insertAccountingEntry(
            tx,
            {
              type: line.type === "expense" ? "income" : "expense",
              status,
              accountId: decision.cashAccountId,
              categoryId: null,
              eventId: null,
              label: decision.label,
              amountCents: line.amountCents,
              occurredAt,
              counterparty: null,
              paymentMethod: "cash",
              reference: clip(line.reference, 160),
              notes: `Contrepartie en caisse de l’opération bancaire du ${frenchDay(line.operationDate)} (compte n° ${section.source.accountNumber}) : ${
                line.type === "expense"
                  ? "l’argent passe de la banque à la caisse."
                  : "l’argent passe de la caisse à la banque."
              }`,
            },
            actor,
          );
          cashEntryId = mirror.id;
          await recordAudit(
            actor,
            "accounting.create",
            "accounting_entry",
            mirror.id,
            {
              type: mirror.type,
              status: mirror.status,
              amountCents: mirror.amountCents,
              source: "bank_import",
              importId: lineImportId,
            },
            tx,
          );
        }
        counts.imported += 1;
      } else if (decision.action === "link") {
        entryId = decision.entryId;
        counts.linked += 1;
      } else {
        counts.skipped += 1;
      }

      const decisionValue =
        decision.action === "import"
          ? "imported"
          : decision.action === "link"
            ? "linked"
            : "skipped";

      if (existing) {
        // L'opération est déjà connue (son écriture avait été supprimée) :
        // on met à jour sa ligne, l'empreinte ne s'insère qu'une fois. Une
        // annulation de son import, passée depuis l'analyse, a emporté la
        // ligne : sans ce contrôle, l'écriture serait créée sans ligne qui la
        // suive, et l'opération redeviendrait importable une seconde fois.
        const [updated] = await tx
          .update(bankStatementLines)
          .set({ decision: decisionValue, entryId, cashEntryId })
          .where(eq(bankStatementLines.id, existing.id))
          .returning({ id: bankStatementLines.id });
        if (!updated) throw new HttpError(409, MESSAGE_CHANGED);
        touchedImports.add(existing.importId);
      } else {
        await tx.insert(bankStatementLines).values({
          importId: importId as string,
          fingerprint: line.fingerprint,
          operationDate: parseLocalDateTime(line.operationDate),
          valueDate: line.valueDate ? parseLocalDateTime(line.valueDate) : null,
          label: source.label,
          details: source.details.length ? source.details.join("\n") : null,
          amountCents: line.amountCents,
          direction: line.direction,
          decision: decisionValue,
          entryId,
          cashEntryId,
        });
      }
    }

    for (const [touchedId, counts] of countsByImport) {
      await recordAudit(
        actor,
        "accounting.bank_import",
        "bank_statement_import",
        touchedId,
        {
          bank: BANK,
          accountNumber: section.source.accountNumber,
          statementDate: statement.parsed.statementDate,
          accountId: account.id,
          ...counts,
        },
        tx,
      );
      totals.imported += counts.imported;
      totals.linked += counts.linked;
      totals.skipped += counts.skipped;
    }
  }

  // Compteurs recalculés d'après les lignes : un import repris ou une ligne
  // mise à jour ne les laisse jamais faux.
  const importIds = [...touchedImports];
  if (importIds.length) {
    const count = (decision: string) =>
      sql<number>`(select count(*)::int from bank_statement_lines l where l.import_id = "bank_statement_imports"."id" and l.decision = ${decision})`;
    await tx
      .update(bankStatementImports)
      .set({
        importedCount: count("imported"),
        linkedCount: count("linked"),
        skippedCount: count("skipped"),
      })
      .where(inArray(bankStatementImports.id, importIds));
  }

  return { importIds, ...totals };
}

/**
 * Solde de départ du compte, appris du plus ancien relevé importé : son solde
 * d'ouverture est le solde réel du compte ce jour-là. Un solde saisi à la
 * main n'est jamais remplacé ; un solde appris d'un relevé l'est quand on
 * importe ensuite un relevé plus ancien (on remonte le point de départ).
 */
async function learnOpeningBalances(
  tx: Transaction,
  planned: PlannedSection[],
  actor: AuditActor,
) {
  const earliest = new Map<string, { account: AccountRow; date: string; cents: number }>();
  for (const { account, section } of planned) {
    const { openingDate, openingBalanceCents } = section.source;
    const known = earliest.get(account.id);
    if (!known || openingDate < known.date) {
      earliest.set(account.id, { account, date: openingDate, cents: openingBalanceCents });
    }
  }
  for (const { account, date, cents } of earliest.values()) {
    const [current] = await tx
      .select({
        cents: financialAccounts.openingBalanceCents,
        date: financialAccounts.openingBalanceDate,
      })
      .from(financialAccounts)
      .where(eq(financialAccounts.id, account.id));
    if (current.date) {
      const currentDay = toDateInput(current.date);
      if (date >= currentDay) continue;
      // Plus ancien que le solde enregistré : on ne remonte que si celui-ci
      // venait lui-même d'un relevé, jamais par-dessus une saisie à la main.
      const [fromImport] = await tx
        .select({ id: bankStatementImports.id })
        .from(bankStatementImports)
        .where(
          and(
            eq(bankStatementImports.accountId, account.id),
            eq(bankStatementImports.periodStart, current.date),
            eq(bankStatementImports.openingBalanceCents, current.cents ?? 0),
          ),
        )
        .limit(1);
      if (!fromImport) continue;
    }
    await tx
      .update(financialAccounts)
      .set({
        openingBalanceCents: cents,
        openingBalanceDate: parseLocalDateTime(date),
        updatedAt: new Date(),
      })
      .where(eq(financialAccounts.id, account.id));
    await recordAudit(
      actor,
      "accounting.account_update",
      "financial_account",
      account.id,
      {
        changedFields: ["openingBalanceCents", "openingBalanceDate"],
        openingBalanceCents: cents,
        openingBalanceDate: date,
        source: "bank_import",
      },
      tx,
    );
  }
}

/* ------------------------------------------------------------------------ */
/* Historique et annulation                                                  */
/* ------------------------------------------------------------------------ */

async function importSummaries(
  lecteur: Lecteur,
  ids: string[] | null,
  limit = 50,
): Promise<BankImportSummary[]> {
  if (ids && !ids.length) return [];
  const rows = await lecteur
    .select({
      id: bankStatementImports.id,
      bank: bankStatementImports.bank,
      accountId: bankStatementImports.accountId,
      accountName: financialAccounts.name,
      accountNumber: bankStatementImports.accountNumber,
      statementDate: bankStatementImports.statementDate,
      periodStart: bankStatementImports.periodStart,
      periodEnd: bankStatementImports.periodEnd,
      openingBalanceCents: bankStatementImports.openingBalanceCents,
      closingBalanceCents: bankStatementImports.closingBalanceCents,
      importedCount: bankStatementImports.importedCount,
      linkedCount: bankStatementImports.linkedCount,
      skippedCount: bankStatementImports.skippedCount,
      fileUrl: bankStatementImports.fileUrl,
      fileName: bankStatementImports.fileName,
      createdAt: bankStatementImports.createdAt,
      createdByName: users.name,
      // Même règle que `undoBankImport` : annulable tant qu'aucune écriture
      // créée par l'import (ni sa miroir en caisse) n'a été validée.
      canUndo: sql<boolean>`not exists (
        select 1 from ${bankStatementLines} l
        join ${accountingEntries} e on e.id = l.entry_id or e.id = l.cash_entry_id
        where l.import_id = ${bankStatementImports.id}
          and (l.decision = 'imported' or e.id = l.cash_entry_id)
          and e.status = 'posted'
      )`,
    })
    .from(bankStatementImports)
    .leftJoin(
      financialAccounts,
      eq(bankStatementImports.accountId, financialAccounts.id),
    )
    .leftJoin(users, eq(bankStatementImports.createdBy, users.id))
    .where(ids ? inArray(bankStatementImports.id, ids) : undefined)
    .orderBy(desc(bankStatementImports.createdAt), desc(bankStatementImports.periodEnd))
    .limit(ids ? ids.length : Math.min(Math.max(limit, 1), 200));

  return rows.map((row) => ({
    ...row,
    bank: row.bank as SupportedBank,
    statementDate: row.statementDate ? toDateInput(row.statementDate) : null,
    periodStart: toDateInput(row.periodStart),
    periodEnd: toDateInput(row.periodEnd),
    createdAt: row.createdAt.toISOString(),
    canUndo: Boolean(row.canUndo),
  }));
}

/** Les derniers relevés importés, du plus récent au plus ancien. */
export async function listBankStatementImports(
  limit = 50,
): Promise<BankImportSummary[]> {
  return importSummaries(db, null, limit);
}

/**
 * Annule un import : supprime les brouillons qu'il a créés (et leurs
 * miroirs en caisse), puis ses lignes — ses opérations redeviennent
 * importables. Refusé dès qu'une de ces écritures a été validée : une
 * écriture validée est immuable. Les écritures seulement rattachées (`linked`)
 * existaient avant l'import : elles restent intactes. Le numéro de compte
 * appris au passage reste sur le compte : il est toujours juste.
 */
export async function undoBankImport(id: string, actor: AuditActor) {
  return db.transaction(async (tx) => {
    // Verrou sur le compte d'abord, puis sur l'import : l'ordre de
    // l'enregistrement. Un import en cours sur ce compte (qui reprend
    // peut-être une ligne de celui-ci) finit avant l'annulation, ou attend
    // qu'elle soit finie et refait son analyse — au lieu d'écrire dans une
    // ligne que l'annulation vient d'emporter, ou de s'interbloquer avec elle.
    const [peek] = await tx
      .select({ accountId: bankStatementImports.accountId })
      .from(bankStatementImports)
      .where(eq(bankStatementImports.id, id));
    if (!peek) throw new HttpError(404, "Import de relevé introuvable.");
    if (peek.accountId) {
      await tx
        .select({ id: financialAccounts.id })
        .from(financialAccounts)
        .where(eq(financialAccounts.id, peek.accountId))
        .for("update");
    }
    const [current] = await tx
      .select()
      .from(bankStatementImports)
      .where(eq(bankStatementImports.id, id))
      .for("update");
    if (!current) throw new HttpError(404, "Import de relevé introuvable.");

    const lines = await tx
      .select({
        decision: bankStatementLines.decision,
        entryId: bankStatementLines.entryId,
        cashEntryId: bankStatementLines.cashEntryId,
      })
      .from(bankStatementLines)
      .where(eq(bankStatementLines.importId, id));
    const entryIds = [
      ...new Set(
        lines.flatMap((line) => [
          ...(line.decision === "imported" && line.entryId ? [line.entryId] : []),
          ...(line.cashEntryId ? [line.cashEntryId] : []),
        ]),
      ),
    ];

    // Verrou exclusif : une validation en cours de l'une de ces écritures
    // passe avant (et l'annulation la voit), ou attend l'annulation.
    const entries = entryIds.length
      ? await tx
          .select({
            id: accountingEntries.id,
            status: accountingEntries.status,
            type: accountingEntries.type,
            amountCents: accountingEntries.amountCents,
          })
          .from(accountingEntries)
          .where(inArray(accountingEntries.id, entryIds))
          .orderBy(accountingEntries.id)
          .for("update")
      : [];
    const posted = entries.filter((entry) => entry.status === "posted").length;
    if (posted) {
      throw new HttpError(
        409,
        `${posted} écriture${posted > 1 ? "s" : ""} de ce relevé ${posted > 1 ? "ont" : "a"} déjà été validée${posted > 1 ? "s" : ""} : l’import ne peut plus être annulé. Corrigez les écritures une à une.`,
      );
    }

    await tx.delete(bankStatementImports).where(eq(bankStatementImports.id, id));
    if (entries.length) {
      await tx.delete(accountingEntries).where(
        and(
          inArray(
            accountingEntries.id,
            entries.map((entry) => entry.id),
          ),
          eq(accountingEntries.status, "draft"),
        ),
      );
    }

    // Le trésorier a pu retoucher ces brouillons depuis l'import (libellé,
    // catégorie, pièce jointe) : le journal dit lesquels ont disparu, dans
    // la trace de l'annulation et dans l'historique de chaque écriture,
    // comme une suppression à la main.
    for (const entry of entries) {
      await recordAudit(
        actor,
        "accounting.delete_draft",
        "accounting_entry",
        entry.id,
        {
          type: entry.type,
          amountCents: entry.amountCents,
          source: "bank_import_undo",
          importId: id,
        },
        tx,
      );
    }
    await recordAudit(
      actor,
      "accounting.bank_import_undo",
      "bank_statement_import",
      id,
      {
        bank: current.bank,
        accountNumber: current.accountNumber,
        statementDate: current.statementDate
          ? toDateInput(current.statementDate)
          : null,
        deletedEntries: entries.map((entry) => ({
          id: entry.id,
          type: entry.type,
          amountCents: entry.amountCents,
        })),
        lines: lines.length,
      },
      tx,
    );
    return { deletedEntries: entries.length };
  });
}

/* ------------------------------------------------------------------------ */
/* Rapprochement après coup                                                  */
/* ------------------------------------------------------------------------ */

/** Écritures proposées : même sens, même montant, à six semaines près. */
const RELINK_WINDOW_DAYS = 45;
const RELINK_MAX_CANDIDATES = 20;

/**
 * Ligne de relevé qui a créé cette écriture, avec son import. Seule une
 * écriture créée par un import (`imported`) se rattache après coup : une
 * écriture saisie à la main n'a pas d'opération à céder.
 */
async function importedLineOf(lecteur: Lecteur, entryId: string) {
  const [row] = await lecteur
    .select({
      lineId: bankStatementLines.id,
      importId: bankStatementLines.importId,
      operationDate: bankStatementLines.operationDate,
      valueDate: bankStatementLines.valueDate,
      label: bankStatementLines.label,
      details: bankStatementLines.details,
      amountCents: bankStatementLines.amountCents,
      direction: bankStatementLines.direction,
      accountId: bankStatementImports.accountId,
      statementDate: bankStatementImports.statementDate,
    })
    .from(bankStatementLines)
    .innerJoin(
      bankStatementImports,
      eq(bankStatementLines.importId, bankStatementImports.id),
    )
    .where(
      and(
        eq(bankStatementLines.entryId, entryId),
        eq(bankStatementLines.decision, "imported"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Filtre des écritures qui peuvent recevoir l'opération. */
function relinkFilter(
  entryId: string,
  line: NonNullable<Awaited<ReturnType<typeof importedLineOf>>>,
) {
  return and(
    sql`${accountingEntries.id} <> ${entryId}`,
    eq(accountingEntries.type, line.direction === "credit" ? "income" : "expense"),
    eq(accountingEntries.amountCents, line.amountCents),
    // Saisie sur le même compte, ou sans compte : une écriture d'un autre
    // compte bancaire ou de la caisse n'est pas ce mouvement-là.
    line.accountId
      ? or(eq(accountingEntries.accountId, line.accountId), isNull(accountingEntries.accountId))
      : undefined,
    // Déjà rattachée à une opération (ou créée par un import) : elle a la
    // sienne.
    sql`not exists (select 1 from ${bankStatementLines} where ${bankStatementLines.entryId} = ${accountingEntries.id} or ${bankStatementLines.cashEntryId} = ${accountingEntries.id})`,
  );
}

export async function getBankLinkOptions(entryId: string): Promise<BankLinkOptions> {
  const line = await importedLineOf(db, entryId);
  if (!line) {
    throw new HttpError(404, "Cette écriture n’a pas été créée par un import de relevé.");
  }
  const operationDate = toDateInput(line.operationDate);
  const purchaseDate = cardPurchaseDate(line.label, operationDate);
  const reference = purchaseDate ?? operationDate;
  const rows = await db
    .select({
      id: accountingEntries.id,
      label: accountingEntries.label,
      amountCents: accountingEntries.amountCents,
      occurredAt: accountingEntries.occurredAt,
      status: accountingEntries.status,
      counterparty: accountingEntries.counterparty,
      attachmentUrl: accountingEntries.attachmentUrl,
      accountName: financialAccounts.name,
      categoryName: accountingCategories.name,
    })
    .from(accountingEntries)
    .leftJoin(financialAccounts, eq(accountingEntries.accountId, financialAccounts.id))
    .leftJoin(accountingCategories, eq(accountingEntries.categoryId, accountingCategories.id))
    .where(
      and(
        relinkFilter(entryId, line),
        gte(
          accountingEntries.occurredAt,
          parseLocalDateTime(shiftDay(reference, -RELINK_WINDOW_DAYS)),
        ),
        lt(
          accountingEntries.occurredAt,
          parseLocalDateTime(shiftDay(operationDate, RELINK_WINDOW_DAYS + 1)),
        ),
      ),
    );
  const candidates = rows
    .map((row) => ({ row, day: toDateInput(row.occurredAt) }))
    .sort(
      (a, b) =>
        dayDistance(a.day, reference) - dayDistance(b.day, reference) ||
        b.row.occurredAt.getTime() - a.row.occurredAt.getTime(),
    )
    .slice(0, RELINK_MAX_CANDIDATES)
    .map(({ row }) => ({
      entryId: row.id,
      label: row.label,
      amountCents: row.amountCents,
      occurredAt: row.occurredAt.toISOString(),
      status: row.status,
      accountName: row.accountName,
      categoryName: row.categoryName,
      counterparty: row.counterparty,
      hasAttachment: Boolean(row.attachmentUrl),
    }));
  return {
    line: {
      operationDate,
      valueDate: line.valueDate ? toDateInput(line.valueDate) : null,
      purchaseDate,
      label: line.label,
      details: line.details ? line.details.split("\n").filter(Boolean) : [],
      amountCents: line.amountCents,
      direction: line.direction as "debit" | "credit",
      statementDate: line.statementDate ? toDateInput(line.statementDate) : null,
    },
    candidates,
  };
}

/**
 * Rattache l'opération du relevé à une écriture existante et supprime le
 * brouillon que l'import avait créé pour elle. L'écriture choisie n'est pas
 * modifiée — ni son justificatif, ni sa catégorie, ni son statut —, sauf un
 * brouillon sans compte, qui reçoit le compte du relevé : c'est bien sur ce
 * compte que l'argent a bougé.
 */
export async function relinkImportedEntry(
  entryId: string,
  targetEntryId: string,
  actor: AuditActor,
) {
  if (entryId === targetEntryId) {
    throw new HttpError(400, "Choisissez une autre écriture que celle créée par l’import.");
  }
  return db.transaction(async (tx) => {
    const line = await importedLineOf(tx, entryId);
    if (!line) {
      throw new HttpError(409, "Cette écriture n’est plus rattachée à une opération importée.");
    }
    await tx
      .select({ id: bankStatementLines.id })
      .from(bankStatementLines)
      .where(eq(bankStatementLines.id, line.lineId))
      .for("update");
    // Les deux écritures verrouillées dans l'ordre des identifiants, comme
    // partout ailleurs : pas d'interblocage avec un import en cours.
    const locked = await tx
      .select()
      .from(accountingEntries)
      .where(inArray(accountingEntries.id, [entryId, targetEntryId]))
      .orderBy(accountingEntries.id)
      .for("update");
    const source = locked.find((entry) => entry.id === entryId);
    const target = locked.find((entry) => entry.id === targetEntryId);
    if (!source) throw new HttpError(409, "L’écriture importée n’existe plus.");
    if (source.status !== "draft") {
      throw new HttpError(
        409,
        "L’écriture importée a déjà été validée : elle est immuable et ne peut plus être remplacée.",
      );
    }
    if (!target) throw new HttpError(404, "L’écriture choisie n’existe plus.");
    const [eligible] = await tx
      .select({ id: accountingEntries.id })
      .from(accountingEntries)
      .where(and(eq(accountingEntries.id, targetEntryId), relinkFilter(entryId, line)))
      .limit(1);
    if (!eligible) {
      throw new HttpError(
        409,
        "L’écriture choisie ne peut pas recevoir cette opération : sens, montant ou compte différents, ou déjà rattachée à une autre opération.",
      );
    }
    const [{ n: payments }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(membershipPayments)
      .where(eq(membershipPayments.entryId, entryId));
    if (Number(payments) > 0) {
      throw new HttpError(
        409,
        "Des cotisations sont pointées sur l’écriture importée : retirez d’abord ce pointage.",
      );
    }

    await tx
      .update(bankStatementLines)
      .set({ entryId: targetEntryId, decision: "linked" })
      .where(eq(bankStatementLines.id, line.lineId));
    if (target.status === "draft" && !target.accountId && line.accountId) {
      await tx
        .update(accountingEntries)
        .set({ accountId: line.accountId, version: target.version + 1, updatedAt: new Date() })
        .where(eq(accountingEntries.id, targetEntryId));
    }
    await tx.delete(accountingEntries).where(eq(accountingEntries.id, entryId));
    const count = (decision: string) =>
      sql<number>`(select count(*)::int from bank_statement_lines l where l.import_id = "bank_statement_imports"."id" and l.decision = ${decision})`;
    await tx
      .update(bankStatementImports)
      .set({ importedCount: count("imported"), linkedCount: count("linked") })
      .where(eq(bankStatementImports.id, line.importId));

    await recordAudit(
      actor,
      "accounting.bank_line_relink",
      "accounting_entry",
      targetEntryId,
      {
        importId: line.importId,
        lineId: line.lineId,
        deletedEntry: { id: entryId, type: source.type, amountCents: source.amountCents },
      },
      tx,
    );
    return { entryId: targetEntryId };
  });
}
