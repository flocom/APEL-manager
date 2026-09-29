"use client";

import {
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Pencil,
  Plus,
  RotateCcw,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type {
  AccountingCategoryPayload,
  AccountingCategoryView,
  AccountingEntryType,
} from "@/components/accounting/types";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
} from "@/components/ui";
import { api } from "@/lib/client";
import { formatEuros } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Catégories proposées à une association qui démarre : les postes qu'on
 * retrouve dans presque tous les comptes d'APEL. Un clic les crée ; rien
 * n'est créé d'office, chacun garde la main sur son plan de classement.
 */
const SUGGESTED_CATEGORIES: Record<AccountingEntryType, string[]> = {
  income: [
    "Cotisations",
    "Dons",
    "Manifestations et ventes",
    "Subventions",
    "Participations des familles",
  ],
  expense: [
    "Achats pour les manifestations",
    "Cadeaux et animations",
    "Projets pour l’école",
    "Fournitures et fonctionnement",
    "Assurance",
    "Frais bancaires",
  ],
};

const TYPE_LABELS: Record<AccountingEntryType, string> = {
  income: "Recettes",
  expense: "Dépenses",
};

type CategoryResponse = { ok: true; category: AccountingCategoryPayload };

export function AccountingCategoriesManager({
  categories,
  onCategorySaved,
  onCategoryRemoved,
}: {
  categories: AccountingCategoryView[];
  onCategorySaved: (category: AccountingCategoryPayload) => void;
  onCategoryRemoved: (id: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [newType, setNewType] = useState<AccountingEntryType>("expense");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busySuggestion, setBusySuggestion] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<AccountingCategoryView | null>(null);

  const byType = useMemo(() => {
    const sorted = [...categories].sort(
      (left, right) =>
        Number(right.isActive) - Number(left.isActive) ||
        left.name.localeCompare(right.name, "fr"),
    );
    return {
      income: sorted.filter((category) => category.type === "income"),
      expense: sorted.filter((category) => category.type === "expense"),
    };
  }, [categories]);
  const activeCount = categories.filter((category) => category.isActive).length;

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setCreating(true);
    try {
      const { category } = await api<CategoryResponse>(
        "/api/accounting/categories",
        {
          body: {
            name: form.get("name"),
            type: form.get("type"),
            description: form.get("description") || null,
          },
        },
      );
      onCategorySaved(category);
      toast(`Catégorie « ${category.name} » créée.`);
      formElement.reset();
      setNewType(category.type);
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setCreating(false);
    }
  }

  async function createSuggested(type: AccountingEntryType, names: string[]) {
    setBusySuggestion(names.length > 1 ? `${type}:*` : `${type}:${names[0]}`);
    let created = 0;
    try {
      // Une à une : le serveur contrôle les doublons de nom dans une
      // transaction par catégorie, et un refus n'annule pas les précédentes.
      for (const name of names) {
        const { category } = await api<CategoryResponse>(
          "/api/accounting/categories",
          { body: { name, type } },
        );
        onCategorySaved(category);
        created += 1;
      }
      toast(
        created > 1
          ? `${created} catégories ajoutées aux ${TYPE_LABELS[type].toLocaleLowerCase("fr")}.`
          : `Catégorie « ${names[0]} » ajoutée.`,
      );
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setBusySuggestion(null);
      if (created > 0) router.refresh();
    }
  }

  async function patch(
    category: AccountingCategoryView,
    body: Record<string, unknown>,
    message: string,
  ) {
    setBusyId(category.id);
    try {
      const { category: saved } = await api<CategoryResponse>(
        `/api/accounting/categories/${category.id}`,
        { method: "PATCH", body },
      );
      onCategorySaved(saved);
      toast(message);
      router.refresh();
      return true;
    } catch (error) {
      toast((error as Error).message, "error");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setBusyId(target.id);
    try {
      await api(`/api/accounting/categories/${target.id}`, {
        method: "DELETE",
      });
      onCategoryRemoved(target.id);
      toast(`Catégorie « ${target.name} » supprimée.`);
      setPendingDelete(null);
      router.refresh();
    } catch (error) {
      // Un refus (catégorie utilisée entre-temps) se lit mieux en toast que
      // dans un dialogue resté ouvert.
      toast((error as Error).message, "error");
      setPendingDelete(null);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="flex items-start gap-3 bg-brand-950 px-5 py-5 text-white sm:px-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 text-brand-100">
            <Tags className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-200">
              Classement
            </p>
            <h2 className="mt-1 text-xl font-bold">Catégories comptables</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-brand-100">
              Rangez recettes et dépenses par poste pour obtenir un bilan
              lisible. {activeCount} catégorie{activeCount > 1 ? "s" : ""}{" "}
              active{activeCount > 1 ? "s" : ""}.
            </p>
          </div>
        </div>
        <form
          onSubmit={create}
          className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_auto] lg:items-end"
          aria-label="Nouvelle catégorie"
        >
          <Field label="Nom de la catégorie" htmlFor="category-name">
            <Input
              id="category-name"
              name="name"
              required
              maxLength={160}
              autoComplete="off"
              placeholder="Ex. Kermesse"
            />
          </Field>
          <Field label="Sens" htmlFor="category-type">
            <Select
              id="category-type"
              name="type"
              value={newType}
              onChange={(event) =>
                setNewType(event.currentTarget.value as AccountingEntryType)
              }
            >
              <option value="income">Recette</option>
              <option value="expense">Dépense</option>
            </Select>
          </Field>
          <Field
            label="Description (facultatif)"
            htmlFor="category-description"
            className="sm:col-span-2 lg:col-span-1"
          >
            <Input
              id="category-description"
              name="description"
              maxLength={1000}
              autoComplete="off"
              placeholder="Ce que la catégorie regroupe"
            />
          </Field>
          <Button
            type="submit"
            icon={Plus}
            loading={creating}
            className="w-full sm:col-span-2 lg:col-span-1 lg:w-auto"
          >
            Créer la catégorie
          </Button>
        </form>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {(["income", "expense"] as const).map((type) => (
          <CategoryColumn
            key={type}
            type={type}
            categories={byType[type]}
            busyId={busyId}
            busySuggestion={busySuggestion}
            onSuggest={(names) => void createSuggested(type, names)}
            onRename={(category, name) =>
              patch(category, { name }, "Catégorie renommée.")
            }
            onToggle={(category) =>
              void patch(
                category,
                { isActive: !category.isActive },
                category.isActive
                  ? "Catégorie désactivée : elle n’est plus proposée, son historique reste."
                  : "Catégorie réactivée.",
              )
            }
            onDelete={setPendingDelete}
          />
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Supprimer cette catégorie ?"
        description={
          pendingDelete
            ? pendingDelete.entryCount > 0
              ? `« ${pendingDelete.name} » classe ${pendingDelete.entryCount} écriture${pendingDelete.entryCount > 1 ? "s" : ""} : la suppression sera refusée. Désactivez-la plutôt pour ne plus la proposer.`
              : `« ${pendingDelete.name} » sera définitivement supprimée.`
            : ""
        }
        confirmLabel="Supprimer la catégorie"
        loading={Boolean(pendingDelete) && busyId === pendingDelete?.id}
        onCancel={() => setPendingDelete(null)}
        onConfirm={remove}
      />
    </div>
  );
}

function CategoryColumn({
  type,
  categories,
  busyId,
  busySuggestion,
  onSuggest,
  onRename,
  onToggle,
  onDelete,
}: {
  type: AccountingEntryType;
  categories: AccountingCategoryView[];
  busyId: string | null;
  busySuggestion: string | null;
  onSuggest: (names: string[]) => void;
  onRename: (category: AccountingCategoryView, name: string) => Promise<boolean>;
  onToggle: (category: AccountingCategoryView) => void;
  onDelete: (category: AccountingCategoryView) => void;
}) {
  const Icon = type === "income" ? ArrowDownLeft : ArrowUpRight;
  const headingId = `categories-${type}`;
  const suggestions = SUGGESTED_CATEGORIES[type];

  return (
    <Card className="overflow-hidden" aria-labelledby={headingId} role="region">
      <div className="flex items-center gap-3 border-b-2 border-slate-100 px-5 py-4">
        <span
          aria-hidden="true"
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white",
            type === "income" ? "bg-sea-600" : "bg-coral-700",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <h3 id={headingId} className="text-lg font-bold text-slate-950">
          {TYPE_LABELS[type]}
        </h3>
        <span className="ml-auto text-sm font-medium text-slate-500">
          {categories.length} catégorie{categories.length > 1 ? "s" : ""}
        </span>
      </div>

      {categories.length === 0 ? (
        <div className="p-5">
          <p className="text-sm text-slate-600">
            Aucune catégorie de {TYPE_LABELS[type].toLocaleLowerCase("fr")}{" "}
            pour l’instant. Ajoutez les catégories usuelles en un clic :
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  disabled={busySuggestion !== null}
                  onClick={() => onSuggest([name])}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border-2 border-brand-200 bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-800 transition-colors hover:border-brand-700 hover:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  {name}
                </button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-4"
            loading={busySuggestion === `${type}:*`}
            disabled={busySuggestion !== null}
            onClick={() => onSuggest(suggestions)}
          >
            Tout ajouter
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {categories.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              busy={busyId === category.id}
              onRename={(name) => onRename(category, name)}
              onToggle={() => onToggle(category)}
              onDelete={() => onDelete(category)}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function CategoryRow({
  category,
  busy,
  onRename,
  onToggle,
  onDelete,
}: {
  category: AccountingCategoryView;
  busy: boolean;
  onRename: (name: string) => Promise<boolean>;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(category.name);
  const inputId = `category-rename-${category.id}`;

  function startRename() {
    setName(category.name);
    setRenaming(true);
    requestAnimationFrame(() => {
      const input = document.getElementById(inputId) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  async function submitRename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === category.name) {
      setRenaming(false);
      return;
    }
    if (await onRename(trimmed)) setRenaming(false);
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center",
        !category.isActive && "bg-slate-50/70",
      )}
    >
      <div className="min-w-0 flex-1">
        {renaming ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor={inputId} className="sr-only">
              Nouveau nom de « {category.name} »
            </label>
            <Input
              id={inputId}
              value={name}
              maxLength={160}
              autoComplete="off"
              disabled={busy}
              onChange={(event) => setName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitRename();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setRenaming(false);
                }
              }}
              className="min-w-0 flex-1"
            />
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button
                type="button"
                size="sm"
                icon={Check}
                loading={busy}
                onClick={() => void submitRename()}
              >
                Enregistrer
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                icon={X}
                disabled={busy}
                onClick={() => setRenaming(false)}
              >
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p
                className={cn(
                  "break-words font-bold",
                  category.isActive ? "text-slate-950" : "text-slate-500",
                )}
              >
                {category.name}
              </p>
              {!category.isActive && <Badge color="slate">Désactivée</Badge>}
            </div>
            {category.description && (
              <p className="mt-0.5 break-words text-xs text-slate-500">
                {category.description}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              {category.entryCount === 0
                ? "Aucune écriture"
                : `${category.entryCount} écriture${category.entryCount > 1 ? "s" : ""}`}
              {" · "}
              <span className="font-semibold tabular-nums text-slate-700">
                {formatEuros(category.postedTotalCents)}
              </span>{" "}
              validés
            </p>
          </>
        )}
      </div>
      {!renaming && (
        <div className="-ml-3 flex flex-wrap gap-1 sm:ml-0 sm:shrink-0 sm:flex-nowrap">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={Pencil}
            disabled={busy}
            onClick={startRename}
            aria-label={`Renommer « ${category.name} »`}
          >
            <span aria-hidden="true">Renommer</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={category.isActive ? Archive : RotateCcw}
            loading={busy}
            onClick={onToggle}
            aria-label={`${category.isActive ? "Désactiver" : "Réactiver"} « ${category.name} »`}
          >
            <span aria-hidden="true">
              {category.isActive ? "Désactiver" : "Réactiver"}
            </span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={Trash2}
            disabled={busy}
            onClick={onDelete}
            className="hover:!bg-coral-50 hover:!text-coral-800"
            aria-label={`Supprimer « ${category.name} »`}
          >
            <span aria-hidden="true">Supprimer</span>
          </Button>
        </div>
      )}
    </li>
  );
}
