import { and, asc, desc, eq, sql } from "drizzle-orm";

import { HttpError } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  accountingCategories,
  accountingEntries,
  events,
  financialAccounts,
} from "@/lib/db/schema";
import { emptyToNull } from "@/lib/utils";
import {
  accountingEntrySchema,
  accountingEntryUpdateSchema,
  financialAccountSchema,
  financialAccountUpdateSchema,
} from "@/lib/validation";

import { recordAudit, type AuditActor } from "./audit";

export async function listFinancialAccounts() {
  return db
    .select()
    .from(financialAccounts)
    .orderBy(asc(financialAccounts.name));
}

export async function getFinancialAccount(id: string) {
  const [account] = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.id, id))
    .limit(1);
  return account ?? null;
}

export async function createFinancialAccount(
  input: unknown,
  actor: AuditActor,
) {
  const data = financialAccountSchema.parse(input);
  const [account] = await db
    .insert(financialAccounts)
    .values({
      name: data.name,
      type: data.type,
      description: emptyToNull(data.description),
      isActive: data.isActive,
    })
    .returning();

  await recordAudit(
    actor,
    "accounting.account_create",
    "financial_account",
    account.id,
    { type: account.type },
  );
  return account;
}

export async function updateFinancialAccount(
  id: string,
  input: unknown,
  actor: AuditActor,
) {
  const data = financialAccountUpdateSchema.parse(input);
  const current = await getFinancialAccount(id);
  if (!current) throw new HttpError(404, "Compte de trésorerie introuvable.");

  if (data.type !== undefined && data.type !== current.type) {
    const [linkedEntry] = await db
      .select({ id: accountingEntries.id })
      .from(accountingEntries)
      .where(eq(accountingEntries.accountId, id))
      .limit(1);
    if (linkedEntry) {
      throw new HttpError(
        409,
        "Le type d’un compte déjà utilisé ne peut pas être modifié. Archivez-le puis créez un nouveau compte.",
      );
    }
  }

  const updates: Partial<typeof financialAccounts.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) updates.name = data.name;
  if (data.type !== undefined) updates.type = data.type;
  if (data.description !== undefined)
    updates.description = emptyToNull(data.description);
  if (data.isActive !== undefined) updates.isActive = data.isActive;

  const [account] = await db
    .update(financialAccounts)
    .set(updates)
    .where(eq(financialAccounts.id, id))
    .returning();

  const action =
    data.isActive === false && current.isActive
      ? "accounting.account_archive"
      : data.isActive === true && !current.isActive
        ? "accounting.account_reactivate"
        : "accounting.account_update";
  await recordAudit(actor, action, "financial_account", account.id, {
    changedFields: Object.keys(data),
  });
  return account;
}

