import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import {
  isReceiptFilename,
  RECEIPTS_PER_UPLOAD,
  type ReceiptView,
} from "@/lib/accounting/receipts";
import { HttpError } from "@/lib/auth/guards";
import { parseLocalDateTime, toDateInput } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  accountingEntries,
  accountingReceipts,
  type AccountingReceipt,
} from "@/lib/db/schema";
import { redactError } from "@/lib/errors";
import { MONTANT_MAX_CENTIMES } from "@/lib/money";
import {
  describeStoredUpload,
  removeUpload,
  saveUpload,
  storedUploadIdFromUrl,
} from "@/lib/uploads";

import { recordAudit, type AuditActor } from "./audit";
import { collectReferencedUploadIds } from "./uploads-references";

/**
 * Boîte à justificatifs, côté serveur. La règle métier est décrite en tête de
 * `src/lib/accounting/receipts.ts` : un reçu attend dans la boîte, puis devient
 * le justificatif d'une écriture qui n'en a pas — validée ou non — et quitte
 * la boîte.
 */

export async function listReceipts(): Promise<AccountingReceipt[]> {
  return db
    .select()
    .from(accountingReceipts)
    .orderBy(desc(accountingReceipts.createdAt), desc(accountingReceipts.id));
}

export function receiptView(row: AccountingReceipt): ReceiptView {
  return {
    id: row.id,
    fileUrl: row.fileUrl,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    label: row.label,
    amountCents: row.amountCents,
    receiptDate: row.receiptDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    version: row.version,
  };
}

/**
 * Dépose un lot de reçus. Tout ou rien : si un fichier est refusé, ou si
 * l'enregistrement échoue, les fichiers déjà écrits de ce lot sont retirés du
 * disque — l'administrateur recommence avec un lot propre, et il ne reste pas
 * de fichier sans ligne qui attendrait le nettoyage des orphelins.
 */
export async function createReceipts(
  files: File[],
  actor: AuditActor,
): Promise<AccountingReceipt[]> {
  if (files.length === 0) {
    throw new HttpError(400, "Sélectionnez au moins un reçu.");
  }
  if (files.length > RECEIPTS_PER_UPLOAD) {
    throw new HttpError(
      400,
      `Déposez au plus ${RECEIPTS_PER_UPLOAD} reçus à la fois.`,
    );
  }

  const refuse = files.find((file) => !isReceiptFilename(file.name));
  if (refuse) {
    throw new HttpError(
      415,
      `« ${refuse.name} » n’est pas un reçu accepté : PDF ou photo (JPG, PNG, WebP).`,
    );
  }

  const saved: Awaited<ReturnType<typeof saveUpload>>[] = [];
  try {
    for (const file of files) {
      saved.push(await saveUpload("accounting", file));
    }
    return await db.transaction(async (tx) => {
      const rows = await tx
        .insert(accountingReceipts)
        .values(
          saved.map((file) => ({
            fileUrl: file.url,
            filename: file.filename,
            contentType: file.contentType,
            sizeBytes: file.size,
            uploadedBy: actor.userId,
          })),
        )
        .returning();
      // `returning` ne garantit pas l'ordre : on rend celui du dépôt.
      const parUrl = new Map(rows.map((row) => [row.fileUrl, row]));
      const ordered = saved.map((file) => parUrl.get(file.url)!);
      for (const row of ordered) {
        await recordAudit(
          actor,
          "accounting.receipt.create",
          "accounting_receipt",
          row.id,
          {
            fileUrl: row.fileUrl,
            filename: row.filename,
            contentType: row.contentType,
            size: row.sizeBytes,
          },
          tx,
        );
      }
      return ordered;
    });
  } catch (error) {
    await Promise.all(saved.map((file) => removeUpload(file.id).catch(() => {})));
    throw error;
  }
}

const receiptDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ.")
  .transform((value, ctx) => {
    // Minuit, heure de Paris, comme les autres dates saisies sans heure.
    const date = parseLocalDateTime(`${value}T00:00`);
    // « 2026-02-31 » deviendrait le 3 mars : on le refuse plutôt.
    if (Number.isNaN(date.getTime()) || toDateInput(date) !== value) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Date invalide." });
      return z.NEVER;
    }
    return date;
  });

