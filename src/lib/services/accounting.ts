import { and, asc, desc, eq, sql } from "drizzle-orm";

import { HttpError } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  accountingCategories,
  accountingEntries,
  events,
  financialAccounts,
} from "@/lib/db/schema";
import { centimesDepuisSql } from "@/lib/money";
import { emptyToNull } from "@/lib/utils";
import {
  accountingCategorySchema,
  accountingEntrySchema,
  accountingEntryUpdateSchema,
  financialAccountSchema,
  financialAccountUpdateSchema,
  type AccountingEntryInput,
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

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Contrainte d'unicité qu'une requête vient de heurter, ou null. Drizzle
 * enveloppe l'erreur de PostgreSQL : on remonte la chaîne des causes.
 */
export function uniqueViolation(error: unknown): string | null {
  let courante: unknown = error;
  for (let i = 0; i < 4 && courante; i += 1) {
    const e = courante as { code?: unknown; constraint_name?: unknown };
    if (e.code === "23505") {
      return typeof e.constraint_name === "string" ? e.constraint_name : "";
    }
    courante =
      courante instanceof Error ? (courante as { cause?: unknown }).cause : null;
  }
  return null;
}

const INDEX_NUMERO_DE_COMPTE = "financial_accounts_bank_account_number_idx";

/**
 * Refuse un numéro de relevé déjà porté par un autre compte, avec son nom :
 * « déjà utilisé » seul laisserait le trésorier chercher lequel. L'index
 * unique reste le vrai garde-fou (voir `numeroDejaPris`).
 */
async function assertBankAccountNumberFree(
  bankAccountNumber: string | null | undefined,
  exceptId: string | null,
) {
  if (!bankAccountNumber) return;
  const [other] = await db
    .select({ id: financialAccounts.id, name: financialAccounts.name })
    .from(financialAccounts)
    .where(eq(financialAccounts.bankAccountNumber, bankAccountNumber))
    .limit(1);
  if (other && other.id !== exceptId) {
    throw new HttpError(
      409,
      `Le n° de compte ${bankAccountNumber} est déjà associé au compte « ${other.name} ».`,
    );
  }
}

/** Deux enregistrements simultanés du même numéro : l'index a tranché. */
function numeroDejaPris(error: unknown, bankAccountNumber: string | null | undefined) {
  if (uniqueViolation(error) === INDEX_NUMERO_DE_COMPTE) {
    return new HttpError(
      409,
      `Le n° de compte ${bankAccountNumber ?? ""} est déjà associé à un autre compte.`,
    );
  }
  return error;
}

export async function createFinancialAccount(
  input: unknown,
  actor: AuditActor,
) {
  const data = financialAccountSchema.parse(input);
  await assertBankAccountNumberFree(data.bankAccountNumber, null);
  const [account] = await db
    .insert(financialAccounts)
    .values({
      name: data.name,
      type: data.type,
      description: emptyToNull(data.description),
      bankAccountNumber: data.bankAccountNumber ?? null,
      isActive: data.isActive,
    })
    .returning()
    .catch((error: unknown) => {
      throw numeroDejaPris(error, data.bankAccountNumber);
    });

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
  if (data.bankAccountNumber !== undefined) {
    await assertBankAccountNumberFree(data.bankAccountNumber, id);
    updates.bankAccountNumber = data.bankAccountNumber ?? null;
  }

  const [account] = await db
    .update(financialAccounts)
    .set(updates)
    .where(eq(financialAccounts.id, id))
    .returning()
    .catch((error: unknown) => {
      throw numeroDejaPris(error, data.bankAccountNumber);
    });

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
  // Les sommes en `bigint` de bout en bout. Converties en `int`, elles
  // débordaient dès que le total dépassait 21 millions d'euros — deux
  // écritures au plafond de l'époque suffisaient —, et l'erreur empêchait
  // pour de bon l'affichage de la page Comptabilité, du bilan d'événement et
  // de la ressource MCP. `centimesDepuisSql` refuse ensuite tout total qu'un
  // nombre JavaScript ne représenterait pas exactement.
  const [summary] = await db
    .select({
      incomeCents: sql<string>`coalesce(sum(case when ${accountingEntries.type} = 'income' and ${accountingEntries.status} = 'posted' then ${accountingEntries.amountCents}::bigint else 0 end), 0)::bigint`,
      expenseCents: sql<string>`coalesce(sum(case when ${accountingEntries.type} = 'expense' and ${accountingEntries.status} = 'posted' then ${accountingEntries.amountCents}::bigint else 0 end), 0)::bigint`,
      draftCount: sql<number>`count(*) filter (where ${accountingEntries.status} = 'draft')::int`,
      missingAttachmentCount: sql<number>`count(*) filter (where ${accountingEntries.status} = 'posted' and ${accountingEntries.attachmentUrl} is null)::int`,
    })
    .from(accountingEntries)
    .where(eventId ? eq(accountingEntries.eventId, eventId) : undefined);

  const incomeCents = centimesDepuisSql(summary?.incomeCents);
  const expenseCents = centimesDepuisSql(summary?.expenseCents);
  return {
    incomeCents,
    expenseCents,
    balanceCents: incomeCents - expenseCents,
    draftCount: Number(summary?.draftCount ?? 0),
    missingAttachmentCount: Number(summary?.missingAttachmentCount ?? 0),
  };
}

type Lecteur = Pick<typeof db, "select">;

/**
 * Contrôle les rattachements d'une écriture, et les verrouille.
 *
 * Appelée dans la transaction de l'écriture : le verrou partagé (`key share`)
 * posé sur l'événement et sur la catégorie tient jusqu'à la fin de celle-ci.
 * Une suppression d'événement ou un changement de sens de catégorie, qui
 * verrouillent la même ligne en exclusif, attendent donc que l'écriture soit
 * enregistrée — et la voient. Sans ce verrou, une écriture validée pendant
 * qu'on supprimait son événement se retrouvait détachée de lui, ou rangée
 * sous une catégorie de dépenses devenue « recettes » entre le contrôle et
 * l'écriture.
 */
async function validateReferences(
  data: {
    type?: "income" | "expense";
    accountId?: string | null;
    categoryId?: string | null;
    eventId?: string | null;
  },
  lecteur: Lecteur,
) {
  if (data.eventId) {
    const [event] = await lecteur
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, data.eventId))
      .limit(1)
      .for("key share");
    if (!event) throw new HttpError(400, "Événement introuvable.");
  }
  if (data.accountId) {
    const [account] = await lecteur
      .select({ id: financialAccounts.id, isActive: financialAccounts.isActive })
      .from(financialAccounts)
      .where(eq(financialAccounts.id, data.accountId))
      .limit(1);
    if (!account || !account.isActive) {
      throw new HttpError(400, "Compte de trésorerie invalide ou inactif.");
    }
  }
  if (data.categoryId) {
    const [category] = await lecteur
      .select({
        id: accountingCategories.id,
        type: accountingCategories.type,
        isActive: accountingCategories.isActive,
      })
      .from(accountingCategories)
      .where(eq(accountingCategories.id, data.categoryId))
      .limit(1)
      .for("key share");
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

/**
 * Contrôle puis insère une écriture, dans la transaction de l'appelant.
 *
 * Partagée par la saisie manuelle et l'import des relevés : les mêmes règles
 * de rattachement (compte actif, catégorie active et du bon sens, événement
 * existant, verrous partagés) valent quelle que soit l'origine de l'écriture.
 * `data` a déjà passé `accountingEntrySchema`, ou respecte ses limites.
 */
export async function insertAccountingEntry(
  tx: Transaction,
  data: Omit<AccountingEntryInput, "version">,
  actor: AuditActor,
) {
  await validateReferences(data, tx);
  const [created] = await tx
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
  return created;
}

export async function createAccountingEntry(
  input: unknown,
  actor: AuditActor,
) {
  const data = accountingEntrySchema.parse(input);
  const entry = await db.transaction((tx) =>
    insertAccountingEntry(tx, data, actor),
  );

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
  const statutFinal = data.status ?? current.status;
  const evenementFinal =
    data.eventId !== undefined ? data.eventId : current.eventId;
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
  const entry = await db.transaction(async (tx) => {
    await validateReferences(
      {
        type: data.type ?? current.type,
        // Un brouillon peut rester rattaché à un compte archivé. Le compte
        // n'est revalidé que lorsque l'affectation change.
        accountId:
          data.accountId !== undefined && data.accountId !== current.accountId
            ? data.accountId
            : undefined,
        // Si seul le type change, revalider aussi la catégorie déjà
        // enregistrée : elle doit rester du même type que l'écriture.
        categoryId:
          data.categoryId !== undefined
            ? data.categoryId
            : data.type !== undefined
              ? current.categoryId
              : undefined,
        // Une écriture qu'on valide verrouille son événement, même inchangé :
        // c'est ce qui la met en file derrière une suppression en cours de
        // cet événement, ou la suppression derrière elle (voir
        // `deleteEvent`).
        eventId:
          statutFinal === "posted"
            ? evenementFinal
            : data.eventId !== undefined && data.eventId !== current.eventId
              ? data.eventId
              : undefined,
      },
      tx,
    );
    const [updated] = await tx
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
    return updated;
  });
  if (!entry) {
    throw new HttpError(
      409,
      "Cette écriture a été modifiée ou validée entre-temps.",
    );
  }

  await recordAudit(actor, "accounting.update", "accounting_entry", id, {
    changedFields: Object.keys(data).filter((key) => key !== "version"),
    ...(statutFinal !== current.status
      ? { status: { from: current.status, to: statutFinal } }
      : {}),
  });
  return entry;
}

/** « Frais bancaires » et « frais  BANCAIRES » sont la même catégorie. */
function nomDeCategorie(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Refuse une catégorie homonyme dans le même sens. Deux « Dons » côté
 * recettes couperaient en deux ce que la catégorie sert à regrouper — et
 * l'import des relevés, qui propose une catégorie d'après son nom, ne saurait
 * laquelle choisir. Le verrou consultatif sérialise les créations et
 * renommages simultanés : sans lui, deux onglets passaient le contrôle
 * ensemble.
 */
async function assertCategoryNameFree(
  tx: Transaction,
  name: string,
  type: "income" | "expense",
  exceptId: string | null,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('apel-manager:categories-comptables'))`,
  );
  const wanted = nomDeCategorie(name);
  const sameType = await tx
    .select({
      id: accountingCategories.id,
      name: accountingCategories.name,
      isActive: accountingCategories.isActive,
    })
    .from(accountingCategories)
    .where(eq(accountingCategories.type, type));
  const twin = sameType.find(
    (category) =>
      category.id !== exceptId && nomDeCategorie(category.name) === wanted,
  );
  if (twin) {
    throw new HttpError(
      409,
      `Une catégorie « ${twin.name} » existe déjà dans les ${type === "income" ? "recettes" : "dépenses"}${twin.isActive ? "." : " (désactivée : réactivez-la)."}`,
    );
  }
}

/** Crée une catégorie comptable (écran Comptabilité, outil MCP). */
export async function createAccountingCategory(
  input: unknown,
  actor: AuditActor,
) {
  const data = accountingCategorySchema.parse(input);
  return db.transaction(async (tx) => {
    await assertCategoryNameFree(tx, data.name, data.type, null);
    const [category] = await tx
      .insert(accountingCategories)
      .values({
        name: data.name,
        type: data.type,
        description: emptyToNull(data.description),
        isActive: data.isActive,
      })
      .returning();
    await recordAudit(
      actor,
      "accounting.category_create",
      "accounting_category",
      category.id,
      { name: category.name, type: category.type },
      tx,
    );
    return category;
  });
}

/**
 * Catégories avec leur usage : nombre d'écritures (tous statuts, c'est ce qui
 * empêche de supprimer) et total des écritures validées.
 */
export async function listAccountingCategoriesWithUsage(): Promise<
  {
    id: string;
    name: string;
    type: "income" | "expense";
    description: string | null;
    isActive: boolean;
    entryCount: number;
    postedTotalCents: number;
  }[]
> {
  const usage = db
    .select({
      categoryId: accountingEntries.categoryId,
      entryCount: sql<number>`count(*)::int`.as("entry_count"),
      postedTotalCents:
        sql<string>`coalesce(sum(${accountingEntries.amountCents}::bigint) filter (where ${accountingEntries.status} = 'posted'), 0)::bigint`.as(
          "posted_total_cents",
        ),
    })
    .from(accountingEntries)
    .groupBy(accountingEntries.categoryId)
    .as("usage");
  const rows = await db
    .select({
      id: accountingCategories.id,
      name: accountingCategories.name,
      type: accountingCategories.type,
      description: accountingCategories.description,
      isActive: accountingCategories.isActive,
      entryCount: usage.entryCount,
      postedTotalCents: usage.postedTotalCents,
    })
    .from(accountingCategories)
    .leftJoin(usage, eq(usage.categoryId, accountingCategories.id))
    .orderBy(asc(accountingCategories.name));
  return rows.map((row) => ({
    ...row,
    entryCount: Number(row.entryCount ?? 0),
    postedTotalCents: centimesDepuisSql(row.postedTotalCents),
  }));
}

/**
 * Modifie une catégorie comptable.
 *
 * Le SENS d'une catégorie (recette ou dépense) ne change plus dès qu'une
 * écriture s'y rattache : les écritures validées sont immuables, et faire
 * passer « Dons reçus » en dépenses les aurait rangées du mauvais côté du
 * résultat sans en toucher une seule. Même règle que pour le type d'un compte
 * de trésorerie : on désactive la catégorie, on en crée une autre.
 *
 * Le NOM, lui, reste modifiable, et c'est un choix. Une catégorie est une
 * étiquette de classement ; la renommer corrige une faute ou précise un
 * intitulé (« Kermesse » → « Kermesse de juin ») sans changer ni montant, ni
 * date, ni compte, ni sens — rien de ce que l'immuabilité protège. L'interdire
 * obligerait à dédoubler la catégorie, et couperait en deux l'historique
 * qu'elle sert précisément à regrouper. Le journal garde l'ancien et le
 * nouveau nom : un rapport imprimé avant le changement s'explique.
 *
 * Le verrou exclusif sur la catégorie met en file les écritures qui s'y
 * rattachent au même moment (elles la verrouillent en partage, voir
 * `validateReferences`) : le comptage voit tout ce qui a été enregistré avant.
 */
export async function updateAccountingCategory(
  id: string,
  input: unknown,
  actor: AuditActor,
) {
  const data = accountingCategorySchema.partial().parse(input);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(accountingCategories)
      .where(eq(accountingCategories.id, id))
      .for("update");
    if (!current) throw new HttpError(404, "Catégorie comptable introuvable.");

    if (data.type !== undefined && data.type !== current.type) {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(accountingEntries)
        .where(eq(accountingEntries.categoryId, id));
      if (Number(n) > 0) {
        throw new HttpError(
          409,
          `Cette catégorie est utilisée par ${n} écriture${Number(n) > 1 ? "s" : ""} : son sens (recette ou dépense) ne peut plus changer. Désactivez-la, puis créez-en une nouvelle.`,
        );
      }
    }

    // Même règle qu'à la création : un renommage ou un changement de sens ne
    // doit pas produire deux catégories homonymes.
    if (
      (data.name !== undefined && data.name !== current.name) ||
      (data.type !== undefined && data.type !== current.type)
    ) {
      await assertCategoryNameFree(
        tx,
        data.name ?? current.name,
        data.type ?? current.type,
        id,
      );
    }

    const updates: Partial<typeof accountingCategories.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined) updates.name = data.name;
    if (data.type !== undefined) updates.type = data.type;
    if (data.description !== undefined) {
      updates.description = emptyToNull(data.description);
    }
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    const [category] = await tx
      .update(accountingCategories)
      .set(updates)
      .where(eq(accountingCategories.id, id))
      .returning();

    await recordAudit(
      actor,
      "accounting.category_update",
      "accounting_category",
      id,
      {
        changedFields: Object.keys(data),
        ...(data.name !== undefined && data.name !== current.name
          ? { name: { from: current.name, to: data.name } }
          : {}),
        ...(data.type !== undefined && data.type !== current.type
          ? { type: { from: current.type, to: data.type } }
          : {}),
        ...(data.isActive !== undefined && data.isActive !== current.isActive
          ? { isActive: { from: current.isActive, to: data.isActive } }
          : {}),
      },
      tx,
    );
    return category;
  });
}

/**
 * Supprime une catégorie comptable qu'aucune écriture n'utilise.
 *
 * Le comptage se fait APRÈS le verrou exclusif sur la catégorie, pas avant.
 * Une écriture enregistrée au même moment verrouille la catégorie en partage
 * (voir `validateReferences`) : soit elle passe d'abord, et le comptage la
 * voit ; soit elle arrive ensuite, et ne trouve plus la catégorie. Compté hors
 * verrou, le contrôle laissait passer une écriture validée entre les deux, et
 * la clé étrangère (`on delete set null`) la détachait de sa catégorie : c'était
 * modifier, sans le dire, une écriture immuable.
 *
 * Tous statuts confondus : un brouillon rangé sous cette catégorie perdrait
 * lui aussi son classement. Une catégorie qui a servi se désactive.
 */
export async function deleteAccountingCategory(
  id: string,
  actor: AuditActor,
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: accountingCategories.id,
        name: accountingCategories.name,
        type: accountingCategories.type,
      })
      .from(accountingCategories)
      .where(eq(accountingCategories.id, id))
      .for("update");
    if (!current) throw new HttpError(404, "Catégorie comptable introuvable.");

    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(accountingEntries)
      .where(eq(accountingEntries.categoryId, id));
    if (Number(n) > 0) {
      throw new HttpError(
        409,
        `Cette catégorie est utilisée par ${n} écriture${Number(n) > 1 ? "s" : ""} : désactivez-la au lieu de la supprimer, l’historique reste ainsi classé.`,
      );
    }

    await tx
      .delete(accountingCategories)
      .where(eq(accountingCategories.id, id));
    await recordAudit(
      actor,
      "accounting.category_delete",
      "accounting_category",
      id,
      { name: current.name, type: current.type },
      tx,
    );
    return current;
  });
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
