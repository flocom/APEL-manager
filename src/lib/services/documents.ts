import { and, desc, eq, sql } from "drizzle-orm";

import { HttpError } from "@/lib/auth/guards";
import { formatLongDate } from "@/lib/dates";
import { pvEnHtml, pvEnTexte } from "@/lib/documents/ag-rendu";
import type { AgMinutesPayload } from "@/lib/documents/ag-types";
import { db } from "@/lib/db";
import {
  ASSOCIATION_DOCUMENT_TYPE_LABELS,
  type AssociationDocumentType,
} from "@/lib/labels";
import {
  associationDocuments,
  associationMembers,
  associationSettings,
} from "@/lib/db/schema";
import {
  removeUpload,
  storedUploadIdFromUrl,
} from "@/lib/uploads";
import { emptyToNull } from "@/lib/utils";
import { reglesStatutairesSchema } from "@/lib/documents/ag-validation";
import {
  associationDocumentSchema,
  associationDocumentUpdateSchema,
} from "@/lib/validation";

import { getAssociationSettings } from "./association-settings";
import { recordAudit, type AuditActor } from "./audit";
import { collectReferencedUploadIds } from "./uploads-references";

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
      payload: associationDocuments.payload,
      contentSource: associationDocuments.contentSource,
      signedAt: associationDocuments.signedAt,
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
      payload: associationDocuments.payload,
      contentSource: associationDocuments.contentSource,
      signedAt: associationDocuments.signedAt,
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

/**
 * Compose le texte du procès-verbal à partir de sa saisie structurée.
 *
 * Le texte reste la vérité stockée dans `content` : c'est lui que cherche la
 * recherche, que lisent les outils MCP et qu'affiche la carte. Le recomposer à
 * chaque écriture évite d'avoir deux versions du même document qui divergent.
 */
