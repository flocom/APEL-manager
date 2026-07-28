import { desc } from "drizzle-orm";
import { Landmark } from "lucide-react";

import {
  AccountingManager,
  type AccountingEntryView,
} from "@/components/accounting-manager";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import {
  accountingCategories,
  accountingEntries,
  events,
  financialAccounts,
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function AccountingPage() {
  await requireRole("admin");
  const [entries, accounts, categories, eventOptions] = await Promise.all([
    db
      .select()
      .from(accountingEntries)
      .orderBy(desc(accountingEntries.occurredAt)),
    db.select().from(financialAccounts),
    db.select().from(accountingCategories),
    db
      .select({
        id: events.id,
        title: events.title,
        startAt: events.startAt,
      })
      .from(events)
      .orderBy(desc(events.startAt)),
  ]);
  const eventTitles = new Map(
    eventOptions.map((event) => [event.id, event.title]),
  );

  const serialized: AccountingEntryView[] = entries.map((entry) => ({
    id: entry.id,
    type: entry.type,
    status: entry.status,
    accountId: entry.accountId,
    categoryId: entry.categoryId,
    eventId: entry.eventId,
    eventTitle: entry.eventId ? eventTitles.get(entry.eventId) ?? null : null,
    label: entry.label,
    amountCents: entry.amountCents,
    occurredAt: entry.occurredAt.toISOString(),
    counterparty: entry.counterparty,
    paymentMethod: entry.paymentMethod,
    reference: entry.reference,
    notes: entry.notes,
    attachmentUrl: entry.attachmentUrl,
    version: entry.version,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Comptabilité"
        description="Pilotez les recettes, dépenses et pièces justificatives de l'APEL."
        icon={Landmark}
      />
      <AccountingManager
        entries={serialized}
        accounts={accounts.map(
          ({ id, name, type, description, isActive }) => ({
            id,
            name,
            type,
            description,
            isActive,
          }),
        )}
        categories={categories.map(({ id, name, type }) => ({
          id,
          name,
          type,
        }))}
        events={eventOptions.map(({ id, title, startAt }) => ({
          id,
          title,
          startAt: startAt.toISOString(),
        }))}
      />
    </div>
  );
}