export const receiptUpdateSchema = z.object({
  label: z
    .string()
    .trim()
    .max(200, "Libellé trop long (200 caractères au plus).")
    .transform((value) => value || null)
    .nullable()
    .optional(),
  amountCents: z
    .number()
    .int("Le montant doit être un nombre entier de centimes.")
    .positive("Le montant doit être strictement positif.")
    .max(
      MONTANT_MAX_CENTIMES,
      "Montant trop élevé : un reçu ne dépasse pas 1 000 000 €. Vérifiez la saisie.",
    )
    .nullable()
    .optional(),
  receiptDate: z
    .union([z.literal("").transform(() => null), receiptDateSchema])
    .nullable()
    .optional(),
  version: z.number().int().nonnegative(),
});

const uuid = z.string().uuid();

/**
 * Un identifiant qui n'est pas un UUID ne désigne aucun reçu : 404, plutôt
 * que l'erreur de conversion que Postgres lèverait (une 500).
 */
function assertReceiptId(id: string) {
  if (!uuid.safeParse(id).success) throw new HttpError(404, "Reçu introuvable.");
}

/** Libellé, montant et date d'un reçu : de quoi retrouver son écriture. */
export async function updateReceipt(
  id: string,
  input: unknown,
  actor: AuditActor,
): Promise<AccountingReceipt> {
  assertReceiptId(id);
  const data = receiptUpdateSchema.parse(input);
  const updates: Partial<typeof accountingReceipts.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (data.label !== undefined) updates.label = data.label;
  if (data.amountCents !== undefined) updates.amountCents = data.amountCents;
  if (data.receiptDate !== undefined) updates.receiptDate = data.receiptDate;

  const resultat = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(accountingReceipts)
      .where(eq(accountingReceipts.id, id))
      .for("update");
    if (!current) return { erreur: 404 as const };
    if (current.version !== data.version) return { erreur: 409 as const };

    // L'écran renvoie toujours les trois champs : le journal ne retient que
    // ceux qui changent vraiment, avec leur valeur d'avant et d'après.
    const memeValeur = (a: unknown, b: unknown) =>
      a instanceof Date || b instanceof Date
        ? (a instanceof Date ? a.getTime() : a) === (b instanceof Date ? b.getTime() : b)
        : a === b;
    const changes: Record<string, { avant: unknown; apres: unknown }> = {};
    for (const key of ["label", "amountCents", "receiptDate"] as const) {
      if (updates[key] !== undefined && !memeValeur(current[key], updates[key])) {
        changes[key] = { avant: current[key], apres: updates[key] };
      }
    }

    const [row] = await tx
      .update(accountingReceipts)
      .set({ ...updates, version: data.version + 1 })
      .where(eq(accountingReceipts.id, id))
      .returning();
    if (Object.keys(changes).length > 0) {
      await recordAudit(
        actor,
        "accounting.receipt.update",
        "accounting_receipt",
        id,
        { changedFields: Object.keys(changes), changes },
        tx,
      );
    }
    return { row };
  });

  if ("erreur" in resultat) {
    if (resultat.erreur === 404) throw new HttpError(404, "Reçu introuvable.");
    throw new HttpError(
      409,
      "Ce reçu a été modifié entre-temps. Rechargez la page.",
    );
  }
  return resultat.row;
}

/**
 * Retire un reçu de la boîte, et son fichier du disque s'il n'est plus cité
 * nulle part (le même fichier peut avoir servi ailleurs : voir
 * `deleteArchivedAgMinutes`, qui suit la même prudence).
 */
export async function deleteReceipt(id: string, actor: AuditActor) {
  assertReceiptId(id);
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(accountingReceipts)
      .where(eq(accountingReceipts.id, id))
      .returning();
    if (!row) return null;
    await recordAudit(
      actor,
      "accounting.receipt.delete",
      "accounting_receipt",
      id,
      { fileUrl: row.fileUrl, filename: row.filename },
      tx,
    );
    return row;
  });
  if (!deleted) throw new HttpError(404, "Reçu introuvable.");

  const uploadId = storedUploadIdFromUrl(deleted.fileUrl, "accounting");
  if (uploadId) {
    // S'il échoue, on garde le fichier : un fichier inutile se rattrape (le
    // nettoyage quotidien l'effacera s'il est bien orphelin), un fichier
    // perdu non.
    try {
      const references = await collectReferencedUploadIds();
      if (!references.has(uploadId)) await removeUpload(uploadId);
    } catch (error) {
      console.error(
        `[comptabilité] reçu ${uploadId} conservé, inventaire ou suppression impossible :`,
        redactError(error),
      );
    }
  }
  return deleted;
}

