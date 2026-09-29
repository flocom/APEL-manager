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
  DuplicateCandidate,
  LineDecision,
  SupportedBank,
} from "@/lib/banking/import-types";
import { analyzeLabel, labelKey, normalizeLabel } from "@/lib/banking/labels";
import { parseLocalDateTime, toDateInput } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  accountingCategories,
  accountingEntries,
  bankStatementImports,
  bankStatementLines,
  events,
  financialAccounts,
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

/** Compte proposé pour une section de relevé, et pourquoi. */
function suggestAccount(
  accounts: AccountRow[],
  accountNumber: string,
): Pick<AnalyzedSection, "suggestedAccountId" | "accountMatch"> {
  const byNumber = accounts.find((a) => a.bankAccountNumber === accountNumber);
  if (byNumber) {
    // Rattaché à un compte archivé : ne rien proposer d'autre, l'enregistrement
    // refuserait de toute façon de donner ce numéro à un second compte.
    return byNumber.isActive
      ? { suggestedAccountId: byNumber.id, accountMatch: "number" }
      : { suggestedAccountId: null, accountMatch: "none" };
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
  return { suggestedAccountId: null, accountMatch: "none" };
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

  const batch = new Set<string>();
  const statements: StatementContext[] = [];
  const analyzed: AnalyzedStatement[] = [];

  for (const read of reads) {
    if (!read.ok) {
      analyzed.push(read.statement);
      continue;
    }
    const sections: SectionContext[] = [];
    for (const source of read.parsed.sections) {
      const key = `${read.sha}:${source.accountNumber}`;
      const suggestion = suggestAccount(accounts, source.accountNumber);
      const prints = fingerprints(source.accountNumber, source.lines);
      const previous = previousByKey.get(key) ?? null;

      // Écritures qui pourraient être ces opérations, saisies à la main ou
      // par un autre moyen : même montant, date proche, sur le compte
      // proposé ou sans compte. Une écriture déjà rattachée à une ligne de
      // relevé est hors jeu — elle a déjà son opération.
      const amounts = [...new Set(source.lines.map((line) => line.amountCents))];
      const sectionDays = source.lines.flatMap((line) =>
        line.valueDate ? [line.operationDate, line.valueDate] : [line.operationDate],
      );
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
                        -DOUBT_WINDOW_DAYS - 1,
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
                  suggestion.suggestedAccountId
                    ? or(
                        eq(accountingEntries.accountId, suggestion.suggestedAccountId),
                        isNull(accountingEntries.accountId),
                      )
                    : undefined,
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

        const stored = linesByFingerprint.get(fingerprint);
        const entryDeleted =
          stored &&
          (stored.decision === "imported" || stored.decision === "linked") &&
          !stored.entryId;
        if (stored && !entryDeleted) {
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
        // Avant la reprise d'une écriture supprimée : la même opération
        // présente dans deux relevés de l'envoi ne se décide qu'une fois.
        if (batch.has(fingerprint)) {
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
        batch.add(fingerprint);

        if (stored) {
          line.state = "doubt";
          line.doubtReason = "deleted_entry";
          existing = {
            id: stored.id,
            importId: stored.importId,
            cashEntryId: stored.cashEntryId,
          };
        } else {
          const days = parsedLine.valueDate
            ? [parsedLine.operationDate, parsedLine.valueDate].sort()
            : [parsedLine.operationDate];
          const from = shiftDay(days[0], -DOUBT_WINDOW_DAYS);
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
      constraint === "bank_statement_imports_file_account_idx"
    ) {
      throw new HttpError(409, MESSAGE_CONCURRENT);
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

  type Planned = {
    statement: StatementContext;
    section: SectionContext;
    account: AccountRow;
    lines: { context: LineContext; decision: LineDecision }[];
  };
  const planned: Planned[] = [];
  const decided = new Set<string>();
  const ignorable = new Set<string>();
  const linkedEntries = new Set<string>();
  let importedSections = 0;

  for (const statement of statements) {
    for (const section of statement.sections) {
      const actionable = section.lines.filter(
        (context) => context.line.state !== "already_imported",
      );
      const accountId = sectionChoice.get(section.section.key) ?? null;
      if (!accountId) {
        // Section laissée de côté : ses décisions éventuelles sont ignorées.
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
      const bound = numberToSet.get(account.id) ?? account.bankAccountNumber;
      if (bound && bound !== number) {
        throw new HttpError(
          409,
          `Ce relevé concerne le compte n° ${number}, et « ${account.name} » est rattaché au n° ${bound}.`,
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
      if (!bound) numberToSet.set(account.id, number);

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
  if (!importedSections) {
    throw new HttpError(
      400,
      "Choisissez le compte de destination d’au moins un relevé.",
    );
  }
  if (!planned.length) {
    throw new HttpError(
      409,
      "Ce relevé a déjà été importé : il n’y a rien de nouveau à enregistrer.",
    );
  }

  // --- Écritures ----------------------------------------------------------
  for (const [accountId, number] of numberToSet) {
    await tx
      .update(financialAccounts)
      .set({ bankAccountNumber: number, updatedAt: new Date() })
      .where(eq(financialAccounts.id, accountId));
  }

  const touchedImports = new Set<string>();
  const totals = { imported: 0, linked: 0, skipped: 0 };

  for (const { statement, section, account, lines } of planned) {
    const counts = { imported: 0, linked: 0, skipped: 0 };
    let importId: string | null = null;
    const needsImportRow = lines.some(({ context }) => !context.existing);
    if (needsImportRow) {
      // Même fichier, même compte, déjà importé une fois : les nouvelles
      // lignes rejoignent cet import plutôt que d'en créer un second.
      importId = section.previousImportId;
      if (!importId) {
        const source = section.source;
        const [created] = await tx
          .insert(bankStatementImports)
          .values({
            bank: BANK,
            accountId: account.id,
            accountNumber: source.accountNumber,
            accountLabel: source.accountLabel,
            iban: statement.parsed.iban,
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
        // on met à jour sa ligne, l'empreinte ne s'insère qu'une fois.
        await tx
          .update(bankStatementLines)
          .set({ decision: decisionValue, entryId, cashEntryId })
          .where(eq(bankStatementLines.id, existing.id));
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

    await recordAudit(
      actor,
      "accounting.bank_import",
      "bank_statement_import",
      importId,
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
          .select({ id: accountingEntries.id, status: accountingEntries.status })
          .from(accountingEntries)
          .where(inArray(accountingEntries.id, entryIds))
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
        deletedEntries: entries.length,
        lines: lines.length,
      },
      tx,
    );
    return { deletedEntries: entries.length };
  });
}
