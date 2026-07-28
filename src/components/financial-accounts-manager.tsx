"use client";

import {
  Archive,
  Banknote,
  Landmark,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  WalletCards,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { api } from "@/lib/client";
import { formatEuros } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface FinancialAccountView {
  id: string;
  name: string;
  type: "bank" | "cash";
  description: string | null;
  isActive: boolean;
}

interface AccountEntrySummary {
  accountId: string | null;
  type: "income" | "expense";
  status: "draft" | "posted";
  amountCents: number;
}

export function FinancialAccountsManager({
  accounts,
  entries,
}: {
  accounts: FinancialAccountView[];
  entries: AccountEntrySummary[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [editor, setEditor] = useState<
    "new" | FinancialAccountView | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingArchive, setPendingArchive] =
    useState<FinancialAccountView | null>(null);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);

  const sortedAccounts = useMemo(
    () =>
      [...accounts].sort(
        (left, right) =>
          Number(right.isActive) - Number(left.isActive) ||
          left.name.localeCompare(right.name, "fr"),
      ),
    [accounts],
  );

  const accountMetrics = useMemo(() => {
    const metrics = new Map<string, { count: number; balanceCents: number }>();
    for (const account of accounts) {
      metrics.set(account.id, { count: 0, balanceCents: 0 });
    }
    for (const entry of entries) {
      if (!entry.accountId) continue;
      const current = metrics.get(entry.accountId);
      if (!current) continue;
      current.count += 1;
      if (entry.status === "posted") {
        current.balanceCents +=
          entry.type === "income" ? entry.amountCents : -entry.amountCents;
      }
    }
    return metrics;
  }, [accounts, entries]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;

    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const body = {
      name: form.get("name"),
      type: form.get("type"),
      description: form.get("description") || null,
      ...(editor === "new" ? { isActive: true } : {}),
    };

    try {
      if (editor === "new") {
        await api("/api/accounting/accounts", { body });
        toast("Compte de trésorerie créé.");
      } else {
        await api(`/api/accounting/accounts/${editor.id}`, {
          method: "PATCH",
          body,
        });
        toast("Compte de trésorerie mis à jour.");
      }
      setEditor(null);
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function archiveAccount() {
    if (!pendingArchive) return;
    setBusyAccountId(pendingArchive.id);
    try {
      await api(`/api/accounting/accounts/${pendingArchive.id}`, {
        method: "PATCH",
        body: { isActive: false },
      });
      toast("Compte archivé. Son historique reste conservé.");
      setPendingArchive(null);
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setBusyAccountId(null);
    }
  }

  async function reactivateAccount(account: FinancialAccountView) {
    setBusyAccountId(account.id);
    try {
      await api(`/api/accounting/accounts/${account.id}`, {
        method: "PATCH",
        body: { isActive: true },
      });
      toast("Compte réactivé.");
      router.refresh();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setBusyAccountId(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 bg-brand-950 px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 text-brand-100">
              <WalletCards className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-200">
                Trésorerie
              </p>
              <h2 className="mt-1 text-xl font-bold">Comptes et caisses</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-brand-100">
                Organisez les comptes bancaires et les caisses utilisés pour
                affecter les mouvements comptables.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="inverse"
            icon={Plus}
            onClick={() => setEditor("new")}
            className="w-full sm:w-auto"
          >
            Nouveau compte
          </Button>
        </div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
          <AccountSummary
            label="Comptes actifs"
            value={accounts.filter((account) => account.isActive).length}
          />
          <AccountSummary
            label="Comptes bancaires"
            value={
              accounts.filter(
                (account) => account.isActive && account.type === "bank",
              ).length
            }
          />
          <AccountSummary
            label="Caisses"
            value={
              accounts.filter(
                (account) => account.isActive && account.type === "cash",
              ).length
            }
          />
        </div>
      </Card>

      {editor && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b-2 border-slate-100 bg-brand-50 px-5 py-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">
                Compte de trésorerie
              </p>
              <h2 className="mt-1 text-xl font-bold text-brand-950">
                {editor === "new" ? "Créer un compte" : "Modifier le compte"}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setEditor(null)}
              disabled={submitting}
              className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Fermer le formulaire"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <FinancialAccountForm
            key={editor === "new" ? "new" : editor.id}
            account={editor === "new" ? null : editor}
            typeLocked={
              editor !== "new" &&
              (accountMetrics.get(editor.id)?.count ?? 0) > 0
            }
            loading={submitting}
            onSubmit={save}
            onCancel={() => setEditor(null)}
          />
        </Card>
      )}

      {accounts.length === 0 ? (
        <EmptyState
          icon={WalletCards}
          title="Aucun compte de trésorerie"
          description="Créez le compte bancaire ou la caisse de l’APEL pour pouvoir affecter vos écritures."
          action={
            <Button
              type="button"
              size="sm"
              icon={Plus}
              onClick={() => setEditor("new")}
            >
              Créer le premier compte
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sortedAccounts.map((account) => {
            const metrics = accountMetrics.get(account.id) ?? {
              count: 0,
              balanceCents: 0,
            };
            return (
              <AccountCard
                key={account.id}
                account={account}
                count={metrics.count}
                balanceCents={metrics.balanceCents}
                loading={busyAccountId === account.id}
                onEdit={() => setEditor(account)}
                onArchive={() => setPendingArchive(account)}
                onReactivate={() => reactivateAccount(account)}
              />
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingArchive)}
        title="Archiver ce compte ?"
        description={
          pendingArchive
            ? `« ${pendingArchive.name} » ne pourra plus être affecté aux nouvelles écritures. Toutes les écritures existantes et leur historique resteront conservés.`
            : ""
        }
        confirmLabel="Archiver le compte"
        loading={
          Boolean(pendingArchive) &&
          busyAccountId === (pendingArchive?.id ?? null)
        }
        onCancel={() => setPendingArchive(null)}
        onConfirm={archiveAccount}
      />
    </div>
  );
}

function AccountSummary({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between bg-white px-5 py-4 sm:block">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="text-2xl font-extrabold tabular-nums text-slate-950 sm:mt-1">
        {value}
      </p>
    </div>
  );
}

function AccountCard({
  account,
  count,
  balanceCents,
  loading,
  onEdit,
  onArchive,
  onReactivate,
}: {
  account: FinancialAccountView;
  count: number;
  balanceCents: number;
  loading: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onReactivate: () => void;
}) {
  const Icon = account.type === "bank" ? Landmark : Banknote;

  return (
    <Card
      className={cn(
        "overflow-hidden",
        !account.isActive && "border-slate-200 bg-slate-50/70",
      )}
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-xl",
              account.isActive
                ? "bg-brand-100 text-brand-800"
                : "bg-slate-200 text-slate-500",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-lg font-bold text-slate-950">
                {account.name}
              </h3>
              <Badge color={account.isActive ? "sea" : "slate"}>
                {account.isActive ? "Actif" : "Archivé"}
              </Badge>
            </div>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              {account.type === "bank" ? "Compte bancaire" : "Caisse espèces"}
            </p>
          </div>
        </div>

        <p className="mt-4 min-h-10 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">
          {account.description ||
            (account.type === "bank"
              ? "Compte bancaire de l’association."
              : "Caisse d’espèces de l’association.")}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Solde affecté
            </p>
            <p
              className={cn(
                "mt-1 break-words text-lg font-extrabold tabular-nums",
                balanceCents >= 0 ? "text-sea-700" : "text-coral-700",
              )}
            >
              {formatEuros(balanceCents)}
            </p>
          </div>
          <div className="border-l-2 border-slate-200 pl-3">
            <p className="text-xs font-medium text-slate-500">Mouvements</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums text-slate-950">
              {count}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t-2 border-slate-100 bg-white p-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          icon={Pencil}
          onClick={onEdit}
          disabled={loading}
        >
          Modifier
        </Button>
        {account.isActive ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={Archive}
            onClick={onArchive}
            disabled={loading}
          >
            Archiver
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            icon={RotateCcw}
            onClick={onReactivate}
            loading={loading}
          >
            Réactiver
          </Button>
        )}
      </div>
    </Card>
  );
}

function FinancialAccountForm({
  account,
  typeLocked,
  loading,
  onSubmit,
  onCancel,
}: {
  account: FinancialAccountView | null;
  typeLocked: boolean;
  loading: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-5 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom du compte" htmlFor="financial-account-name">
          <Input
            id="financial-account-name"
            name="name"
            required
            maxLength={160}
            defaultValue={account?.name ?? ""}
            placeholder="Ex. Compte courant Crédit Mutuel"
          />
        </Field>
        <Field
          label="Type"
          htmlFor="financial-account-type"
          hint={
            typeLocked
              ? "Le type ne peut plus changer après la première écriture."
              : undefined
          }
        >
          {typeLocked && account && (
            <input type="hidden" name="type" value={account.type} />
          )}
          <Select
            id="financial-account-type"
            name="type"
            defaultValue={account?.type ?? "bank"}
            disabled={typeLocked}
          >
            <option value="bank">Compte bancaire</option>
            <option value="cash">Caisse espèces</option>
          </Select>
        </Field>
        <Field
          label="Description"
          htmlFor="financial-account-description"
          hint="Facultatif — ajoutez un repère utile sans saisir de données bancaires sensibles."
          className="sm:col-span-2"
        >
          <Textarea
            id="financial-account-description"
            name="description"
            rows={3}
            maxLength={1000}
            defaultValue={account?.description ?? ""}
            placeholder="Ex. Compte principal utilisé pour les ventes et les dépenses courantes."
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
        <Button type="submit" loading={loading} icon={Save}>
          {account ? "Enregistrer les modifications" : "Créer le compte"}
        </Button>
      </div>
    </form>
  );
}
