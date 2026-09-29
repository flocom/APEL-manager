"use client";

import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  FileText,
  FileUp,
  Info,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { CategorySelect } from "@/components/accounting/category-picker";
import type {
  AccountingCategoryPayload,
  AccountingCategoryView,
  AccountingEventView,
} from "@/components/accounting/types";
import { CreditMutuelEmblem, CreditMutuelLogo } from "@/components/bank-logos";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { FinancialAccountView } from "@/components/financial-accounts-manager";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import type {
  AnalyzedLine,
  AnalyzedSection,
  AnalyzedStatement,
  BankImportAnalysis,
  BankImportCommitRequest,
  BankImportCommitResult,
  BankImportSummary,
  EntryPaymentMethod,
  LineDecision,
  SupportedBank,
} from "@/lib/banking/import-types";
import { SUPPORTED_BANKS } from "@/lib/banking/import-types";
import { api, ApiError } from "@/lib/client";
import { formatShortDate } from "@/lib/dates";
import { formatEuros, formatEurosAbsolute } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Limites vérifiées dans le navigateur, avant tout envoi : un relevé
 * mensuel pèse quelques centaines de Ko, et une année tient en 12 fichiers.
 * Le serveur a ses propres plafonds ; ceux-ci évitent seulement d'attendre
 * un refus après un long téléversement.
 */
const MAX_FILES = 12;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Valeur du sélecteur de compte : section laissée de côté. */
const SKIP_SECTION = "__skip__";
const HEADING_ID = "bank-import-step-heading";

const PAYMENT_LABELS: Record<EntryPaymentMethod, string> = {
  bank_transfer: "Virement",
  card: "Carte bancaire",
  check: "Chèque",
  cash: "Espèces",
  direct_debit: "Prélèvement",
  other: "Autre",
};

type Step = "bank" | "files" | "review" | "done";

type SelectedFile = {
  key: string;
  file: File;
  /** URL du fichier téléversé : un nouvel essai ne le renvoie pas. */
  url: string | null;
  status: "ready" | "uploading" | "uploaded" | "error";
  error: string | null;
};

type LineChoice = {
  /** Opération nouvelle : l'importer (sinon elle est écartée). */
  include: boolean;
  label: string;
  categoryId: string;
  eventId: string;
  /** Mouvement d'espèces : caisse de l'écriture miroir ("" : aucune). */
  cashAccountId: string;
  /** Doublon possible : rien tant que le trésorier n'a pas tranché. */
  doubt: "" | "import" | "skip" | `link:${string}`;
};

type OkStatement = Extract<AnalyzedStatement, { ok: true }>;

/* ------------------------------------------------------------------------ */
/* Dates et montants                                                         */
/* ------------------------------------------------------------------------ */

