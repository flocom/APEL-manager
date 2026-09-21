import { Landmark } from "lucide-react";
import { notFound } from "next/navigation";

import { BudgetStat, SectionHeading } from "@/components/event-detail";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth/rbac";
import { getEventWithDetails } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { formatEurosAbsolute } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  getAccountingSummary,
  listAccountingEntries,
} from "@/lib/services/accounting";

export const dynamic = "force-dynamic";

/**
 * L'onglet « Budget » : recettes et dépenses rattachées à l'événement.
 *
 * Réservé aux administrateurs, comme le reste de la comptabilité. La barre
 * d'onglets ne le propose pas aux autres ; cette page refuse aussi d'elle-même,
 * un onglet masqué n'étant pas une protection.
 */
export default async function BudgetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, event] = await Promise.all([
    requireUser(),
    getEventWithDetails(id),
  ]);
  if (!event) notFound();
  if (user.role !== "admin") notFound();

  const [budget, budgetEntries] = await Promise.all([
    getAccountingSummary({ eventId: event.id }),
    listAccountingEntries(200, { eventId: event.id }),
  ]);
  if (!budget) notFound();

  return (
    <div className="space-y-5">
      <SectionHeading
        icon={Landmark}
        title="Budget de l’événement"
        description="Recettes et dépenses validées rattachées à cet événement."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <BudgetStat label="Recettes" cents={budget.incomeCents} tone="green" />
        <BudgetStat label="Dépenses" cents={budget.expenseCents} tone="red" />
        <BudgetStat
          label="Résultat"
          cents={budget.balanceCents}
          tone={budget.balanceCents >= 0 ? "brand" : "red"}
        />
      </div>
      {budget.draftCount > 0 && (
        <p className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          {budget.draftCount} écriture(s) en brouillon ne sont pas comptées
          dans ce résultat.
        </p>
      )}
      <Card className="!rounded-2xl !shadow-none p-5 sm:p-6">
        {budgetEntries.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucune écriture n’est rattachée à cet événement. Depuis
            Comptabilité, choisissez cet événement dans le champ
            « Événement » d’une recette ou d’une dépense.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {budgetEntries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-brand-950">
                    {entry.label}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDateTime(entry.occurredAt)}
                    {entry.status === "draft" ? " · brouillon" : ""}
                  </p>
                </div>
                <p
                  className={cn(
                    "shrink-0 font-black tabular-nums",
                    entry.type === "income"
                      ? "text-emerald-700"
                      : "text-coral-700",
                  )}
                >
                  {entry.type === "income" ? "+" : "−"}
                  {formatEurosAbsolute(entry.amountCents)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
