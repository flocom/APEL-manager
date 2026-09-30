"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpenText,
  CircleDollarSign,
  Download,
  FileUp,
  FileWarning,
  Landmark,
  Link2,
  LockKeyhole,
  Paperclip,
  PartyPopper,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
  type LucideIcon,
  WalletCards,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { BankLinkDialog } from "@/components/accounting/bank-link-dialog";
import { CategorySelect } from "@/components/accounting/category-picker";
import { AccountingExportDialog } from "@/components/accounting/export-dialog";
import { AccountingModal } from "@/components/accounting/modal";
import {
  type AccountingCategoryPayload,
  type AccountingCategoryView,
  type AccountingEventView,
  upsertCategory,
} from "@/components/accounting/types";
import { AccountingCategoriesManager } from "@/components/accounting-categories-manager";
import { BankStatementImport } from "@/components/bank-statement-import";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FileUploadField } from "@/components/file-upload-field";
import {
  FinancialAccountsManager,
  type FinancialAccountView,
} from "@/components/financial-accounts-manager";
import { ModuleStat } from "@/components/module-stat";
import { useToast } from "@/components/toast";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import type { BankImportSummary } from "@/lib/banking/import-types";
import { treasuryBalance } from "@/lib/accounting/balances";
import { api } from "@/lib/client";
import { formatShortDate, toDateInput } from "@/lib/dates";
import { formatEuros } from "@/lib/money";
import { cn } from "@/lib/utils";

export type AccountingAccountView = FinancialAccountView;
export type { AccountingCategoryView, AccountingEventView };

export interface AccountingEntryView {
  id: string;
  type: "income" | "expense";
  status: "draft" | "posted";
  accountId: string | null;
  categoryId: string | null;
  eventId: string | null;
  eventTitle: string | null;
  label: string;
  amountCents: number;
  occurredAt: string;
  counterparty: string | null;
  paymentMethod: string | null;
  reference: string | null;
  notes: string | null;
  attachmentUrl: string | null;
  version: number;
  /** Créée par un import de relevé : peut encore être rattachée à une écriture déjà saisie. */
  fromBankImport: boolean;
}

function dateInput(value: string | null) {
  return value ? toDateInput(value) : "";
}