/** « 2026-03-31 » → « 31/03/2026 », sans passer par un instant (pas de fuseau). */
function frDay(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

const LONG_DAY = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** « 2026-03-31 » → « 31 mars 2026 ». Lu en UTC : la date du relevé est un jour, pas un instant. */
function frLongDay(day: string) {
  return LONG_DAY.format(new Date(`${day}T00:00:00Z`));
}

function signedAmount(line: Pick<AnalyzedLine, "direction" | "amountCents">) {
  return `${line.direction === "credit" ? "+" : "−"} ${formatEurosAbsolute(line.amountCents)}`;
}

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

function isPdf(file: File) {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

/* ------------------------------------------------------------------------ */
/* Composant principal                                                       */
/* ------------------------------------------------------------------------ */

export function BankStatementImport({
  accounts,
  categories,
  events,
  imports,
  onCategoryCreated,
  onClose,
}: {
  accounts: FinancialAccountView[];
  categories: AccountingCategoryView[];
  events: AccountingEventView[];
  imports: BankImportSummary[];
  onCategoryCreated: (category: AccountingCategoryPayload) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<Step>("bank");
  const [bank, setBank] = useState<SupportedBank | null>(null);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [phase, setPhase] = useState<
    "idle" | "uploading" | "analyzing" | "committing"
  >("idle");
  const [progress, setProgress] = useState("");
  const [analysis, setAnalysis] = useState<BankImportAnalysis | null>(null);
  const [analyzedFiles, setAnalyzedFiles] = useState<
    { fileUrl: string; fileName: string }[]
  >([]);
  const [sectionAccounts, setSectionAccounts] = useState<
    Record<string, string>
  >({});
  const [choices, setChoices] = useState<Record<string, LineChoice>>({});
  const [entryStatus, setEntryStatus] = useState<"draft" | "posted">("draft");
  const [conflict, setConflict] = useState<string | null>(null);
  const [result, setResult] = useState<BankImportCommitResult | null>(null);
  const [pendingUndo, setPendingUndo] = useState<BankImportSummary | null>(
    null,
  );
  const [undoing, setUndoing] = useState(false);

  const busy = phase !== "idle";

  const bankAccounts = useMemo(
    () => accounts.filter((account) => account.isActive && account.type === "bank"),
    [accounts],
  );
  const cashAccounts = useMemo(
    () => accounts.filter((account) => account.isActive && account.type === "cash"),
    [accounts],
  );
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  // Chaque étape reçoit le focus sur son titre : au clavier ou au lecteur
  // d'écran, on sait où l'on est arrivé sans devoir remonter la page.
  useEffect(() => {
    document.getElementById(HEADING_ID)?.focus();
  }, [step]);

  /* ---- Relevés choisis -------------------------------------------------- */

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    if (incoming.length === 0) return;
    const errors: string[] = [];
    const next = [...files];
    for (const file of incoming) {
      if (!isPdf(file)) {
        errors.push(`« ${file.name} » n’est pas un PDF.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        errors.push(`« ${file.name} » dépasse 10 Mo.`);
        continue;
      }
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (next.some((item) => item.key === key)) continue;
      if (next.length >= MAX_FILES) {
        errors.push(
          `Au plus ${MAX_FILES} relevés à la fois : « ${file.name} » n’a pas été ajouté.`,
        );
        continue;
      }
      next.push({ key, file, url: null, status: "ready", error: null });
    }
    setFiles(next);
    setFileErrors(errors);
  }

  function removeFile(key: string) {
    setFiles((current) => current.filter((item) => item.key !== key));
    setFileErrors([]);
  }

  async function uploadOne(item: SelectedFile): Promise<string> {
    const body = new FormData();
    body.set("scope", "accounting");
    body.set("file", item.file);
    const response = await fetch("/api/uploads", {
      method: "POST",
      body,
      credentials: "same-origin",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      file?: { url?: string };
    };
    if (!response.ok || !payload.file?.url) {
      throw new Error(payload.error || "Envoi du fichier impossible.");
    }
    return payload.file.url;
  }

  async function uploadAndAnalyze() {
    if (!bank || files.length === 0) return;
    setPhase("uploading");
    setFileErrors([]);
    const uploaded: { fileUrl: string; fileName: string }[] = [];
    let failed = false;
    const current = [...files];
    for (let index = 0; index < current.length; index += 1) {
      const item = current[index];
      if (item.url) {
        uploaded.push({ fileUrl: item.url, fileName: item.file.name });
        continue;
      }
      setProgress(
        `Envoi du relevé ${index + 1} sur ${current.length} : ${item.file.name}…`,
      );
      current[index] = { ...item, status: "uploading", error: null };
      setFiles([...current]);
      try {
        const url = await uploadOne(item);
        current[index] = { ...item, url, status: "uploaded", error: null };
        uploaded.push({ fileUrl: url, fileName: item.file.name });
      } catch (error) {
        failed = true;
        current[index] = {
          ...item,
          status: "error",
          error: (error as Error).message,
        };
      }
      setFiles([...current]);
    }
    if (failed) {
      // On n'analyse pas une sélection incomplète : le trésorier retire ou
      // renvoie le fichier en cause, les autres ne seront pas renvoyés.
      setPhase("idle");
      setProgress("");
      toast("Un relevé n’a pas pu être envoyé : retirez-le ou réessayez.", "error");
      return;
    }
    await analyze(uploaded, false);
  }

  /* ---- Analyse ---------------------------------------------------------- */

  async function analyze(
    selection: { fileUrl: string; fileName: string }[],
    rerun: boolean,
  ) {
    if (!bank) return;
    setPhase("analyzing");
    setProgress(
      selection.length > 1
        ? `Lecture et vérification des ${selection.length} relevés…`
        : "Lecture et vérification du relevé…",
    );
    try {
      const { analysis: next } = await api<{
        ok: true;
        analysis: BankImportAnalysis;
      }>("/api/accounting/bank-imports/analyze", {
        body: { bank, files: selection },
      });
      setAnalysis(next);
      setAnalyzedFiles(selection);
      setConflict(null);
      initDecisions(next, rerun);
      setStep("review");
      if (rerun) {
        toast("Analyse relancée : vos choix ont été conservés quand c’était possible.");
        document.getElementById(HEADING_ID)?.focus();
      }
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setPhase("idle");
      setProgress("");
    }
  }

  /**
   * Prépare les choix de chaque opération. Après une analyse relancée, on
   * garde ce que le trésorier avait déjà saisi (libellés, catégories…) pour
   * les opérations qui n'ont pas changé ; un doute n'est gardé tranché que si
   * ses écritures candidates sont toujours là.
   */
  function initDecisions(next: BankImportAnalysis, keepPrevious: boolean) {
    const knownCategories = new Set(
      categories.filter((c) => c.isActive).map((c) => c.id),
    );
    const knownEvents = new Set(events.map((event) => event.id));
    const defaultCash = cashAccounts[0]?.id ?? "";
    const nextChoices: Record<string, LineChoice> = {};
    const nextAccounts: Record<string, string> = {};
    for (const statement of next.statements) {
      if (!statement.ok) continue;
      for (const section of statement.sections) {
        const previousAccount = keepPrevious
          ? sectionAccounts[section.key]
          : undefined;
        const suggested =
          section.suggestedAccountId &&
          bankAccounts.some((a) => a.id === section.suggestedAccountId)
            ? section.suggestedAccountId
            : "";
        nextAccounts[section.key] = previousAccount ?? suggested;
        for (const line of section.lines) {
          if (line.state === "already_imported") continue;
          const previous = keepPrevious ? choices[line.fingerprint] : undefined;
          const candidateIds = new Set(line.candidates.map((c) => c.entryId));
          const keptDoubt =
            previous && line.state === "doubt"
              ? previous.doubt.startsWith("link:")
                ? candidateIds.has(previous.doubt.slice(5))
                  ? previous.doubt
                  : ""
                : previous.doubt
              : "";
          nextChoices[line.fingerprint] = {
            include: previous?.include ?? true,
            label: previous?.label ?? line.label,
            categoryId:
              previous?.categoryId ??
              (line.suggestedCategoryId &&
              knownCategories.has(line.suggestedCategoryId)
                ? line.suggestedCategoryId
                : ""),
            eventId:
              previous?.eventId ??
              (line.suggestedEventId && knownEvents.has(line.suggestedEventId)
                ? line.suggestedEventId
                : ""),
            cashAccountId: previous?.cashAccountId ?? defaultCash,
            doubt: keptDoubt,
          };
        }
      }
    }
    setSectionAccounts(nextAccounts);
    setChoices(nextChoices);
  }

  /* ---- Lignes ----------------------------------------------------------- */

  const okStatements = useMemo(
    () =>
      (analysis?.statements ?? []).filter(
        (statement): statement is OkStatement => statement.ok,
      ),
    [analysis],
  );

  const lineIndex = useMemo(() => {
    const index = new Map<string, AnalyzedLine>();
    for (const statement of okStatements) {
      for (const section of statement.sections) {
        for (const line of section.lines) {
          if (line.state !== "already_imported") index.set(line.fingerprint, line);
        }
      }
    }
    return index;
  }, [okStatements]);

  // Les rappels des lignes restent stables (lignes mémoïsées) : ils lisent
  // les choix courants dans une ref plutôt que de dépendre de l'état.
  const choicesRef = useRef(choices);
  useEffect(() => {
    choicesRef.current = choices;
  }, [choices]);

  const updateLine = useCallback(
    (fingerprint: string, patch: Partial<LineChoice>) => {
      setChoices((current) => ({
        ...current,
        [fingerprint]: { ...current[fingerprint], ...patch },
      }));
    },
    [],
  );

  const setLineCategory = useCallback(
    (fingerprint: string, categoryId: string) => {
      const current = choicesRef.current;
      const line = lineIndex.get(fingerprint);
      const next = {
        ...current,
        [fingerprint]: { ...current[fingerprint], categoryId },
      };
      let propagated = 0;
      // Les opérations semblables (même libellé réduit, même sens) encore
      // sans catégorie reçoivent la même : on classe les frais bancaires
      // ou les virements HelloAsso d'une année en un seul choix.
      if (line && categoryId) {
        for (const [otherKey, other] of lineIndex) {
          if (otherKey === fingerprint) continue;
          if (other.labelKey !== line.labelKey || other.type !== line.type) continue;
          if (!line.labelKey || next[otherKey]?.categoryId) continue;
          next[otherKey] = { ...next[otherKey], categoryId };
          propagated += 1;
        }
      }
      choicesRef.current = next;
      setChoices(next);
      if (propagated > 0) {
        toast(
          propagated > 1
            ? `Appliquée aussi aux ${propagated} opérations semblables.`
            : "Appliquée aussi à 1 opération semblable.",
        );
      }
    },
    [lineIndex, toast],
  );

  /* ---- Bilan de la vérification ---------------------------------------- */

  const summary = useMemo(() => {
    let toImport = 0;
    let toLink = 0;
    let toSkip = 0;
    let already = 0;
    let unresolved = 0;
    let missingAccount = 0;
    let accountConflict = 0;
    let firstDoubt: string | null = null;
    let firstMissingSection: string | null = null;
    for (const statement of okStatements) {
      for (const section of statement.sections) {
        const choice = sectionAccounts[section.key] ?? "";
        const actionable = section.lines.filter(
          (line) => line.state !== "already_imported",
        );
        already += section.lines.length - actionable.length;
        if (choice === SKIP_SECTION || actionable.length === 0) continue;
        if (!choice) {
          missingAccount += 1;
          firstMissingSection ??= section.key;
          continue;
        }
        if (accountProblem(section, choice, accounts)) accountConflict += 1;
        for (const line of actionable) {
          const decision = choices[line.fingerprint];
          if (!decision) continue;
          if (line.state === "doubt") {
            if (!decision.doubt) {
              unresolved += 1;
              firstDoubt ??= line.fingerprint;
            } else if (decision.doubt === "import") toImport += 1;
            else if (decision.doubt === "skip") toSkip += 1;
            else toLink += 1;
          } else if (decision.include) toImport += 1;
          else toSkip += 1;
        }
      }
    }
    return {
      toImport,
      toLink,
      toSkip,
      already,
      unresolved,
      missingAccount,
      accountConflict,
      firstDoubt,
      firstMissingSection,
    };
  }, [accounts, choices, okStatements, sectionAccounts]);

  const blocker =
    summary.missingAccount > 0
      ? "Choisissez le compte de destination de chaque relevé, ou « Ne pas importer ce compte »."
      : summary.accountConflict > 0
        ? "Un compte choisi est rattaché à un autre numéro : choisissez le bon compte."
        : summary.unresolved > 0
          ? `Tranchez ${summary.unresolved > 1 ? `les ${summary.unresolved} doublons possibles` : "le doublon possible"} avant d’importer.`
          : summary.toImport + summary.toLink + summary.toSkip === 0
            ? "Rien à enregistrer : tout est déjà importé ou laissé de côté."
            : null;

  /* ---- Enregistrement --------------------------------------------------- */

  function buildRequest(): BankImportCommitRequest | null {
    if (!analysis || !bank) return null;
    const decisions: LineDecision[] = [];
    const statements = okStatements.map((statement) => ({
      fileUrl: statement.fileUrl,
      fileName: statement.fileName,
      sections: statement.sections.map((section) => {
        const choice = sectionAccounts[section.key] ?? "";
        const accountId = choice && choice !== SKIP_SECTION ? choice : null;
        if (accountId) {
          for (const line of section.lines) {
            if (line.state === "already_imported") continue;
            const decision = choices[line.fingerprint];
            const action =
              line.state === "doubt"
                ? decision.doubt
                : decision.include
                  ? "import"
                  : "skip";
            if (action === "skip") {
              decisions.push({ fingerprint: line.fingerprint, action: "skip" });
            } else if (action.startsWith("link:")) {
              decisions.push({
                fingerprint: line.fingerprint,
                action: "link",
                entryId: action.slice(5),
              });
            } else if (action === "import") {
              decisions.push({
                fingerprint: line.fingerprint,
                action: "import",
                label: decision.label.trim() || line.label,
                categoryId: decision.categoryId || null,
                eventId: decision.eventId || null,
                cashAccountId:
                  line.cashMovement && decision.cashAccountId
                    ? decision.cashAccountId
                    : null,
              });
            }
          }
        }
        return { key: section.key, accountId };
      }),
    }));
    return {
      bank,
      token: analysis.token,
      status: entryStatus,
      statements,
      decisions,
    };
  }

  async function commit() {
    const body = buildRequest();
    if (!body || blocker) return;
    setPhase("committing");
    setProgress("Enregistrement des écritures…");
    setConflict(null);
    try {
      const { result: saved } = await api<{
        ok: true;
        result: BankImportCommitResult;
      }>("/api/accounting/bank-imports", { body });
      const parts = [
        plural(saved.imported, "écriture créée", "écritures créées"),
        ...(saved.linked
          ? [plural(saved.linked, "rattachée", "rattachées")]
          : []),
        ...(saved.skipped
          ? [plural(saved.skipped, "opération écartée", "opérations écartées")]
          : []),
      ];
      toast(`Relevé importé : ${parts.join(", ")}.`);
      setResult(saved);
      setStep("done");
      router.refresh();
    } catch (error) {
      const message = (error as Error).message;
      // Un conflit (analyse périmée, import concurrent, numéro de compte
      // déjà pris) se règle en relançant l'analyse : on le garde affiché
      // avec le bouton, plutôt qu'un toast qui s'efface.
      if (
        (error instanceof ApiError && error.status === 409) ||
        /relancez l’analyse/i.test(message)
      ) {
        setConflict(message);
      } else {
        toast(message, "error");
      }
    } finally {
      setPhase("idle");
      setProgress("");
    }
  }

  function focusFirstDoubt() {
    if (!summary.firstDoubt) return;
    const fieldset = document.getElementById(`doubt-${summary.firstDoubt}`);
    fieldset?.scrollIntoView({ behavior: "smooth", block: "center" });
    fieldset?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }

  function focusFirstMissingSection() {
    if (!summary.firstMissingSection) return;
    const select = document.getElementById(
      `section-account-${summary.firstMissingSection}`,
    );
    select?.scrollIntoView({ behavior: "smooth", block: "center" });
    select?.focus({ preventScroll: true });
  }

  function restart() {
    setFiles([]);
    setFileErrors([]);
    setAnalysis(null);
    setAnalyzedFiles([]);
    setChoices({});
    setSectionAccounts({});
    setConflict(null);
    setResult(null);
    setEntryStatus("draft");
    setStep("files");
  }

  async function undoImport() {
    if (!pendingUndo) return;
    setUndoing(true);
    try {
      await api(`/api/accounting/bank-imports/${pendingUndo.id}`, {
        method: "DELETE",
      });
      toast("Import annulé : ses brouillons ont été supprimés.");
      setPendingUndo(null);
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setUndoing(false);
    }
  }

  /* ---- Rendu ------------------------------------------------------------ */

  // Pas d'`overflow-hidden` sur la carte : il empêcherait le pied de la
  // vérification de rester collé en bas de l'écran. Les coins arrondis sont
  // repris sur l'en-tête et le pied.
  return (
    <Card>
      <div className="flex items-start justify-between gap-3 rounded-t-[14px] border-b-2 border-slate-100 bg-brand-50 px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">
            Import de relevés
          </p>
          <h2 className="mt-1 text-xl font-bold text-brand-950">
            Importer un relevé bancaire
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="Fermer l’import"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <Stepper step={step} />

      <div className="p-5 sm:p-6">
        {step === "bank" && (
          <BankStep
            bank={bank}
            onBank={setBank}
            onContinue={() => setStep("files")}
          />
        )}

        {step === "files" && bank && (
          <FilesStep
            files={files}
            errors={fileErrors}
            busy={busy}
            progress={progress}
            onAdd={addFiles}
            onRemove={removeFile}
            onBack={() => setStep("bank")}
            onAnalyze={() => void uploadAndAnalyze()}
          />
        )}

        {step === "review" && analysis && (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3
                  id={HEADING_ID}
                  tabIndex={-1}
                  className="text-lg font-bold text-slate-950 focus:outline-none"
                >
                  Vérification
                </h3>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">
                  Choisissez le compte de destination, vérifiez les
                  opérations et tranchez les doublons possibles. Rien n’est
                  enregistré avant le bouton « Importer ».
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={ArrowLeft}
                disabled={busy}
                onClick={() => setStep("files")}
                className="shrink-0"
              >
                Changer les relevés
              </Button>
            </div>

            {conflict && (
              <div
                role="alert"
                className="flex flex-col gap-3 rounded-xl border-2 border-coral-200 bg-coral-50 p-4 sm:flex-row sm:items-center"
              >
                <TriangleAlert
                  className="h-5 w-5 shrink-0 text-coral-700"
                  aria-hidden="true"
                />
                <p className="flex-1 text-sm font-semibold text-coral-800">
                  {conflict}
                </p>
                <Button
                  type="button"
                  size="sm"
                  icon={RefreshCw}
                  loading={phase === "analyzing"}
                  disabled={busy}
                  onClick={() => void analyze(analyzedFiles, true)}
                >
                  Relancer l’analyse
                </Button>
              </div>
            )}

            {analysis.statements.map((statement) =>
              statement.ok ? (
                <StatementBlock
                  key={statement.fileSha256}
                  statement={statement}
                  bankAccounts={bankAccounts}
                  accounts={accounts}
                  accountById={accountById}
                  sectionAccounts={sectionAccounts}
                  onSectionAccount={(key, value) =>
                    setSectionAccounts((current) => ({ ...current, [key]: value }))
                  }
                  choices={choices}
                  categories={categories}
                  events={events}
                  cashAccounts={cashAccounts}
                  onLineChange={updateLine}
                  onLineCategory={setLineCategory}
                  onCategoryCreated={onCategoryCreated}
                />
              ) : (
                <div
                  key={statement.fileUrl}
                  className="flex items-start gap-3 rounded-2xl border-2 border-coral-200 bg-coral-50 p-4"
                >
                  <CircleAlert
                    className="mt-0.5 h-5 w-5 shrink-0 text-coral-700"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="break-words font-bold text-coral-900">
                      {statement.fileName}
                    </p>
                    <p className="mt-1 text-sm text-coral-800">
                      {statement.error}
                    </p>
                    <p className="mt-1 text-xs text-coral-700">
                      Ce fichier est laissé de côté ; les autres relevés
                      peuvent être importés.
                    </p>
                  </div>
                </div>
              ),
            )}

            {okStatements.length > 0 ? (
              <ReviewFooter
                summary={summary}
                blocker={blocker}
                status={entryStatus}
                onStatus={setEntryStatus}
                busy={busy}
                committing={phase === "committing"}
                progress={progress}
                onCommit={() => void commit()}
                onShowDoubt={focusFirstDoubt}
                onShowSection={focusFirstMissingSection}
              />
            ) : (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  icon={ArrowLeft}
                  onClick={() => setStep("files")}
                >
                  Choisir d’autres relevés
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "done" && result && (
          <ResultStep
            result={result}
            status={entryStatus}
            onRestart={restart}
            onClose={onClose}
          />
        )}

        {(step === "bank" || step === "files" || step === "done") && (
          <PastImports imports={imports} onUndo={setPendingUndo} />
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingUndo)}
        title="Annuler cet import ?"
        description={
          pendingUndo
            ? `${plural(pendingUndo.importedCount, "brouillon créé", "brouillons créés")} par l’import du relevé ${pendingUndo.statementDate ? `du ${frDay(pendingUndo.statementDate)}` : `du ${frDay(pendingUndo.periodStart)} au ${frDay(pendingUndo.periodEnd)}`} ${pendingUndo.importedCount > 1 ? "seront supprimés" : "sera supprimé"}, et ses opérations pourront être réimportées. Les écritures existantes qui lui avaient été rattachées ne sont pas modifiées.`
            : ""
        }
        confirmLabel="Annuler l’import"
        loading={undoing}
        onCancel={() => setPendingUndo(null)}
        onConfirm={undoImport}
      />
    </Card>
  );
}

/** Problème de rattachement du compte choisi au numéro du relevé. */
function accountProblem(
  section: AnalyzedSection,
  accountId: string,
  accounts: FinancialAccountView[],
): string | null {
  const chosen = accounts.find((account) => account.id === accountId);
  if (!chosen) return null;
  if (
    chosen.bankAccountNumber &&
    chosen.bankAccountNumber !== section.accountNumber
  ) {
    return `Ce compte est rattaché au n° ${chosen.bankAccountNumber}, et ce relevé concerne le n° ${section.accountNumber}.`;
  }
  const owner = accounts.find(
    (account) =>
      account.id !== accountId &&
      account.bankAccountNumber === section.accountNumber,
  );
  if (owner) {
    return `Le n° ${section.accountNumber} est déjà rattaché à « ${owner.name} ».`;
  }
  return null;
}

/* ------------------------------------------------------------------------ */
/* Étapes                                                                    */
/* ------------------------------------------------------------------------ */

const STEPS: { id: Exclude<Step, "done">; label: string }[] = [
  { id: "bank", label: "Banque" },
  { id: "files", label: "Relevés" },
  { id: "review", label: "Vérification" },
];

function Stepper({ step }: { step: Step }) {
  const current = step === "done" ? STEPS.length : STEPS.findIndex((s) => s.id === step);
  return (
    <ol
      aria-label="Étapes de l’import"
      className="grid grid-cols-3 gap-1 border-b-2 border-slate-100 px-3 py-3 sm:px-5"
    >
      {STEPS.map((item, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={item.id}
            aria-current={active ? "step" : undefined}
            className="flex min-w-0 items-center gap-2"
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                done
                  ? "bg-sea-600 text-white"
                  : active
                    ? "bg-brand-700 text-white"
                    : "bg-slate-100 text-slate-500",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                "truncate text-sm",
                active ? "font-bold text-slate-950" : "font-medium text-slate-500",
              )}
            >
              {item.label}
              {done && <span className="sr-only"> (terminée)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function BankStep({
  bank,
  onBank,
  onContinue,
}: {
  bank: SupportedBank | null;
  onBank: (bank: SupportedBank) => void;
  onContinue: () => void;
}) {
  const info = SUPPORTED_BANKS.credit_mutuel;
  return (
    <div className="space-y-5">
      <div>
        <h3
          id={HEADING_ID}
          tabIndex={-1}
          className="text-lg font-bold text-slate-950 focus:outline-none"
        >
          De quelle banque vient le relevé ?
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Chaque relevé est vérifié à la lecture : un PDF d’une autre banque
          est refusé avant tout enregistrement.
        </p>
      </div>
      <fieldset>
        <legend className="sr-only">Banque du relevé</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label
            className={cn(
              "relative flex cursor-pointer flex-col gap-3 rounded-2xl border-2 bg-white p-4 transition-colors focus-within:ring-[3px] focus-within:ring-brand-500/25",
              bank === "credit_mutuel"
                ? "border-brand-700 bg-brand-50/50"
                : "border-slate-200 hover:border-brand-300",
            )}
          >
            <input
              type="radio"
              name="bank"
              value="credit_mutuel"
              checked={bank === "credit_mutuel"}
              onChange={() => onBank("credit_mutuel")}
              className="sr-only"
            />
            <span className="flex h-14 items-center rounded-xl bg-white px-3 ring-1 ring-slate-200">
              <CreditMutuelLogo className="h-7 w-auto max-w-full" />
            </span>
            <span>
              <span className="block font-bold text-slate-950">{info.label}</span>
              <span className="block text-sm text-slate-500">{info.formats}</span>
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full border-2",
                bank === "credit_mutuel"
                  ? "border-brand-700 bg-brand-700 text-white"
                  : "border-slate-300 bg-white",
              )}
            >
              {bank === "credit_mutuel" && <Check className="h-3.5 w-3.5" />}
            </span>
          </label>
          <div className="flex items-center rounded-2xl border-2 border-dashed border-slate-200 p-4 text-sm text-slate-500">
            D’autres banques pourront être ajoutées.
          </div>
        </div>
      </fieldset>
      <div className="flex flex-col-reverse gap-3 border-t-2 border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-400">
          Crédit Mutuel est une marque de la Confédération Nationale du Crédit
          Mutuel. Aucune affiliation.
        </p>
        <Button
          type="button"
          icon={ArrowRight}
          disabled={!bank}
          onClick={onContinue}
          aria-describedby={bank ? undefined : "bank-step-hint"}
          className="w-full sm:w-auto"
        >
          Continuer
        </Button>
      </div>
      {!bank && (
        <p id="bank-step-hint" className="-mt-2 text-right text-xs text-slate-500">
          Choisissez la banque pour continuer.
        </p>
      )}
    </div>
  );
}

function FilesStep({
  files,
  errors,
  busy,
  progress,
  onAdd,
  onRemove,
  onBack,
  onAnalyze,
}: {
  files: SelectedFile[];
  errors: string[];
  busy: boolean;
  progress: string;
  onAdd: (files: FileList | File[]) => void;
  onRemove: (key: string) => void;
  onBack: () => void;
  onAnalyze: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-slate-200">
          <CreditMutuelEmblem className="h-6 w-6" />
        </span>
        <div>
          <h3
            id={HEADING_ID}
            tabIndex={-1}
            className="text-lg font-bold text-slate-950 focus:outline-none"
          >
            Relevés Crédit Mutuel
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Les PDF « Extrait de comptes » téléchargés depuis l’espace en
            ligne de la banque. Plusieurs mois d’un coup : les opérations en
            double d’un relevé à l’autre ne sont comptées qu’une fois.
          </p>
        </div>
      </div>

      <label
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!busy) onAdd(event.dataTransfer.files);
        }}
        className={cn(
          "flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-within:ring-[3px] focus-within:ring-brand-500/25",
          dragging
            ? "border-brand-700 bg-brand-50"
            : "border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/50",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-700 text-white">
          <FileUp className="h-6 w-6" aria-hidden="true" />
        </span>
        <span className="font-bold text-slate-900">
          Déposez vos relevés PDF ici
        </span>
        <span className="text-sm text-slate-600">
          ou <span className="font-semibold text-brand-700 underline">choisissez des fichiers</span>
        </span>
        <span className="text-xs text-slate-500">
          PDF uniquement · jusqu’à {MAX_FILES} relevés · 10 Mo chacun
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,.pdf"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            if (event.currentTarget.files) onAdd(event.currentTarget.files);
            // Permet de rechoisir le même fichier après l'avoir retiré.
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </label>

      {errors.length > 0 && (
        <ul
          role="alert"
          className="space-y-1 rounded-xl border-2 border-coral-200 bg-coral-50 p-3 text-sm text-coral-800"
        >
          {errors.map((error) => (
            <li key={error} className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul aria-label="Relevés choisis" className="space-y-2">
          {files.map((item) => (
            <li
              key={item.key}
              className={cn(
                "flex items-center gap-3 rounded-xl border-2 bg-white px-3 py-2.5",
                item.status === "error" ? "border-coral-200" : "border-slate-200",
              )}
            >
              <FileText
                className="h-5 w-5 shrink-0 text-slate-400"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {item.file.name}
                </p>
                <p
                  className={cn(
                    "text-xs",
                    item.status === "error" ? "text-coral-700" : "text-slate-500",
                  )}
                >
                  {fileSize(item.file.size)} ·{" "}
                  {item.status === "uploading"
                    ? "envoi…"
                    : item.status === "uploaded"
                      ? "envoyé"
                      : item.status === "error"
                        ? item.error
                        : "prêt"}
                </p>
              </div>
              {item.status === "uploading" ? (
                <Loader2
                  className="h-4 w-4 shrink-0 animate-spin text-brand-700"
                  aria-hidden="true"
                />
              ) : item.status === "uploaded" ? (
                <CircleCheck
                  className="h-4 w-4 shrink-0 text-sea-600"
                  aria-hidden="true"
                />
              ) : null}
              <button
                type="button"
                onClick={() => onRemove(item.key)}
                disabled={busy}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-coral-50 hover:text-coral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
                aria-label={`Retirer ${item.file.name}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p
        role="status"
        aria-live="polite"
        className={cn(
          "flex items-center gap-2 text-sm font-semibold text-brand-800",
          !progress && "sr-only",
        )}
      >
        {progress && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {progress}
      </p>

      <div className="flex flex-col-reverse gap-2 border-t-2 border-slate-100 pt-5 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="outline"
          icon={ArrowLeft}
          onClick={onBack}
          disabled={busy}
        >
          Retour
        </Button>
        <Button
          type="button"
          icon={ShieldCheck}
          onClick={onAnalyze}
          loading={busy}
          disabled={files.length === 0}
        >
          {files.length > 1
            ? `Analyser les ${files.length} relevés`
            : "Analyser le relevé"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Vérification                                                              */
/* ------------------------------------------------------------------------ */

function StatementBlock({
  statement,
  bankAccounts,
  accounts,
  accountById,
  sectionAccounts,
  onSectionAccount,
  choices,
  categories,
  events,
  cashAccounts,
  onLineChange,
  onLineCategory,
  onCategoryCreated,
}: {
  statement: OkStatement;
  bankAccounts: FinancialAccountView[];
  accounts: FinancialAccountView[];
  accountById: Map<string, FinancialAccountView>;
  sectionAccounts: Record<string, string>;
  onSectionAccount: (key: string, value: string) => void;
  choices: Record<string, LineChoice>;
  categories: AccountingCategoryView[];
  events: AccountingEventView[];
  cashAccounts: FinancialAccountView[];
  onLineChange: (fingerprint: string, patch: Partial<LineChoice>) => void;
  onLineCategory: (fingerprint: string, categoryId: string) => void;
  onCategoryCreated: (category: AccountingCategoryPayload) => void;
}) {
  const statementDay =
    statement.statementDate ?? statement.sections[0]?.closingDate ?? null;
  return (
    <section
      aria-label={`Relevé ${statementDay ? `du ${frLongDay(statementDay)}` : statement.fileName}`}
      className="overflow-hidden rounded-2xl border-2 border-slate-200"
    >
      <header className="flex flex-col gap-3 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-slate-200">
          <CreditMutuelEmblem className="h-7 w-7" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-slate-950">
            {statementDay
              ? `Relevé du ${frLongDay(statementDay)}`
              : "Relevé Crédit Mutuel"}
            {statement.sections.length === 1 &&
              ` · Compte n° ${statement.sections[0].accountNumber}`}
          </h4>
          <p className="truncate text-xs text-slate-500">
            {statement.fileName}
            {statement.holder ? ` · ${statement.holder}` : ""}
          </p>
        </div>
        <Badge color="green" icon={ShieldCheck} className="self-start sm:self-center">
          Soldes vérifiés
        </Badge>
      </header>
      <div className="divide-y-2 divide-slate-100">
        {statement.sections.map((section) => (
          <SectionBlock
            key={section.key}
            section={section}
            showNumber={statement.sections.length > 1}
            bankAccounts={bankAccounts}
            accounts={accounts}
            accountById={accountById}
            accountChoice={sectionAccounts[section.key] ?? ""}
            onAccount={(value) => onSectionAccount(section.key, value)}
            choices={choices}
            categories={categories}
            events={events}
            cashAccounts={cashAccounts}
            onLineChange={onLineChange}
            onLineCategory={onLineCategory}
            onCategoryCreated={onCategoryCreated}
          />
        ))}
      </div>
    </section>
  );
}

function SectionBlock({
  section,
  showNumber,
  bankAccounts,
  accounts,
  accountById,
  accountChoice,
  onAccount,
  choices,
  categories,
  events,
  cashAccounts,
  onLineChange,
  onLineCategory,
  onCategoryCreated,
}: {
  section: AnalyzedSection;
  showNumber: boolean;
  bankAccounts: FinancialAccountView[];
  accounts: FinancialAccountView[];
  accountById: Map<string, FinancialAccountView>;
  accountChoice: string;
  onAccount: (value: string) => void;
  choices: Record<string, LineChoice>;
  categories: AccountingCategoryView[];
  events: AccountingEventView[];
  cashAccounts: FinancialAccountView[];
  onLineChange: (fingerprint: string, patch: Partial<LineChoice>) => void;
  onLineCategory: (fingerprint: string, categoryId: string) => void;
  onCategoryCreated: (category: AccountingCategoryPayload) => void;
}) {
  const selectId = `section-account-${section.key}`;
  const hintId = `${selectId}-hint`;
  const actionable = section.lines.filter(
    (line) => line.state !== "already_imported",
  ).length;
  const alreadyCount = section.lines.length - actionable;
  const chosen =
    accountChoice && accountChoice !== SKIP_SECTION
      ? accountById.get(accountChoice) ?? null
      : null;
  const problem = chosen ? accountProblem(section, chosen.id, accounts) : null;
  const skipped = accountChoice === SKIP_SECTION;
  // Un compte archivé proposé par l'analyse reste affiché pour qu'on
  // comprenne le choix, même s'il ne peut pas recevoir l'import.
  const options =
    chosen && !bankAccounts.some((a) => a.id === chosen.id)
      ? [...bankAccounts, chosen]
      : bankAccounts;

  return (
    <div className="space-y-4 px-4 py-5 sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-bold text-slate-900">
            {showNumber ? `Compte n° ${section.accountNumber}` : section.accountLabel}
            {showNumber && section.accountLabel && (
              <span className="font-medium text-slate-500"> · {section.accountLabel}</span>
            )}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Solde au {frDay(section.openingDate)} :{" "}
            <span className="font-semibold tabular-nums text-slate-900">
              {formatEuros(section.openingBalanceCents)}
            </span>{" "}
            <ArrowRight className="inline h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span className="sr-only">puis</span>{" "}
            au {frDay(section.closingDate)} :{" "}
            <span className="font-semibold tabular-nums text-slate-900">
              {formatEuros(section.closingBalanceCents)}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {plural(section.lines.length, "opération")}
            {alreadyCount > 0 && ` · ${plural(alreadyCount, "déjà importée", "déjà importées")}`}
            {" · "}débits {formatEurosAbsolute(section.totalDebitCents)} · crédits{" "}
            {formatEurosAbsolute(section.totalCreditCents)}
          </p>
          {section.previousImport && (
            <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-brand-800">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Ce relevé a déjà été importé le{" "}
              {formatShortDate(section.previousImport.importedAt)}
              {section.previousImport.importedBy
                ? ` par ${section.previousImport.importedBy}`
                : ""}{" "}
              : seules les opérations nouvelles seront enregistrées.
            </p>
          )}
        </div>
        {actionable > 0 && (
          <div className="w-full lg:w-80 lg:shrink-0">
            <label
              htmlFor={selectId}
              className="mb-1.5 block text-sm font-semibold text-slate-700"
            >
              Compte de destination
            </label>
            <Select
              id={selectId}
              value={accountChoice}
              aria-describedby={hintId}
              aria-invalid={!accountChoice || problem ? true : undefined}
              onChange={(event) => onAccount(event.currentTarget.value)}
              className={cn(!accountChoice && "border-amber-400")}
            >
              <option value="">Choisir le compte…</option>
              {options.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.bankAccountNumber ? ` · n° ${account.bankAccountNumber}` : ""}
                  {!account.isActive ? " · archivé" : ""}
                </option>
              ))}
              <option value={SKIP_SECTION}>Ne pas importer ce compte</option>
            </Select>
            <div id={hintId} className="mt-1.5 text-xs">
              {problem ? (
                <p className="flex items-start gap-1.5 font-semibold text-coral-700">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {problem}
                </p>
              ) : chosen && !chosen.isActive ? (
                <p className="font-semibold text-coral-700">
                  Ce compte est archivé : choisissez un compte actif.
                </p>
              ) : chosen && !chosen.bankAccountNumber ? (
                <p className="flex items-start gap-1.5 text-brand-800">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Le compte sera associé au n° {section.accountNumber}.
                </p>
              ) : chosen ? (
                <p className="flex items-start gap-1.5 text-sea-700">
                  <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Compte reconnu par son numéro.
                </p>
              ) : skipped ? (
                <p className="text-slate-500">
                  Les opérations de ce compte ne seront pas enregistrées.
                </p>
              ) : bankAccounts.length === 0 ? (
                <p className="font-semibold text-coral-700">
                  Aucun compte bancaire actif : créez-le dans l’onglet
                  « Comptes ».
                </p>
              ) : (
                <p className="font-semibold text-amber-700">
                  Choisissez le compte sur lequel passer ces opérations.
                </p>
              )}
              {chosen && !problem && section.accountMatch === "single" && accountChoice === section.suggestedAccountId && (
                <p className="mt-1 text-slate-500">
                  Proposé car c’est le seul compte bancaire sans numéro :
                  vérifiez que c’est bien lui.
                </p>
              )}
              {chosen && !problem && section.accountMatch === "name" && accountChoice === section.suggestedAccountId && (
                <p className="mt-1 text-slate-500">
                  Proposé car son nom ou sa description contient le numéro.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {skipped ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
          {plural(actionable, "opération laissée", "opérations laissées")} de
          côté.
        </p>
      ) : (
        <ul className="space-y-2" aria-label={`Opérations du compte n° ${section.accountNumber}`}>
          {section.lines.map((line, index) =>
            line.state === "already_imported" ? (
              <AlreadyImportedRow key={`${line.fingerprint}:${index}`} line={line} />
            ) : (
              <LineRow
                key={line.fingerprint}
                line={line}
                choice={choices[line.fingerprint]}
                categories={categories}
                events={events}
                cashAccounts={cashAccounts}
                onChange={onLineChange}
                onCategory={onLineCategory}
                onCategoryCreated={onCategoryCreated}
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function LineMeta({ line }: { line: AnalyzedLine }) {
  const parts = [
    frDay(line.operationDate),
    line.paymentMethod ? PAYMENT_LABELS[line.paymentMethod] : null,
    line.nature,
  ].filter(Boolean);
  return <p className="text-xs font-semibold text-slate-500">{parts.join(" · ")}</p>;
}

function Amount({ line, muted }: { line: AnalyzedLine; muted?: boolean }) {
  return (
    <p
      className={cn(
        "shrink-0 whitespace-nowrap font-extrabold tabular-nums",
        muted
          ? "text-slate-400"
          : line.direction === "credit"
            ? "text-sea-700"
            : "text-coral-700",
      )}
    >
      <span className="sr-only">
        {line.direction === "credit" ? "Crédit de " : "Débit de "}
      </span>
      <span aria-hidden="true">{signedAmount(line)}</span>
      <span className="sr-only">{formatEurosAbsolute(line.amountCents)}</span>
    </p>
  );
}

function Details({ line }: { line: AnalyzedLine }) {
  if (line.details.length === 0) return null;
  return (
    <p className="mt-0.5 break-words text-xs text-slate-500">
      {line.details.join(" · ")}
    </p>
  );
}

function AlreadyImportedRow({ line }: { line: AnalyzedLine }) {
  const info = line.alreadyImported;
  const text =
    info?.source === "batch"
      ? "Présente dans un autre relevé de cet envoi"
      : info?.decision === "skipped"
        ? `Écartée lors d’un import précédent${info.importedAt ? ` (le ${formatShortDate(info.importedAt)})` : ""}`
        : `Déjà importée${info?.importedAt ? ` le ${formatShortDate(info.importedAt)}` : ""}${info?.entryLabel ? ` · « ${info.entryLabel} »` : ""}`;
  return (
    <li className="flex items-start gap-3 rounded-xl border-2 border-slate-100 bg-slate-50 px-3 py-2.5 text-slate-500 sm:px-4">
      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">{frDay(line.operationDate)}</p>
        <p className="break-words text-sm font-medium text-slate-600">{line.label}</p>
        <p className="text-xs">{text}</p>
      </div>
      <Amount line={line} muted />
    </li>
  );
}

const LineRow = memo(function LineRow({
  line,
  choice,
  categories,
  events,
  cashAccounts,
  onChange,
  onCategory,
  onCategoryCreated,
}: {
  line: AnalyzedLine;
  choice: LineChoice | undefined;
  categories: AccountingCategoryView[];
  events: AccountingEventView[];
  cashAccounts: FinancialAccountView[];
  onChange: (fingerprint: string, patch: Partial<LineChoice>) => void;
  onCategory: (fingerprint: string, categoryId: string) => void;
  onCategoryCreated: (category: AccountingCategoryPayload) => void;
}) {
  if (!choice) return null;
  const fp = line.fingerprint;
  const idBase = `line-${fp}`;
  const isDoubt = line.state === "doubt";
  const importing = isDoubt ? choice.doubt === "import" : choice.include;
  const unresolved = isDoubt && !choice.doubt;

  return (
    <li
      className={cn(
        "rounded-xl border-2 px-3 py-3 sm:px-4",
        isDoubt
          ? unresolved
            ? "border-amber-300 bg-amber-50"
            : "border-amber-200 bg-amber-50/50"
          : importing
            ? "border-slate-200 bg-white"
            : "border-slate-100 bg-slate-50",
      )}
    >
      <div className="flex items-start gap-3">
        {!isDoubt && (
          <div className="pt-0.5">
            <input
              id={`${idBase}-include`}
              type="checkbox"
              checked={choice.include}
              onChange={(event) =>
                onChange(fp, { include: event.currentTarget.checked })
              }
              className="h-5 w-5 rounded border-2 border-slate-300 accent-brand-700"
            />
            <label htmlFor={`${idBase}-include`} className="sr-only">
              Importer « {line.label} » du {frDay(line.operationDate)}
            </label>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <LineMeta line={line} />
                {isDoubt && (
                  <Badge color="amber" icon={TriangleAlert}>
                    Doublon possible
                  </Badge>
                )}
              </div>
              {!importing && (
                <p
                  className={cn(
                    "mt-0.5 break-words text-sm font-semibold",
                    isDoubt ? "text-slate-900" : "text-slate-500",
                  )}
                >
                  {line.label}
                </p>
              )}
            </div>
            <Amount line={line} muted={!importing && !isDoubt} />
          </div>

          {importing ? (
            <div className="mt-2">
              <label htmlFor={`${idBase}-label`} className="sr-only">
                Libellé de l’écriture
              </label>
              <Input
                id={`${idBase}-label`}
                value={choice.label}
                maxLength={300}
                onChange={(event) =>
                  onChange(fp, { label: event.currentTarget.value })
                }
                className="font-semibold"
              />
              <Details line={line} />
            </div>
          ) : (
            <Details line={line} />
          )}

          {isDoubt && (
            <DoubtChoice line={line} choice={choice} onChange={onChange} />
          )}

          {importing && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <label
                  htmlFor={`${idBase}-category`}
                  className="mb-1 block text-xs font-semibold text-slate-600"
                >
                  Catégorie
                </label>
                <CategorySelect
                  id={`${idBase}-category`}
                  type={line.type}
                  value={choice.categoryId}
                  categories={categories}
                  onChange={(value) => onCategory(fp, value)}
                  onCreated={onCategoryCreated}
                />
              </div>
              <div>
                <label
                  htmlFor={`${idBase}-event`}
                  className="mb-1 block text-xs font-semibold text-slate-600"
                >
                  Événement (facultatif)
                </label>
                <Select
                  id={`${idBase}-event`}
                  value={choice.eventId}
                  onChange={(event) =>
                    onChange(fp, { eventId: event.currentTarget.value })
                  }
                >
                  <option value="">Hors événement</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title} · {formatShortDate(event.startAt)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}

          {importing && line.cashMovement && (
            <CashMovement
              line={line}
              choice={choice}
              cashAccounts={cashAccounts}
              idBase={idBase}
              onChange={onChange}
            />
          )}

          {!isDoubt && !importing && (
            <p className="mt-1 text-xs font-medium text-slate-500">
              Ne sera pas importée.
            </p>
          )}
        </div>
      </div>
    </li>
  );
});

function candidateSummary(candidate: AnalyzedLine["candidates"][number]) {
  return [
    formatEuros(candidate.amountCents),
    formatShortDate(candidate.occurredAt),
    candidate.status === "posted" ? "validée" : "brouillon",
    candidate.accountName ?? "sans compte",
  ].join(" · ");
}

function DoubtChoice({
  line,
  choice,
  onChange,
}: {
  line: AnalyzedLine;
  choice: LineChoice;
  onChange: (fingerprint: string, patch: Partial<LineChoice>) => void;
}) {
  const fp = line.fingerprint;
  const name = `doubt-choice-${fp}`;
  const deleted = line.doubtReason === "deleted_entry";
  const options: { value: LineChoice["doubt"]; label: React.ReactNode }[] = [
    ...(deleted
      ? []
      : line.candidates.map((candidate) => ({
          value: `link:${candidate.entryId}` as const,
          label: (
            <>
              C’est la même opération
              {line.candidates.length > 1 && (
                <> que « {candidate.label} »</>
              )}
              <span className="block text-xs font-normal text-slate-500">
                Rattacher le relevé à l’écriture existante, sans en créer
                une nouvelle.
              </span>
            </>
          ),
        }))),
    {
      value: "import",
      label: deleted ? "Réimporter" : "Importer quand même",
    },
    { value: "skip", label: "Ne pas importer" },
  ];

  return (
    <fieldset
      id={`doubt-${fp}`}
      className="mt-3 rounded-lg border-2 border-amber-200 bg-white p-3"
    >
      <legend className="px-1 text-xs font-bold text-amber-900">
        {deleted ? "Opération déjà importée autrefois" : "Une écriture ressemblante existe déjà"}
        {!choice.doubt && " — choix obligatoire"}
      </legend>
      {deleted ? (
        <p className="text-sm text-slate-700">
          Cette opération avait été importée, mais l’écriture a été supprimée
          depuis.
        </p>
      ) : (
        <ul className="space-y-1 text-sm text-slate-700">
          {line.candidates.map((candidate) => (
            <li key={candidate.entryId}>
              « <span className="font-semibold">{candidate.label}</span> » ·{" "}
              {candidateSummary(candidate)}
              {candidate.categoryName ? ` · ${candidate.categoryName}` : ""}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 space-y-1">
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          return (
            <div key={option.value} className="flex items-start gap-2">
              <input
                id={id}
                type="radio"
                name={name}
                value={option.value}
                checked={choice.doubt === option.value}
                onChange={() => onChange(fp, { doubt: option.value })}
                className="mt-0.5 h-5 w-5 shrink-0 border-2 border-slate-300 accent-brand-700"
              />
              <label htmlFor={id} className="min-h-6 text-sm font-semibold text-slate-800">
                {option.label}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

function CashMovement({
  line,
  choice,
  cashAccounts,
  idBase,
  onChange,
}: {
  line: AnalyzedLine;
  choice: LineChoice;
  cashAccounts: FinancialAccountView[];
  idBase: string;
  onChange: (fingerprint: string, patch: Partial<LineChoice>) => void;
}) {
  const withdrawal = line.direction === "debit";
  const checked = Boolean(choice.cashAccountId);
  const selected =
    cashAccounts.find((account) => account.id === choice.cashAccountId) ??
    cashAccounts[0];
  return (
    <div className="mt-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
      <p className="flex items-start gap-2 font-semibold">
        <Banknote className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {withdrawal
          ? "Retrait d’espèces : l’argent passe dans la caisse."
          : "Versement d’espèces : l’argent vient de la caisse."}
      </p>
      {selected ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-start gap-2">
            <input
              id={`${idBase}-cash`}
              type="checkbox"
              checked={checked}
              onChange={(event) =>
                onChange(line.fingerprint, {
                  cashAccountId: event.currentTarget.checked ? selected.id : "",
                })
              }
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-2 border-slate-300 accent-brand-700"
            />
            <label htmlFor={`${idBase}-cash`}>
              {withdrawal
                ? "Passer aussi l’entrée en caisse"
                : "Passer aussi la sortie de caisse"}
              {cashAccounts.length === 1 ? ` (${selected.name})` : ""}
            </label>
          </div>
          {checked && cashAccounts.length > 1 && (
            <>
              <label htmlFor={`${idBase}-cash-account`} className="sr-only">
                Caisse
              </label>
              <Select
                id={`${idBase}-cash-account`}
                value={choice.cashAccountId}
                onChange={(event) =>
                  onChange(line.fingerprint, {
                    cashAccountId: event.currentTarget.value,
                  })
                }
                className="sm:w-56"
              >
                {cashAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </>
          )}
        </div>
      ) : (
        <p className="mt-1 text-xs text-brand-800">
          Aucune caisse active : créez-en une dans « Comptes » pour y passer
          aussi le mouvement.
        </p>
      )}
    </div>
  );
}

function ReviewFooter({
  summary,
  blocker,
  status,
  onStatus,
  busy,
  committing,
  progress,
  onCommit,
  onShowDoubt,
  onShowSection,
}: {
  summary: {
    toImport: number;
    toLink: number;
    toSkip: number;
    already: number;
    unresolved: number;
    missingAccount: number;
  };
  blocker: string | null;
  status: "draft" | "posted";
  onStatus: (status: "draft" | "posted") => void;
  busy: boolean;
  committing: boolean;
  progress: string;
  onCommit: () => void;
  onShowDoubt: () => void;
  onShowSection: () => void;
}) {
  const counters = [
    `${summary.toImport} à importer`,
    ...(summary.toLink ? [`${summary.toLink} à rattacher`] : []),
    ...(summary.toSkip ? [`${summary.toSkip} écartée${summary.toSkip > 1 ? "s" : ""}`] : []),
    ...(summary.already
      ? [plural(summary.already, "déjà importée", "déjà importées")]
      : []),
    ...(summary.unresolved
      ? [plural(summary.unresolved, "doute à trancher", "doutes à trancher")]
      : []),
  ];
  return (
    <div className="sticky bottom-0 z-10 -mx-5 -mb-5 rounded-b-[14px] border-t-2 border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <p
            aria-live="polite"
            className="text-sm font-bold text-slate-900"
          >
            {counters.join(" · ")}
          </p>
          <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <legend className="sr-only">Statut des écritures créées</legend>
            <span aria-hidden="true" className="text-xs font-semibold text-slate-500">
              Écritures créées :
            </span>
            {(
              [
                ["draft", "Brouillons (à vérifier)"],
                ["posted", "Validées"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex min-h-8 items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="bank-import-status"
                  value={value}
                  checked={status === value}
                  onChange={() => onStatus(value)}
                  className="h-4 w-4 border-2 border-slate-300 accent-brand-700"
                />
                {label}
              </label>
            ))}
          </fieldset>
          {status === "posted" && (
            <p className="text-xs font-medium text-amber-700">
              Les écritures validées sont verrouillées : l’import ne pourra
              plus être annulé.
            </p>
          )}
        </div>
        <div className="flex flex-col items-stretch gap-1.5 lg:items-end">
          <Button
            type="button"
            icon={Check}
            loading={committing}
            disabled={busy || Boolean(blocker)}
            aria-describedby="bank-import-commit-help"
            onClick={onCommit}
          >
            {summary.toImport > 0
              ? `Importer ${plural(summary.toImport, "écriture")}`
              : "Enregistrer les décisions"}
          </Button>
          <p
            id="bank-import-commit-help"
            role="status"
            className={cn(
              "text-xs lg:text-right",
              blocker ? "font-semibold text-amber-700" : "text-slate-500",
            )}
          >
            {committing
              ? progress
              : blocker ??
                (status === "draft"
                  ? "Les brouillons restent modifiables et l’import annulable."
                  : "Les écritures seront enregistrées comme validées.")}
            {!committing && summary.missingAccount > 0 && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={onShowSection}
                  className="font-bold text-brand-700 underline"
                >
                  Voir le relevé
                </button>
              </>
            )}
            {!committing && summary.missingAccount === 0 && summary.unresolved > 0 && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={onShowDoubt}
                  className="font-bold text-brand-700 underline"
                >
                  Voir le premier doute
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Résultat et historique                                                    */
/* ------------------------------------------------------------------------ */

function ResultStep({
  result,
  status,
  onRestart,
  onClose,
}: {
  result: BankImportCommitResult;
  status: "draft" | "posted";
  onRestart: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border-2 border-sea-200 bg-sea-50 p-4 sm:p-5">
        <CircleCheck className="mt-0.5 h-6 w-6 shrink-0 text-sea-700" aria-hidden="true" />
        <div>
          <h3
            id={HEADING_ID}
            tabIndex={-1}
            className="text-lg font-bold text-sea-900 focus:outline-none"
          >
            Import terminé
          </h3>
          <p className="mt-1 text-sm text-sea-900">
            {plural(result.imported, "écriture créée", "écritures créées")}
            {result.imported > 0 &&
              (status === "draft" ? " en brouillon" : " et validées")}
            {result.linked > 0 &&
              `, ${plural(result.linked, "opération rattachée", "opérations rattachées")} à des écritures existantes`}
            {result.skipped > 0 &&
              `, ${plural(result.skipped, "opération écartée", "opérations écartées")}`}
            .
          </p>
          {status === "draft" && result.imported > 0 && (
            <p className="mt-1 text-sm text-sea-800">
              Vérifiez puis validez les brouillons dans la liste des écritures.
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" icon={FileUp} onClick={onRestart}>
          Importer d’autres relevés
        </Button>
        <Button type="button" onClick={onClose}>
          Voir les écritures
        </Button>
      </div>
    </div>
  );
}

function PastImports({
  imports,
  onUndo,
}: {
  imports: BankImportSummary[];
  onUndo: (summary: BankImportSummary) => void;
}) {
  if (imports.length === 0) return null;
  return (
    <section aria-labelledby="past-imports-title" className="mt-8 border-t-2 border-slate-100 pt-6">
      <h3 id="past-imports-title" className="font-bold text-slate-950">
        Relevés déjà importés
      </h3>
      <ul className="mt-3 space-y-2">
        {imports.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-3 rounded-xl border-2 border-slate-200 bg-white p-3 md:flex-row md:items-center"
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white ring-1 ring-slate-200">
                <CreditMutuelEmblem className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">
                  {item.statementDate
                    ? `Relevé du ${frDay(item.statementDate)}`
                    : `Du ${frDay(item.periodStart)} au ${frDay(item.periodEnd)}`}
                  <span className="font-medium text-slate-500">
                    {" · "}
                    {item.accountName ?? "Compte supprimé"} · n° {item.accountNumber}
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  Période du {frDay(item.periodStart)} au {frDay(item.periodEnd)}
                  {" · "}
                  {plural(item.importedCount, "écriture")}
                  {item.linkedCount > 0 && ` · ${plural(item.linkedCount, "rattachée", "rattachées")}`}
                  {item.skippedCount > 0 && ` · ${plural(item.skippedCount, "écartée", "écartées")}`}
                </p>
                <p className="text-xs text-slate-400">
                  Importé le {formatShortDate(item.createdAt)}
                  {item.createdByName ? ` par ${item.createdByName}` : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:shrink-0">
              <a
                href={item.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Voir le PDF
                <span className="sr-only"> (nouvel onglet)</span>
              </a>
              {item.canUndo ? (
                <Button
                  type="button"
                  size="sm"
                  variant="dangerOutline"
                  icon={Undo2}
                  onClick={() => onUndo(item)}
                >
                  Annuler l’import
                </Button>
              ) : item.importedCount > 0 ? (
                <span className="text-xs text-slate-400">
                  Écritures validées : non annulable
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