export async function listAccountingEntries(
  limit = 200,
  { eventId }: { eventId?: string } = {},
) {
  return db
    .select({
      id: accountingEntries.id,
      type: accountingEntries.type,
      status: accountingEntries.status,
      label: accountingEntries.label,
      amountCents: accountingEntries.amountCents,
      occurredAt: accountingEntries.occurredAt,
      counterparty: accountingEntries.counterparty,
      paymentMethod: accountingEntries.paymentMethod,
      reference: accountingEntries.reference,
      notes: accountingEntries.notes,
      attachmentUrl: accountingEntries.attachmentUrl,
      accountId: accountingEntries.accountId,
      accountName: financialAccounts.name,
      categoryId: accountingEntries.categoryId,
      categoryName: accountingCategories.name,
      eventId: accountingEntries.eventId,
      eventTitle: events.title,
      version: accountingEntries.version,
      createdAt: accountingEntries.createdAt,
      updatedAt: accountingEntries.updatedAt,
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
    .leftJoin(events, eq(accountingEntries.eventId, events.id))
    .where(eventId ? eq(accountingEntries.eventId, eventId) : undefined)
    .orderBy(desc(accountingEntries.occurredAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export async function getAccountingEntry(id: string) {
  const [entry] = await db
    .select()
    .from(accountingEntries)
    .where(eq(accountingEntries.id, id))
    .limit(1);
  return entry ?? null;
}

/**
 * Totaux des écritures validées. Restreindre à un événement donne son bilan :
 * ce que la kermesse ou la vente a réellement rapporté.
 */
export async function getAccountingSummary({
  eventId,
}: { eventId?: string } = {}) {
  const [summary] = await db
    .select({
      incomeCents: sql<number>`coalesce(sum(case when ${accountingEntries.type} = 'income' and ${accountingEntries.status} = 'posted' then ${accountingEntries.amountCents} else 0 end), 0)::int`,
      expenseCents: sql<number>`coalesce(sum(case when ${accountingEntries.type} = 'expense' and ${accountingEntries.status} = 'posted' then ${accountingEntries.amountCents} else 0 end), 0)::int`,
      draftCount: sql<number>`count(*) filter (where ${accountingEntries.status} = 'draft')::int`,
      missingAttachmentCount: sql<number>`count(*) filter (where ${accountingEntries.status} = 'posted' and ${accountingEntries.attachmentUrl} is null)::int`,
    })
    .from(accountingEntries)
    .where(eventId ? eq(accountingEntries.eventId, eventId) : undefined);

  const incomeCents = Number(summary?.incomeCents ?? 0);
  const expenseCents = Number(summary?.expenseCents ?? 0);
  return {
    incomeCents,
    expenseCents,
    balanceCents: incomeCents - expenseCents,
    draftCount: Number(summary?.draftCount ?? 0),
    missingAttachmentCount: Number(summary?.missingAttachmentCount ?? 0),
  };
}

async function validateReferences(data: {
  type?: "income" | "expense";
  accountId?: string | null;
  categoryId?: string | null;
  eventId?: string | null;
}) {
  if (data.eventId) {
    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, data.eventId))
      .limit(1);
    if (!event) throw new HttpError(400, "Événement introuvable.");
  }
  if (data.accountId) {
    const [account] = await db
      .select({ id: financialAccounts.id, isActive: financialAccounts.isActive })
      .from(financialAccounts)
      .where(eq(financialAccounts.id, data.accountId))
      .limit(1);
    if (!account || !account.isActive) {
      throw new HttpError(400, "Compte de trésorerie invalide ou inactif.");
    }
  }
  if (data.categoryId) {
    const [category] = await db
      .select({
        id: accountingCategories.id,
        type: accountingCategories.type,
        isActive: accountingCategories.isActive,
      })
      .from(accountingCategories)
      .where(eq(accountingCategories.id, data.categoryId))
      .limit(1);
    if (!category || !category.isActive) {
      throw new HttpError(400, "Catégorie comptable invalide ou inactive.");
    }
    if (data.type && category.type !== data.type) {
      throw new HttpError(
        400,
        "La catégorie ne correspond pas au type de l’écriture.",
      );
    }
  }
}

export async function createAccountingEntry(
  input: unknown,
  actor: AuditActor,
) {
  const data = accountingEntrySchema.parse(input);
  await validateReferences(data);
  const [entry] = await db
    .insert(accountingEntries)
    .values({
      type: data.type,
      status: data.status,
      accountId: data.accountId ?? null,
      categoryId: data.categoryId ?? null,
      eventId: data.eventId ?? null,
      label: data.label,
      amountCents: data.amountCents,
      occurredAt: data.occurredAt,
      counterparty: emptyToNull(data.counterparty),
      paymentMethod: emptyToNull(data.paymentMethod),
      reference: emptyToNull(data.reference),
      notes: emptyToNull(data.notes),
      attachmentUrl: emptyToNull(data.attachmentUrl),
      createdBy: actor.userId,
    })
    .returning();

  await recordAudit(actor, "accounting.create", "accounting_entry", entry.id, {
    type: entry.type,
    status: entry.status,
    amountCents: entry.amountCents,
  });
  return entry;
}

export async function updateAccountingEntry(
  id: string,
  input: unknown,
  actor: AuditActor,
) {
  const current = await getAccountingEntry(id);
  if (!current) throw new HttpError(404, "Écriture comptable introuvable.");
  if (current.status === "posted") {
    throw new HttpError(
      409,
      "Une écriture validée est immuable. Créez une écriture corrective.",
    );
  }

  const data = accountingEntryUpdateSchema.parse(input);
  await validateReferences({
    type: data.type ?? current.type,
    // Un brouillon peut rester rattaché à un compte archivé. Le compte n'est
    // revalidé que lorsque l'affectation change.
    accountId:
      data.accountId !== undefined && data.accountId !== current.accountId
        ? data.accountId
        : undefined,
    // Si seul le type change, revalider aussi la catégorie déjà enregistrée :
    // elle doit rester du même type que l'écriture.
    categoryId:
      data.categoryId !== undefined
        ? data.categoryId
        : data.type !== undefined
          ? current.categoryId
          : undefined,
    eventId:
      data.eventId !== undefined && data.eventId !== current.eventId
        ? data.eventId
        : undefined,
  });
  const updates: Partial<typeof accountingEntries.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (data.type !== undefined) updates.type = data.type;
  if (data.status !== undefined) updates.status = data.status;
  if (data.accountId !== undefined) updates.accountId = data.accountId ?? null;
  if (data.categoryId !== undefined)
    updates.categoryId = data.categoryId ?? null;
  if (data.eventId !== undefined) updates.eventId = data.eventId ?? null;
  if (data.label !== undefined) updates.label = data.label;
  if (data.amountCents !== undefined) updates.amountCents = data.amountCents;
  if (data.occurredAt !== undefined) updates.occurredAt = data.occurredAt;
  if (data.counterparty !== undefined)
    updates.counterparty = emptyToNull(data.counterparty);
  if (data.paymentMethod !== undefined)
    updates.paymentMethod = emptyToNull(data.paymentMethod);
  if (data.reference !== undefined)
    updates.reference = emptyToNull(data.reference);
  if (data.notes !== undefined) updates.notes = emptyToNull(data.notes);
  if (data.attachmentUrl !== undefined)
    updates.attachmentUrl = emptyToNull(data.attachmentUrl);

  const expectedVersion = data.version ?? current.version;
  const [entry] = await db
    .update(accountingEntries)
    .set({ ...updates, version: expectedVersion + 1 })
    .where(
      and(
        eq(accountingEntries.id, id),
        eq(accountingEntries.version, expectedVersion),
        eq(accountingEntries.status, "draft"),
      ),
    )
    .returning();
  if (!entry) {
    throw new HttpError(
      409,
      "Cette écriture a été modifiée ou validée entre-temps.",
    );
  }

  await recordAudit(actor, "accounting.update", "accounting_entry", id, {
    changedFields: Object.keys(data).filter((key) => key !== "version"),
  });
  return entry;
}

export async function deleteDraftAccountingEntry(
  id: string,
  actor: AuditActor,
) {
  const [deleted] = await db
    .delete(accountingEntries)
    .where(
      and(
        eq(accountingEntries.id, id),
        eq(accountingEntries.status, "draft"),
      ),
    )
    .returning({ id: accountingEntries.id });
  if (!deleted) {
    const exists = await getAccountingEntry(id);
    if (!exists) throw new HttpError(404, "Écriture comptable introuvable.");
    throw new HttpError(
      409,
      "Seules les écritures au brouillon peuvent être supprimées.",
    );
  }
  await recordAudit(actor, "accounting.delete_draft", "accounting_entry", id);
}