async function composerDepuisPayload(payload: AgMinutesPayload): Promise<string> {
  const association = await getAssociationSettings();
  return pvEnTexte(payload, {
    associationName: association.associationName,
    schoolName: association.schoolName,
    rna: association.rna,
    headquarters: association.headquarters,
  });
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
  const compose = data.payload
    ? await composerDepuisPayload(data.payload as AgMinutesPayload)
    : null;
  const [document] = await db
    .insert(associationDocuments)
    .values({
      type: data.type,
      status: data.status,
      title: data.title,
      documentDate: data.documentDate,
      content: compose ?? data.content,
      payload: (data.payload as AgMinutesPayload | null | undefined) ?? null,
      contentSource: compose === null ? "manual" : "payload",
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
  // Un document finalisé est celui qu'on a signé et diffusé : le laisser
  // modifiable en silence retirait toute valeur au statut, et à la jauge du
  // classeur qui s'y fie. Le rouvrir reste possible, mais c'est alors un geste
  // délibéré, seul accepté ici, et il laisse une trace au journal d'audit.
  if (current.status === "final") {
    const rouvre =
      data.status === "draft" && Object.keys(data).every((k) => k === "status" || k === "version");
    if (!rouvre) {
      throw new HttpError(
        409,
        "Ce document est finalisé. Rouvrez-le en brouillon avant de le modifier.",
      );
    }
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
  if (data.content !== undefined) {
    updates.content = data.content;
    // Quelqu'un a écrit le texte directement — le serveur MCP, le plus souvent.
    // Le noter évite que la sauvegarde suivante de l'éditeur ne l'efface sans
    // que personne ne comprenne où le texte est passé.
    updates.contentSource = "manual";
  }
  if (data.payload !== undefined) {
    updates.payload = (data.payload as AgMinutesPayload | null) ?? null;
    if (data.payload) {
      updates.content = await composerDepuisPayload(data.payload as AgMinutesPayload);
      updates.contentSource = "payload";
    } else {
      updates.contentSource = "manual";
    }
  }
  if (data.status === "final") updates.signedAt = updates.signedAt ?? null;
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
  if (uploadId) {
    // Le fichier n'est effacé que si PLUS RIEN ne le cite. Le contrôle ne
    // regardait que les autres documents ; or un même fichier déposé sert
    // aussi de pièce jointe d'événement, ou de justificatif d'écriture. La
    // suppression d'un vieux PV emportait alors la pièce jointe d'un
    // événement, qui menait ensuite à une page d'erreur. L'inventaire complet
    // est celui du nettoyage quotidien : une colonne ajoutée demain y est
    // comptée d'office. S'il échoue, on garde le fichier — un fichier inutile
    // se rattrape, un fichier perdu non.
    try {
      const references = await collectReferencedUploadIds();
      if (!references.has(uploadId)) await removeUpload(uploadId);
    } catch (error) {
      // Le nettoyage quotidien supprimera ce fichier s'il est bien orphelin.
      console.error(
        `[documents] pièce jointe ${uploadId} conservée, inventaire ou suppression impossible :`,
        error,
      );
    }
  }

  return document;
}

/**
 * Ce que prévoient les statuts de l'association.
 *
 * Séparé des autres réglages à dessein : l'écran de configuration générale
 * n'envoie pas ces champs, et le schéma des réglages remplace par leur valeur
 * par défaut tous ceux qu'il ne reçoit pas. Passer par ce point d'entrée
 * dédié met la fiche à l'abri de cet effacement.
 */
export async function saveStatutoryRules(input: unknown, actor: AuditActor) {
  const regles = reglesStatutairesSchema.parse(input);
  await db
    .insert(associationSettings)
    .values({ id: "default", statutoryRules: regles })
    .onConflictDoUpdate({
      target: associationSettings.id,
      set: { statutoryRules: regles, updatedAt: new Date() },
    });
  await recordAudit(
    actor,
    "association.statutory_rules_update",
    "association_settings",
    "default",
    { champsRenseignes: Object.keys(regles).length },
  );
  return regles;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function renderPrintableDocument(
  document: {
    title: string;
    type: AssociationDocumentType;
    documentDate: Date;
    content: string;
    memberFirstName: string | null;
    memberLastName: string | null;
    payload?: AgMinutesPayload | null;
    status?: "draft" | "final" | "archived";
  },
  options: { auto?: boolean } = {},
) {
  const association = await getAssociationSettings();
  const typeLabel =
    document.type === "ag_minutes"
      ? "Procès-verbal d’assemblée générale"
      : ASSOCIATION_DOCUMENT_TYPE_LABELS[document.type];
  const beneficiary =
    document.memberFirstName || document.memberLastName
      ? `<p><strong>Bénéficiaire :</strong> ${escapeHtml(
          [document.memberFirstName, document.memberLastName]
            .filter(Boolean)
            .join(" "),
        )}</p>`
      : "";
  const rnaSuffix = association.rna.trim()
    ? ` · RNA ${escapeHtml(association.rna.trim())}`
    : "";
  // L'identité complète — nom, siège, RNA — est ce qui fait qu'une préfecture,
  // une banque ou un assureur reconnaissent l'association dans le document.
  const siege = association.headquarters.trim()
    ? `<div class="rna">Siège social : ${escapeHtml(association.headquarters.trim())}</div>`
    : "";
  // Un procès-verbal rédigé dans l'éditeur guidé s'imprime section par
  // section ; tous les autres documents, et les PV saisis en texte libre,
  // gardent le rendu d'origine.
  const corps = document.payload
    ? pvEnHtml(
        document.payload,
        {
          associationName: association.associationName,
          schoolName: association.schoolName,
          rna: association.rna,
          headquarters: association.headquarters,
        },
        { projet: document.status !== "final" },
      )
    : `<div class="content">${escapeHtml(document.content)}</div>`;

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
    <div class="rna">${escapeHtml(association.schoolName)}${rnaSuffix}</div>
    ${siege}
  </header>
  <main>
    <p class="meta">${typeLabel} · ${formatLongDate(document.documentDate)}</p>
    <h1>${escapeHtml(document.title)}</h1>
    ${beneficiary}
    ${corps}
  </main>
  <footer>${escapeHtml(association.associationName)}${rnaSuffix}</footer>
  ${options.auto === false ? "" : '<script>window.addEventListener("load",()=>window.print())</script>'}
</body>
</html>`;
}
