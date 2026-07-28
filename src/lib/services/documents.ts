import { and, desc, eq, sql } from "drizzle-orm";

import { HttpError } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { associationDocuments, associationMembers } from "@/lib/db/schema";
import {
  removeUpload,
  storedUploadIdFromUrl,
} from "@/lib/uploads";
import { emptyToNull } from "@/lib/utils";
import {
  associationDocumentSchema,
  associationDocumentUpdateSchema,
} from "@/lib/validation";

import { getAssociationSettings } from "./association-settings";
import { recordAudit, type AuditActor } from "./audit";

export async function listAssociationDocuments(limit = 200) {
  return db
    .select({
      id: associationDocuments.id,
      type: associationDocuments.type,
      status: associationDocuments.status,
      title: associationDocuments.title,
      documentDate: associationDocuments.documentDate,
      content: associationDocuments.content,
      memberId: associationDocuments.memberId,
      memberFirstName: associationMembers.firstName,
      memberLastName: associationMembers.lastName,
      fileUrl: associationDocuments.fileUrl,
      version: associationDocuments.version,
      createdAt: associationDocuments.createdAt,
      updatedAt: associationDocuments.updatedAt,
    })
    .from(associationDocuments)
    .leftJoin(
      associationMembers,
      eq(associationDocuments.memberId, associationMembers.id),
    )
    .orderBy(desc(associationDocuments.documentDate))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export async function getAssociationDocument(id: string) {
  const [document] = await db
    .select({
      id: associationDocuments.id,
      type: associationDocuments.type,
      status: associationDocuments.status,
      title: associationDocuments.title,
      documentDate: associationDocuments.documentDate,
      content: associationDocuments.content,
      memberId: associationDocuments.memberId,
      memberFirstName: associationMembers.firstName,
      memberLastName: associationMembers.lastName,
      fileUrl: associationDocuments.fileUrl,
      version: associationDocuments.version,
      createdAt: associationDocuments.createdAt,
      updatedAt: associationDocuments.updatedAt,
    })
    .from(associationDocuments)
    .leftJoin(
      associationMembers,
      eq(associationDocuments.memberId, associationMembers.id),
    )
    .where(eq(associationDocuments.id, id))
    .limit(1);
  return document ?? null;
}

export async function createAssociationDocument(
  input: unknown,
  actor: AuditActor,
) {
  const data = associationDocumentSchema.parse(input);
  if (data.status === "archived") {
    throw new HttpError(
      400,
      "Un document doit être créé en brouillon ou finalisé, puis archivé.",
    );
  }
  const [document] = await db
    .insert(associationDocuments)
    .values({
      type: data.type,
      status: data.status,
      title: data.title,
      documentDate: data.documentDate,
      content: data.content,
      memberId: data.memberId ?? null,
      fileUrl: emptyToNull(data.fileUrl),
      createdBy: actor.userId,
    })
    .returning();
  await recordAudit(actor, "document.create", "association_document", document.id, {
    type: document.type,
    status: document.status,
  });
  return document;
}

export async function updateAssociationDocument(
  id: string,
  input: unknown,
  actor: AuditActor,
) {
  const data = associationDocumentUpdateSchema.parse(input);
  const current = await getAssociationDocument(id);
  if (!current) throw new HttpError(404, "Document introuvable.");
  if (current.status === "archived") {
    throw new HttpError(
      409,
      "Un document archivé ne peut plus être modifié.",
    );
  }
  if (data.status === "archived") {
    throw new HttpError(
      409,
      "Utilisez l’action « Archiver » avant toute suppression.",
    );
  }

  const updates: Partial<typeof associationDocuments.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (data.type !== undefined) updates.type = data.type;
  if (data.status !== undefined) updates.status = data.status;
  if (data.title !== undefined) updates.title = data.title;
  if (data.documentDate !== undefined)
    updates.documentDate = data.documentDate;
  if (data.content !== undefined) updates.content = data.content;
  if (data.memberId !== undefined) updates.memberId = data.memberId ?? null;
  if (data.fileUrl !== undefined)
    updates.fileUrl = emptyToNull(data.fileUrl);

  const where =
    data.version === undefined
      ? eq(associationDocuments.id, id)
      : and(
          eq(associationDocuments.id, id),
          eq(associationDocuments.version, data.version),
        );
  const [document] = await db
    .update(associationDocuments)
    .set({
      ...updates,
      version:
        data.version === undefined
          ? sql`${associationDocuments.version} + 1`
          : data.version + 1,
    })
    .where(where)
    .returning();

  if (!document) {
    const exists = await getAssociationDocument(id);
    if (!exists) throw new HttpError(404, "Document introuvable.");
    throw new HttpError(
      409,
      "Ce document a été modifié entre-temps. Rechargez la page.",
    );
  }

  await recordAudit(actor, "document.update", "association_document", id, {
    changedFields: Object.keys(data).filter((key) => key !== "version"),
  });
  return document;
}

export async function archiveAssociationDocument(
  id: string,
  actor: AuditActor,
) {
  const [document] = await db
    .update(associationDocuments)
    .set({
      status: "archived",
      version: sql`${associationDocuments.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(associationDocuments.id, id))
    .returning();
  if (!document) throw new HttpError(404, "Document introuvable.");
  await recordAudit(actor, "document.archive", "association_document", id);
  return document;
}

export async function deleteArchivedAgMinutes(
  id: string,
  actor: AuditActor,
) {
  const [document] = await db
    .delete(associationDocuments)
    .where(
      and(
        eq(associationDocuments.id, id),
        eq(associationDocuments.type, "ag_minutes"),
        eq(associationDocuments.status, "archived"),
      ),
    )
    .returning({
      id: associationDocuments.id,
      type: associationDocuments.type,
      status: associationDocuments.status,
      title: associationDocuments.title,
      fileUrl: associationDocuments.fileUrl,
    });

  if (!document) {
    const existing = await getAssociationDocument(id);
    if (!existing) throw new HttpError(404, "Document introuvable.");
    if (existing.type !== "ag_minutes") {
      throw new HttpError(
        409,
        "Seuls les procès-verbaux archivés peuvent être supprimés.",
      );
    }
    throw new HttpError(
      409,
      "Le procès-verbal doit être archivé avant sa suppression.",
    );
  }

  await recordAudit(actor, "document.delete", "association_document", id, {
    type: document.type,
    title: document.title,
    hadFile: Boolean(document.fileUrl),
  });

  const fileUrl = document.fileUrl;
  const uploadId = fileUrl
    ? storedUploadIdFromUrl(fileUrl, "document")
    : null;
  if (uploadId && fileUrl) {
    const [remainingReference] = await db
      .select({ id: associationDocuments.id })
      .from(associationDocuments)
      .where(eq(associationDocuments.fileUrl, fileUrl))
      .limit(1);
    if (!remainingReference) {
      try {
        await removeUpload(uploadId);
      } catch (error) {
        // Le nettoyage quotidien supprimera ce fichier devenu orphelin.
        console.error(
          `[documents] impossible de supprimer la pièce jointe ${uploadId}:`,
          error,
        );
      }
    }
  }

  return document;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function renderPrintableDocument(document: {
  title: string;
  type: "ag_minutes" | "attestation" | "other";
  documentDate: Date;
  content: string;
  memberFirstName: string | null;
  memberLastName: string | null;
}) {
  const association = await getAssociationSettings();
  const typeLabel =
    document.type === "ag_minutes"
      ? "Procès-verbal d’assemblée générale"
      : document.type === "attestation"
        ? "Attestation"
        : "Document";
  const beneficiary =
    document.memberFirstName || document.memberLastName
      ? `<p><strong>Bénéficiaire :</strong> ${escapeHtml(
          [document.memberFirstName, document.memberLastName]
            .filter(Boolean)
            .join(" "),
        )}</p>`
      : "";
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(document.title)}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body { color:#082a40; font: 15px/1.6 Arial,sans-serif; margin:0; }
    header { border-bottom:3px solid #12aa9e; padding-bottom:18px; margin-bottom:32px; }
    .org { font-weight:800; font-size:18px; }
    .rna,.meta { color:#4b6473; font-size:13px; }
    h1 { font-size:26px; line-height:1.2; margin:0 0 10px; }
    .content { white-space:pre-wrap; margin-top:28px; }
    footer { border-top:1px solid #dbe5ea; margin-top:50px; padding-top:12px; color:#64748b; font-size:12px; }
    @media print { .no-print { display:none; } }
  </style>
</head>
<body>
  <header>
    <div class="org">${escapeHtml(association.associationName)}</div>
    <div class="rna">${escapeHtml(association.schoolName)} · RNA ${escapeHtml(association.rna)}</div>
  </header>
  <main>
    <p class="meta">${typeLabel} · ${new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "long",
      timeZone: "Europe/Paris",
    }).format(document.documentDate)}</p>
    <h1>${escapeHtml(document.title)}</h1>
    ${beneficiary}
    <div class="content">${escapeHtml(document.content)}</div>
  </main>
  <footer>${escapeHtml(association.associationName)} · RNA ${escapeHtml(association.rna)}</footer>
  <script>window.addEventListener("load",()=>window.print())</script>
</body>
</html>`;
}