export function AccountingManager({
  entries,
  accounts,
  categories,
  events,
  imports,
}: {
  entries: AccountingEntryView[];
  accounts: AccountingAccountView[];
  categories: AccountingCategoryView[];
  events: AccountingEventView[];
  imports: BankImportSummary[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | AccountingEntryView["type"]>("all");
  const [status, setStatus] = useState<
    "all" | AccountingEntryView["status"]
  >("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [workspace, setWorkspace] = useState<
    "entries" | "accounts" | "categories"
  >("entries");
  const [editor, setEditor] = useState<
    "new" | AccountingEntryView | null
  >(null);
  const [importing, setImportingState] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] =
    useState<AccountingEntryView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [linking, setLinking] = useState<AccountingEntryView | null>(null);
  const [exporting, setExporting] = useState(false);

  // Copie locale des catégories : une catégorie créée depuis le formulaire,
  // l'import ou l'onglet Catégories apparaît aussitôt partout, sans attendre
  // le rechargement de la page. Chaque nouvelle liste venue du serveur
  // remplace la copie (c'est la référence).
  const [localCategories, setLocalCategories] = useState(categories);
  const [serverCategories, setServerCategories] = useState(categories);
  if (categories !== serverCategories) {
    setServerCategories(categories);
    setLocalCategories(categories);
  }
  const saveCategory = useCallback(
    (category: AccountingCategoryPayload) =>
      setLocalCategories((current) => upsertCategory(current, category)),
    [],
  );
  const createdCategory = useCallback(
    (category: AccountingCategoryPayload) => {
      saveCategory(category);
      toast(`Catégorie « ${category.name} » créée.`);
      router.refresh();
    },
    [router, saveCategory, toast],
  );

  // Formulaire d'écriture et import partagent la même place au-dessus de la
  // liste. Ouvrir l'import referme le formulaire ; ouvrir le formulaire ne
  // fait que masquer l'import, qui reste monté (voir plus bas) et réapparaît
  // à la fermeture du formulaire.
  function setImporting(next: boolean) {
    setImportingState(next);
    if (next) setEditor(null);
  }

  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );
  const categoryNames = useMemo(
    () =>
      new Map(localCategories.map((category) => [category.id, category.name])),
    [localCategories],
  );
  // Une catégorie supprimée (onglet Catégories) disparaît de la liste : le
  // filtre qui la visait retombe sur « Toutes », sinon le sélecteur afficherait
  // « Toutes les catégories » tout en filtrant encore sur elle.
  const effectiveCategoryFilter =
    categoryFilter === "all" ||
    categoryFilter === "none" ||
    localCategories.some((category) => category.id === categoryFilter)
      ? categoryFilter
      : "all";
  const activeCategoryCount = localCategories.filter(
    (category) => category.isActive,
  ).length;

  const posted = entries.filter((entry) => entry.status === "posted");
  const incomeCents = posted
    .filter((entry) => entry.type === "income")
    .reduce((sum, entry) => sum + entry.amountCents, 0);
  const expenseCents = posted
    .filter((entry) => entry.type === "expense")
    .reduce((sum, entry) => sum + entry.amountCents, 0);
  const draftCount = entries.filter((entry) => entry.status === "draft").length;
  const activeAccountCount = accounts.filter(
    (account) => account.isActive,
  ).length;

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    return entries.filter((entry) => {
      const searchContent = [
        entry.label,
        entry.counterparty,
        entry.reference,
        entry.accountId ? accountNames.get(entry.accountId) : null,
        entry.categoryId ? categoryNames.get(entry.categoryId) : null,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("fr");
      return (
        (!normalizedQuery || searchContent.includes(normalizedQuery)) &&
        (type === "all" || entry.type === type) &&
        (status === "all" || entry.status === status) &&
        (effectiveCategoryFilter === "all" ||
          (effectiveCategoryFilter === "none"
            ? !entry.categoryId
            : entry.categoryId === effectiveCategoryFilter))
      );
    });
  }, [
    accountNames,
    effectiveCategoryFilter,
    categoryNames,
    entries,
    query,
    status,
    type,
  ]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const amountInEuros = Number(String(form.get("amount") ?? "0"));
    const body = {
      type: form.get("type"),
      status: form.get("status"),
      accountId: form.get("accountId") || null,
      categoryId: form.get("categoryId") || null,
      eventId: form.get("eventId") || null,
      label: form.get("label"),
      amountCents: Math.round(amountInEuros * 100),
      occurredAt: form.get("occurredAt"),
      counterparty: form.get("counterparty") || null,
      paymentMethod: form.get("paymentMethod") || null,
      reference: form.get("reference") || null,
      notes: form.get("notes") || null,
      attachmentUrl: form.get("attachmentUrl") || null,
      ...(editor !== "new" && editor ? { version: editor.version } : {}),
    };

    try {
      if (editor === "new") {
        await api("/api/accounting/entries", { body });
        toast("Écriture comptable ajoutée.");
      } else if (editor) {
        await api(`/api/accounting/entries/${editor.id}`, {
          method: "PATCH",
          body,
        });
        toast("Écriture comptable mise à jour.");
      }
      setEditor(null);
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api(`/api/accounting/entries/${pendingDelete.id}`, {
        method: "DELETE",
      });
      toast("Écriture supprimée.");
      setPendingDelete(null);
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-1.5">
        <div
          role="tablist"
          aria-label="Navigation de la comptabilité"
          className="grid grid-cols-3 gap-1.5"
        >
          <AccountingWorkspaceTab
            active={workspace === "entries"}
            icon={BookOpenText}
            label="Écritures"
            helper={`${entries.length} mouvement${entries.length > 1 ? "s" : ""}`}
            onClick={() => setWorkspace("entries")}
          />
          <AccountingWorkspaceTab
            active={workspace === "accounts"}
            icon={WalletCards}
            label="Comptes"
            helper={`${activeAccountCount} actif${activeAccountCount > 1 ? "s" : ""}`}
            onClick={() => setWorkspace("accounts")}
          />
          <AccountingWorkspaceTab
            active={workspace === "categories"}
            icon={Tags}
            label="Catégories"
            helper={`${activeCategoryCount} active${activeCategoryCount > 1 ? "s" : ""}`}
            onClick={() => setWorkspace("categories")}
          />
        </div>
      </Card>

      {workspace === "accounts" ? (
        <FinancialAccountsManager
          accounts={accounts}
          entries={entries}
          statements={imports}
        />
      ) : workspace === "categories" ? (
        <AccountingCategoriesManager
          categories={localCategories}
          onCategorySaved={saveCategory}
          onCategoryRemoved={(id) =>
            setLocalCategories((current) =>
              current.filter((category) => category.id !== id),
            )
          }
        />
      ) : (
        <>
          <section
            aria-label="Synthèse comptable"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
        <ModuleStat
          label="Trésorerie"
          value={formatEuros(treasuryBalance(accounts, entries))}
          helper="Soldes de départ et écritures validées"
          icon={WalletCards}
          tone="brand"
        />
        <ModuleStat
          label="Recettes"
          value={formatEuros(incomeCents)}
          helper={`${posted.filter((entry) => entry.type === "income").length} mouvements`}
          icon={ArrowDownLeft}
          tone="sea"
        />
        <ModuleStat
          label="Dépenses"
          value={formatEuros(expenseCents)}
          helper={`${posted.filter((entry) => entry.type === "expense").length} mouvements`}
          icon={ArrowUpRight}
          tone="coral"
        />
        <ModuleStat
          label="Brouillons"
          value={draftCount}
          helper="À vérifier et valider"
          icon={FileWarning}
          tone="slate"
        />
          </section>

      {editor && (
        <AccountingModal
          title={editor === "new" ? "Ajouter une écriture" : "Modifier l’écriture"}
          busy={submitting}
          onClose={() => setEditor(null)}
        >
          <AccountingEntryForm
            key={editor === "new" ? "new" : editor.id}
            entry={editor === "new" ? null : editor}
            accounts={accounts}
            categories={localCategories}
            onCategoryCreated={createdCategory}
            events={events}
            loading={submitting}
            onSubmit={save}
            onCancel={() => setEditor(null)}
          />
        </AccountingModal>
      )}
        </>
      )}

      {/*
        L'import reste monté quand on passe aux onglets Comptes ou Catégories
        (où la vérification invite à créer un compte ou une catégorie) ou
        qu'on ouvre le formulaire d'écriture : il est seulement masqué. Le
        démonter perdrait relevés, analyse et décisions, et même le résultat
        d'un enregistrement en cours.
      */}
      {importing && (
        <div hidden={workspace !== "entries"}>
          <BankStatementImport
            accounts={accounts}
            categories={localCategories}
            events={events}
            imports={imports}
            onCategoryCreated={createdCategory}
            onClose={() => setImporting(false)}
          />
        </div>
      )}

      {workspace === "entries" && (
        <>
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <label htmlFor="accounting-search" className="sr-only">
              Rechercher une écriture
            </label>
            <Input
              id="accounting-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Libellé, tiers, référence…"
              className="pl-10"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:flex">
            <label className="sr-only" htmlFor="accounting-type">
              Filtrer par type
            </label>
            <Select
              id="accounting-type"
              value={type}
              onChange={(event) =>
                setType(
                  event.target.value as
                    | "all"
                    | AccountingEntryView["type"],
                )
              }
              className="lg:w-40"
            >
              <option value="all">Tous les types</option>
              <option value="income">Recettes</option>
              <option value="expense">Dépenses</option>
            </Select>
            <label className="sr-only" htmlFor="accounting-status">
              Filtrer par statut
            </label>
            <Select
              id="accounting-status"
              value={status}
              onChange={(event) =>
                setStatus(
                  event.target.value as
                    | "all"
                    | AccountingEntryView["status"],
                )
              }
              className="lg:w-40"
            >
              <option value="all">Tous les statuts</option>
              <option value="posted">Validées</option>
              <option value="draft">Brouillons</option>
            </Select>
            <label className="sr-only" htmlFor="accounting-category">
              Filtrer par catégorie
            </label>
            <Select
              id="accounting-category"
              value={effectiveCategoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="lg:w-48"
            >
              <option value="all">Toutes les catégories</option>
              <option value="none">Sans catégorie</option>
              {(["income", "expense"] as const).map((group) => {
                const groupCategories = localCategories.filter(
                  (category) => category.type === group,
                );
                if (groupCategories.length === 0) return null;
                return (
                  <optgroup
                    key={group}
                    label={group === "income" ? "Recettes" : "Dépenses"}
                  >
                    {groupCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                        {!category.isActive ? " · désactivée" : ""}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:flex lg:shrink-0">
            <Button
              type="button"
              variant="outline"
              icon={Download}
              onClick={() => setExporting(true)}
              className="w-full lg:w-auto"
            >
              Export comptable
            </Button>
            <Button
              type="button"
              variant="outline"
              icon={FileUp}
              onClick={() => setImporting(true)}
              aria-expanded={importing && !editor}
              className="w-full lg:w-auto"
            >
              Importer un relevé
            </Button>
            <Button
              type="button"
              icon={Plus}
              onClick={() => setEditor("new")}
              className="w-full lg:w-auto"
            >
              Nouvelle écriture
            </Button>
          </div>
        </div>
      </Card>

      {entries.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Aucune écriture comptable"
          description="Ajoutez votre première recette ou dépense, ou importez un relevé bancaire pour démarrer le suivi financier."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                size="sm"
                icon={Plus}
                onClick={() => setEditor("new")}
              >
                Ajouter la première écriture
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={FileUp}
                onClick={() => setImporting(true)}
              >
                Importer un relevé
              </Button>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Aucun mouvement trouvé"
          description="Modifiez la recherche ou les filtres pour afficher d'autres écritures."
        />
      ) : (
        <>
          <p className="text-sm font-medium text-slate-500">
            {filtered.length} écriture{filtered.length > 1 ? "s" : ""}
          </p>
          <div className="space-y-3 md:hidden">
            {filtered.map((entry) => (
              <AccountingMobileCard
                key={entry.id}
                entry={entry}
                accountName={
                  entry.accountId
                    ? accountNames.get(entry.accountId) ?? null
                    : null
                }
                categoryName={
                  entry.categoryId
                    ? categoryNames.get(entry.categoryId) ?? null
                    : null
                }
                onEdit={() => setEditor(entry)}
                onLink={() => setLinking(entry)}
                onDelete={() => setPendingDelete(entry)}
              />
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-2xl border-2 border-slate-200 bg-white md:block">
            <table className="w-full min-w-[920px] text-sm">
              <caption className="sr-only">Écritures comptables</caption>
              <thead className="border-b-2 border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-bold">
                    Date
                  </th>
                  <th scope="col" className="px-5 py-3 font-bold">
                    Écriture
                  </th>
                  <th scope="col" className="px-5 py-3 font-bold">
                    Affectation
                  </th>
                  <th scope="col" className="px-5 py-3 font-bold">
                    Statut
                  </th>
                  <th scope="col" className="px-5 py-3 text-right font-bold">
                    Montant
                  </th>
                  <th scope="col" className="px-5 py-3 text-right font-bold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((entry) => (
                  <tr key={entry.id} className="hover:bg-brand-50/40">
                    <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-600">
                      {formatShortDate(entry.occurredAt)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white",
                            entry.type === "income"
                              ? "bg-sea-600"
                              : "bg-coral-700",
                          )}
                        >
                          {entry.type === "income" ? (
                            <ArrowDownLeft className="h-4 w-4" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4" />
                          )}
                        </span>
                        <div>
                          <p className="font-bold text-slate-950">
                            {entry.label}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {entry.counterparty || entry.reference || "Sans tiers"}
                          </p>
                          {entry.eventTitle && (
                            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                              <PartyPopper
                                className="h-3 w-3"
                                aria-hidden="true"
                              />
                              {entry.eventTitle}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <p>
                        {entry.categoryId
                          ? categoryNames.get(entry.categoryId) ?? "Catégorie supprimée"
                          : "Sans catégorie"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {entry.accountId
                          ? accountNames.get(entry.accountId) ?? "Compte supprimé"
                          : "Sans compte"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge
                        color={entry.status === "posted" ? "sea" : "amber"}
                      >
                        {entry.status === "posted" ? "Validée" : "Brouillon"}
                      </Badge>
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-5 py-4 text-right font-extrabold tabular-nums",
                        entry.type === "income"
                          ? "text-sea-700"
                          : "text-coral-700",
                      )}
                    >
                      {entry.type === "income" ? "+" : "−"}{" "}
                      {formatEuros(entry.amountCents)}
                    </td>
                    <td className="px-5 py-4">
                      {entry.status === "draft" ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            icon={Pencil}
                            onClick={() => setEditor(entry)}
                          >
                            Modifier
                          </Button>
                          {entry.fromBankImport && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              icon={Link2}
                              onClick={() => setLinking(entry)}
                              title="Rattacher l’opération du relevé à une écriture déjà saisie"
                            >
                              Rattacher
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            icon={Trash2}
                            className="hover:!bg-coral-50 hover:!text-coral-800"
                            onClick={() => setPendingDelete(entry)}
                          >
                            Supprimer
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end">
                          <Badge color="slate" icon={LockKeyhole}>
                            Verrouillée
                          </Badge>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

          {exporting && (
            <AccountingExportDialog entries={entries} onClose={() => setExporting(false)} />
          )}

          {linking && (
            <BankLinkDialog
              entry={linking}
              onClose={() => setLinking(null)}
              onLinked={() => {
                setLinking(null);
                router.refresh();
              }}
            />
          )}

          <ConfirmDialog
            open={Boolean(pendingDelete)}
            title="Supprimer cette écriture ?"
            description={
              pendingDelete
                ? `L'écriture « ${pendingDelete.label} » sera définitivement supprimée du livre de comptes.`
                : ""
            }
            confirmLabel="Supprimer l'écriture"
            loading={deleting}
            onCancel={() => setPendingDelete(null)}
            onConfirm={remove}
          />
        </>
      )}
    </div>
  );
}

function AccountingWorkspaceTab({
  active,
  icon: Icon,
  label,
  helper,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  helper: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/25 sm:px-4 sm:py-3",
        active
          ? "bg-brand-950 text-white"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
      )}
    >
      <span
        className={cn(
          // Masquée sur téléphone : trois onglets côte à côte n'y laissent
          // la place que du libellé.
          "hidden h-9 w-9 shrink-0 place-items-center rounded-lg sm:grid",
          active ? "bg-white/10 text-brand-100" : "bg-slate-100 text-slate-500",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold sm:text-base">
          {label}
        </span>
        <span
          className={cn(
            "block truncate text-xs",
            active ? "text-brand-200" : "text-slate-500",
          )}
        >
          {helper}
        </span>
      </span>
    </button>
  );
}

function AccountingMobileCard({
  entry,
  accountName,
  categoryName,
  onEdit,
  onLink,
  onDelete,
}: {
  entry: AccountingEntryView;
  accountName: string | null;
  categoryName: string | null;
  onEdit: () => void;
  onLink: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div
        aria-hidden="true"
        className={cn(
          "h-1.5",
          entry.type === "income" ? "bg-sea-500" : "bg-coral-600",
        )}
      />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-slate-950">{entry.label}</p>
            <p className="mt-1 text-xs text-slate-500">
              {formatShortDate(entry.occurredAt)} ·{" "}
              {categoryName || "Sans catégorie"}
            </p>
          </div>
          <Badge color={entry.status === "posted" ? "sea" : "amber"}>
            {entry.status === "posted" ? "Validée" : "Brouillon"}
          </Badge>
        </div>
        <p
          className={cn(
            "mt-5 text-2xl font-extrabold tabular-nums",
            entry.type === "income" ? "text-sea-700" : "text-coral-700",
          )}
        >
          {entry.type === "income" ? "+" : "−"}{" "}
          {formatEuros(entry.amountCents)}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
          <span>{accountName || "Sans compte"}</span>
          {entry.attachmentUrl && (
            <a
              href={entry.attachmentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"
            >
              <Paperclip className="h-3 w-3" />
              Justificatif
            </a>
          )}
        </div>
        {entry.status === "draft" ? (
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
            <Button
              type="button"
              size="sm"
              variant="outline"
              icon={Pencil}
              onClick={onEdit}
            >
              Modifier
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              icon={Trash2}
              className="hover:!bg-coral-50 hover:!text-coral-800"
              onClick={onDelete}
            >
              Supprimer
            </Button>
            {entry.fromBankImport && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={Link2}
                onClick={onLink}
                className="col-span-2"
              >
                Rattacher à une écriture existante
              </Button>
            )}
          </div>
        ) : (
          <p className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-500">
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            Écriture validée et verrouillée
          </p>
        )}
      </div>
    </Card>
  );
}

function AccountingEntryForm({
  entry,
  accounts,
  categories,
  onCategoryCreated,
  events,
  loading,
  onSubmit,
  onCancel,
}: {
  entry: AccountingEntryView | null;
  accounts: AccountingAccountView[];
  categories: AccountingCategoryView[];
  onCategoryCreated: (category: AccountingCategoryPayload) => void;
  events: AccountingEventView[];
  loading: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const availableAccounts = accounts.filter(
    (account) => account.isActive || account.id === entry?.accountId,
  );
  // Sens et catégorie sont liés : le serveur refuse une catégorie de
  // dépenses sur une recette. Le sens est donc contrôlé, et la liste des
  // catégories suit.
  const [entryType, setEntryType] = useState<AccountingEntryView["type"]>(
    entry?.type ?? "expense",
  );
  const [categoryId, setCategoryId] = useState(() => {
    const current = categories.find((c) => c.id === entry?.categoryId);
    return current && current.type === (entry?.type ?? "expense")
      ? current.id
      : "";
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Type" htmlFor="entry-type">
          <Select
            id="entry-type"
            name="type"
            value={entryType}
            onChange={(event) => {
              const next = event.currentTarget
                .value as AccountingEntryView["type"];
              setEntryType(next);
              const chosen = categories.find((c) => c.id === categoryId);
              if (chosen && chosen.type !== next) setCategoryId("");
            }}
          >
            <option value="income">Recette</option>
            <option value="expense">Dépense</option>
          </Select>
        </Field>
        <Field label="Statut" htmlFor="entry-status">
          <Select
            id="entry-status"
            name="status"
            defaultValue={entry?.status ?? "draft"}
          >
            <option value="posted">Validée</option>
            <option value="draft">Brouillon</option>
          </Select>
        </Field>
        <Field label="Date" htmlFor="occurredAt">
          <Input
            id="occurredAt"
            name="occurredAt"
            type="date"
            required
            defaultValue={
              dateInput(entry?.occurredAt ?? null) ||
              toDateInput(new Date())
            }
          />
        </Field>
        <Field label="Montant (€)" htmlFor="amount">
          <Input
            id="amount"
            name="amount"
            type="number"
            required
            min="0.01"
            step="0.01"
            inputMode="decimal"
            defaultValue={
              entry ? (entry.amountCents / 100).toFixed(2) : undefined
            }
            placeholder="0,00"
          />
        </Field>
        <Field label="Libellé" htmlFor="entry-label" className="sm:col-span-2">
          <Input
            id="entry-label"
            name="label"
            required
            defaultValue={entry?.label}
            placeholder="Ex. Achat de fournitures"
          />
        </Field>
        <Field label="Tiers" htmlFor="counterparty" className="sm:col-span-2">
          <Input
            id="counterparty"
            name="counterparty"
            defaultValue={entry?.counterparty ?? ""}
            placeholder="Fournisseur, donateur, partenaire…"
          />
        </Field>
        <Field label="Compte" htmlFor="accountId" className="sm:col-span-2">
          <Select
            id="accountId"
            name="accountId"
            defaultValue={entry?.accountId ?? ""}
          >
            <option value="">Sans compte affecté</option>
            {availableAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.type === "bank" ? "Banque" : "Caisse"}
                {!account.isActive ? " · Archivé" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Catégorie"
          htmlFor="categoryId"
          className="sm:col-span-2"
          hint={`Catégories de ${entryType === "income" ? "recettes" : "dépenses"}.`}
        >
          <input type="hidden" name="categoryId" value={categoryId} />
          <CategorySelect
            id="categoryId"
            type={entryType}
            value={categoryId}
            onChange={setCategoryId}
            categories={categories}
            keepId={entry?.categoryId}
            onCreated={onCategoryCreated}
          />
        </Field>
        <Field
          label="Événement"
          htmlFor="entry-event"
          className="sm:col-span-2"
          hint="Rattachez la recette ou la dépense à un événement pour obtenir son bilan."
        >
          <Select
            id="entry-event"
            name="eventId"
            defaultValue={entry?.eventId ?? ""}
          >
            <option value="">Hors événement</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title} · {formatShortDate(event.startAt)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Mode de paiement" htmlFor="paymentMethod">
          <Select
            id="paymentMethod"
            name="paymentMethod"
            defaultValue={entry?.paymentMethod ?? ""}
          >
            <option value="">Non renseigné</option>
            <option value="bank_transfer">Virement</option>
            <option value="card">Carte bancaire</option>
            <option value="check">Chèque</option>
            <option value="cash">Espèces</option>
            <option value="direct_debit">Prélèvement</option>
            <option value="other">Autre</option>
          </Select>
        </Field>
        <Field label="Référence" htmlFor="reference">
          <Input
            id="reference"
            name="reference"
            defaultValue={entry?.reference ?? ""}
            placeholder="N° facture, chèque…"
          />
        </Field>
        <FileUploadField
          label="Justificatif"
          name="attachmentUrl"
          scope="accounting"
          defaultValue={entry?.attachmentUrl}
          className="sm:col-span-2"
        />
        <Field
          label="Notes internes"
          htmlFor="entry-notes"
          className="sm:col-span-2 lg:col-span-4"
        >
          <Textarea
            id="entry-notes"
            name="notes"
            rows={3}
            defaultValue={entry?.notes ?? ""}
          />
        </Field>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t-2 border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          Annuler
        </Button>
        <Button type="submit" loading={loading} icon={CircleDollarSign}>
          {entry ? "Enregistrer les modifications" : "Ajouter l'écriture"}
        </Button>
      </div>
    </form>
  );
}