/**
 * Fait d'un reçu le justificatif d'une écriture, et le retire de la boîte.
 *
 * Seule entorse à l'immuabilité des écritures validées : une écriture
 * `posted` sans justificatif peut recevoir le sien, parce que le justificatif
 * ne change rien de ce que la validation verrouille (montant, date, compte,
 * catégorie ; le FEC n'en porte pas trace). L'entorse s'arrête là :
 * `attachmentUrl` passe de vide à ce reçu, jamais d'un fichier à un autre —
 * on ne remplace pas une pièce sans la voir. `updateAccountingEntry`, lui,
 * continue de refuser toute modification d'une écriture validée.
 *
 * Les deux lignes sont verrouillées (écriture d'abord, puis reçu) : deux
 * associations simultanées vers la même écriture, ou du même reçu, se
 * suivent, et la seconde voit le travail de la première.
 */
export async function attachReceipt(
  receiptId: string,
  entryId: string,
  actor: AuditActor,
) {
  assertReceiptId(receiptId);
  if (!uuid.safeParse(entryId).success) {
    throw new HttpError(404, "Écriture comptable introuvable.");
  }
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .select()
      .from(accountingEntries)
      .where(eq(accountingEntries.id, entryId))
      .limit(1)
      .for("update");
    if (!entry) throw new HttpError(404, "Écriture comptable introuvable.");

    const [receipt] = await tx
      .select()
      .from(accountingReceipts)
      .where(eq(accountingReceipts.id, receiptId))
      .limit(1)
      .for("update");
    if (!receipt) throw new HttpError(404, "Reçu introuvable.");

    if (entry.attachmentUrl) {
      throw new HttpError(409, "Cette écriture a déjà un justificatif.");
    }

    const [updated] = await tx
      .update(accountingEntries)
      .set({
        attachmentUrl: receipt.fileUrl,
        version: sql`${accountingEntries.version} + 1`,
        // Une écriture validée garde son `updatedAt` : le FEC en tire sa date
        // de validation (src/lib/accounting/fec.ts), et recevoir le
        // justificatif qui lui manquait ne la valide pas une seconde fois.
        ...(entry.status === "draft" ? { updatedAt: new Date() } : {}),
      })
      .where(eq(accountingEntries.id, entryId))
      .returning();

    await tx
      .delete(accountingReceipts)
      .where(eq(accountingReceipts.id, receiptId));

    await recordAudit(
      actor,
      "accounting.receipt.attach",
      "accounting_entry",
      entryId,
      {
        receiptId,
        entryId,
        entryStatus: entry.status,
        fileUrl: receipt.fileUrl,
        filename: receipt.filename,
      },
      tx,
    );
    return updated;
  });
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Remet dans la boîte le justificatif d'un brouillon qui va disparaître.
 *
 * Supprimer un brouillon, annuler l'import qui l'a créé ou le rattacher à une
 * écriture déjà saisie effaçait la seule ligne qui citait son justificatif :
 * le fichier partait au nettoyage des orphelins le lendemain. Or associer un
 * reçu à l'écriture d'un relevé importé, puis rattacher celle-ci à l'écriture
 * saisie à la main, est le parcours normal de la boîte. Le reçu y revient,
 * avec le libellé, le montant et la date de l'écriture, prêt à être associé de
 * nouveau. Un lien externe (https) n'est pas un fichier conservé ici : il n'y
 * a rien à garder.
 */
export async function remettreJustificatifDansLaBoite(
  tx: Transaction,
  entry: Pick<
    typeof accountingEntries.$inferSelect,
    "id" | "attachmentUrl" | "label" | "amountCents" | "occurredAt"
  >,
  actor: AuditActor,
  motif: "suppression" | "annulation_import" | "rattachement",
) {
  if (!entry.attachmentUrl) return null;
  const fichier = await describeStoredUpload(entry.attachmentUrl);
  if (!fichier || !storedUploadIdFromUrl(entry.attachmentUrl, "accounting")) return null;
  const [row] = await tx
    .insert(accountingReceipts)
    .values({
      fileUrl: entry.attachmentUrl,
      filename: fichier.filename,
      contentType: fichier.contentType,
      sizeBytes: fichier.size,
      label: entry.label.slice(0, 200),
      amountCents: entry.amountCents > 0 ? entry.amountCents : null,
      receiptDate: entry.occurredAt,
      uploadedBy: actor.userId,
    })
    .onConflictDoNothing({ target: accountingReceipts.fileUrl })
    .returning();
  if (row) {
    await recordAudit(
      actor,
      "accounting.receipt.restore",
      "accounting_receipt",
      row.id,
      { entryId: entry.id, motif, fileUrl: row.fileUrl, filename: row.filename },
      tx,
    );
  }
  return row ?? null;
}
