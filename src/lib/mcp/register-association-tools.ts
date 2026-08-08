import { and, asc, desc, eq, gte, like, sql } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { db } from "@/lib/db";
import { ASSOCIATION_DOCUMENT_TYPES } from "@/lib/labels";
import {
  accountingCategories,
  accountingEntries,
  associationMembers,
  auditLogs,
} from "@/lib/db/schema";
import {
  sendBulkEmail,
  sendEmail,
  uniqueRecipients,
} from "@/lib/notifications/email";
import {
  createAccountingEntry,
  createFinancialAccount,
  deleteDraftAccountingEntry,
  getAccountingSummary,
  listAccountingEntries,
  listFinancialAccounts,
  updateAccountingEntry,
  updateFinancialAccount,
} from "@/lib/services/accounting";
import {
  archiveAssociationMember,
  createAssociationMember,
  listAssociationMembers,
  updateAssociationMember,
} from "@/lib/services/adherents";
import {
  getAssociationSettings,
  saveAssociationSettings,
} from "@/lib/services/association-settings";
import { recordAudit } from "@/lib/services/audit";
import {
  archiveAssociationDocument,
  createAssociationDocument,
  deleteArchivedAgMinutes,
  getAssociationDocument,
  listAssociationDocuments,
  updateAssociationDocument,
} from "@/lib/services/documents";
import {
  getOutboundMailStatus,
  markOutboundMailTest,
  saveOutboundMailSettings,
} from "@/lib/services/mail-settings";
import { getUpdateStatus } from "@/lib/services/updates";
import { emptyToNull } from "@/lib/utils";
import {
  accountingCategorySchema,
} from "@/lib/validation";

import {
  destructiveTool,
  mcpAuditActor,
  readOnlyTool,
  requireMcpAccess,
  toolResult,
  writeTool,
  type McpAssociationProfile,
  type McpPrincipal,
} from "./types";

const optionalNullableString = z.string().nullable().optional();
const optionalNullableUuid = z.string().uuid().nullable().optional();
const localDateTime = z
  .string()
  .min(16)
  .describe("Date et heure locale de Paris, format YYYY-MM-DDTHH:mm");

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function associationBroadcastEmail(
  input: { subject: string; message: string; senderName?: string },
  associationName: string,
) {
  const paragraphs = input.message
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const signature = input.senderName
    ? `<p style="color:#64748b;">— ${escapeHtml(input.senderName)}</p>`
    : "";
  return {
    subject: input.subject,
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;color:#0f172a;">
        <h2 style="color:#075d8d;">${escapeHtml(input.subject)}</h2>
        ${paragraphs}${signature}
        <p style="color:#94a3b8;font-size:13px;margin-top:28px;">${escapeHtml(associationName)} — message automatique</p>
      </div>`,
    text: `${input.message}${input.senderName ? `\n\n— ${input.senderName}` : ""}`,
  };
}

export function registerAssociationTools(
  server: McpServer,
  principal: McpPrincipal,
  association: McpAssociationProfile,
) {
  server.registerTool(
    "list_adherents",
    {
      title: "Lister les adhérents",
      description:
        "Liste les adhérents juridiques de l’APEL, distincts des comptes utilisateurs.",
      inputSchema: z.object({
        status: z.enum(["active", "pending", "inactive"]).optional(),
        schoolYear: z.string().regex(/^\d{4}-\d{4}$/).optional(),
        query: z.string().max(120).optional(),
        limit: z.number().int().min(1).max(500).default(100),
      }),
      annotations: readOnlyTool,
    },
    async ({ status, schoolYear, query, limit }) => {
      requireMcpAccess(principal, "mcp:read", "admin");
      let items = await listAssociationMembers();
      if (status) items = items.filter((item) => item.status === status);
      if (schoolYear)
        items = items.filter((item) => item.schoolYear === schoolYear);
      if (query) {
        const needle = query.toLocaleLowerCase("fr");
        items = items.filter((item) =>
          [item.firstName, item.lastName, item.email ?? "", item.city ?? ""]
            .join(" ")
            .toLocaleLowerCase("fr")
            .includes(needle),
        );
      }
      return toolResult({ items: items.slice(0, limit), count: items.length });
    },
  );

  server.registerTool(
    "create_adherent",
    {
      title: "Créer un adhérent",
      description:
        `Ajoute un adhérent à ${association.associationName} pour une année scolaire.`,
      inputSchema: z.object({
        firstName: z.string().min(1).max(120),
        lastName: z.string().min(1).max(120),
        email: optionalNullableString,
        phone: optionalNullableString,
        addressLine1: optionalNullableString,
        addressLine2: optionalNullableString,
        postalCode: optionalNullableString,
        city: optionalNullableString,
        country: z.string().default("France"),
        status: z.enum(["active", "pending", "inactive"]).default("pending"),
        schoolYear: z.string().regex(/^\d{4}-\d{4}$/),
        membershipFeeCents: z.number().int().min(0).default(0),
        feePaidAt: localDateTime.nullable().optional(),
        joinedAt: localDateTime.optional(),
        notes: optionalNullableString,
        userId: optionalNullableUuid,
      }),
      annotations: writeTool,
    },
    async (args) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      const member = await createAssociationMember(
        args,
        mcpAuditActor(principal),
      );
      return toolResult({ member }, "Adhérent créé.");
    },
  );

  server.registerTool(
    "update_adherent",
    {
      title: "Modifier un adhérent",
      description:
        "Met à jour les coordonnées, la cotisation ou le statut d’un adhérent.",
      inputSchema: z.object({
        id: z.string().uuid(),
        version: z.number().int().min(0).optional(),
        firstName: z.string().min(1).max(120).optional(),
        lastName: z.string().min(1).max(120).optional(),
        email: optionalNullableString,
        phone: optionalNullableString,
        addressLine1: optionalNullableString,
        addressLine2: optionalNullableString,
        postalCode: optionalNullableString,
        city: optionalNullableString,
        country: z.string().optional(),
        status: z.enum(["active", "pending", "inactive"]).optional(),
        schoolYear: z.string().regex(/^\d{4}-\d{4}$/).optional(),
        membershipFeeCents: z.number().int().min(0).optional(),
        feePaidAt: localDateTime.nullable().optional(),
        joinedAt: localDateTime.optional(),
        notes: optionalNullableString,
        userId: optionalNullableUuid,
      }),
      annotations: writeTool,
    },
    async ({ id, ...updates }) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      const member = await updateAssociationMember(
        id,
        updates,
        mcpAuditActor(principal),
      );
      return toolResult({ member }, "Adhérent mis à jour.");
    },
  );

  server.registerTool(
    "archive_adherent",
    {
      title: "Archiver un adhérent",
      description:
        "Passe un adhérent au statut inactif sans supprimer son historique.",
      inputSchema: z.object({
        id: z.string().uuid(),
        confirm: z.literal(true).describe("Doit être vrai après confirmation."),
      }),
      annotations: destructiveTool,
    },
    async ({ id }) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      const member = await archiveAssociationMember(
        id,
        mcpAuditActor(principal),
      );
      return toolResult({ member, archived: true }, "Adhérent archivé.");
    },
  );

  server.registerTool(
    "get_accounting_summary",
    {
      title: "Synthèse comptable",
      description:
        "Calcule recettes, dépenses, solde, brouillons et justificatifs manquants. Restreindre à un événement donne son bilan.",
      inputSchema: z.object({
        eventId: z
          .string()
          .uuid()
          .optional()
          .describe("Limiter la synthèse aux écritures de cet événement."),
      }),
      annotations: readOnlyTool,
    },
    async ({ eventId }) => {
      requireMcpAccess(principal, "mcp:read", "admin");
      return toolResult({ summary: await getAccountingSummary({ eventId }) });
    },
  );

  server.registerTool(
    "list_accounting_entries",
    {
      title: "Lister les écritures comptables",
      description:
        "Liste le journal de trésorerie, avec comptes et catégories.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(500).default(100),
        type: z.enum(["income", "expense"]).optional(),
        status: z.enum(["draft", "posted"]).optional(),
        eventId: z
          .string()
          .uuid()
          .optional()
          .describe("Ne garder que les écritures rattachées à cet événement."),
      }),
      annotations: readOnlyTool,
    },
    async ({ limit, type, status, eventId }) => {
      requireMcpAccess(principal, "mcp:read", "admin");
      let items = await listAccountingEntries(limit, { eventId });
      if (type) items = items.filter((item) => item.type === type);
      if (status) items = items.filter((item) => item.status === status);
      return toolResult({ items, count: items.length });
    },
  );

  server.registerTool(
    "create_accounting_entry",
    {
      title: "Créer une écriture comptable",
      description:
        "Enregistre une recette ou une dépense en centimes. Ne réalise aucun paiement.",
      inputSchema: z.object({
        type: z.enum(["income", "expense"]),
        status: z.enum(["draft", "posted"]).default("draft"),
        accountId: optionalNullableUuid,
        categoryId: optionalNullableUuid,
        eventId: optionalNullableUuid,
        label: z.string().min(1).max(300),
        amountCents: z.number().int().positive(),
        occurredAt: localDateTime,
        counterparty: optionalNullableString,
        paymentMethod: optionalNullableString,
        reference: optionalNullableString,
        notes: optionalNullableString,
        attachmentUrl: z.string().url().nullable().optional(),
      }),
      annotations: writeTool,
    },
    async (args) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      const entry = await createAccountingEntry(
        args,
        mcpAuditActor(principal),
      );
      return toolResult({ entry }, "Écriture comptable créée.");
    },
  );

  server.registerTool(
    "update_accounting_entry",
    {
      title: "Modifier une écriture au brouillon",
      description:
        "Modifie une écriture comptable non validée. Une écriture validée est immuable.",
      inputSchema: z.object({
        id: z.string().uuid(),
        version: z.number().int().min(0).optional(),
        type: z.enum(["income", "expense"]).optional(),
        status: z.enum(["draft", "posted"]).optional(),
        accountId: optionalNullableUuid,
        categoryId: optionalNullableUuid,
        eventId: optionalNullableUuid,
        label: z.string().min(1).max(300).optional(),
        amountCents: z.number().int().positive().optional(),
        occurredAt: localDateTime.optional(),
        counterparty: optionalNullableString,
        paymentMethod: optionalNullableString,
        reference: optionalNullableString,
        notes: optionalNullableString,
        attachmentUrl: z.string().url().nullable().optional(),
      }),
      annotations: writeTool,
    },
    async ({ id, ...updates }) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      const entry = await updateAccountingEntry(
        id,
        updates,
        mcpAuditActor(principal),
      );
      return toolResult({ entry }, "Écriture comptable mise à jour.");
    },
  );

  server.registerTool(
    "delete_draft_accounting_entry",
    {
      title: "Supprimer une écriture au brouillon",
      description:
        "Supprime uniquement une écriture au brouillon. Les écritures validées sont protégées.",
      inputSchema: z.object({
        id: z.string().uuid(),
        confirm: z.literal(true),
      }),
      annotations: destructiveTool,
    },
    async ({ id }) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      await deleteDraftAccountingEntry(id, mcpAuditActor(principal));
      return toolResult({ id, deleted: true });
    },
  );

  server.registerTool(
    "list_financial_accounts",
    {
      title: "Lister les comptes financiers",
      description: "Liste les comptes bancaires et caisses de l’association.",
      inputSchema: z.object({ includeInactive: z.boolean().default(false) }),
      annotations: readOnlyTool,
    },
    async ({ includeInactive }) => {
      requireMcpAccess(principal, "mcp:read", "admin");
      let items = await listFinancialAccounts();
      if (!includeInactive) items = items.filter((item) => item.isActive);
      return toolResult({ items });
    },
  );

  server.registerTool(
    "create_financial_account",
    {
      title: "Créer un compte financier",
      description: "Ajoute un compte bancaire ou une caisse au journal.",
      inputSchema: z.object({
        name: z.string().min(1).max(160),
        type: z.enum(["bank", "cash"]),
        description: optionalNullableString,
        isActive: z.boolean().default(true),
      }),
      annotations: writeTool,
    },
    async (input) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      const account = await createFinancialAccount(
        input,
        mcpAuditActor(principal),
      );
      return toolResult({ account }, "Compte financier créé.");
    },
  );

  server.registerTool(
    "update_financial_account",
    {
      title: "Modifier ou archiver un compte financier",
      description:
        "Modifie un compte bancaire ou une caisse. Utilisez isActive=false pour l’archiver et true pour le réactiver sans perdre son historique.",
      inputSchema: z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(160).optional(),
        type: z.enum(["bank", "cash"]).optional(),
        description: optionalNullableString,
        isActive: z.boolean().optional(),
      }),
      annotations: writeTool,
    },
    async ({ id, ...updates }) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      const account = await updateFinancialAccount(
        id,
        updates,
        mcpAuditActor(principal),
      );
      return toolResult({ account }, "Compte financier mis à jour.");
    },
  );

  server.registerTool(
    "list_accounting_categories",
    {
      title: "Lister les catégories comptables",
      description: "Liste les catégories de recettes et de dépenses.",
      inputSchema: z.object({
        type: z.enum(["income", "expense"]).optional(),
        includeInactive: z.boolean().default(false),
      }),
      annotations: readOnlyTool,
    },
    async ({ type, includeInactive }) => {
      requireMcpAccess(principal, "mcp:read", "admin");
      let items = await db
        .select()
        .from(accountingCategories)
        .orderBy(asc(accountingCategories.name));
      if (type) items = items.filter((item) => item.type === type);
      if (!includeInactive) items = items.filter((item) => item.isActive);
      return toolResult({ items });
    },
  );

  server.registerTool(
    "create_accounting_category",
    {
      title: "Créer une catégorie comptable",
      description: "Ajoute une catégorie de recette ou de dépense.",
      inputSchema: z.object({
        name: z.string().min(1).max(160),
        type: z.enum(["income", "expense"]),
        description: optionalNullableString,
        isActive: z.boolean().default(true),
      }),
      annotations: writeTool,
    },
    async (input) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      const data = accountingCategorySchema.parse(input);
      const [category] = await db
        .insert(accountingCategories)
        .values({
          name: data.name,
          type: data.type,
          description: emptyToNull(data.description),
          isActive: data.isActive,
        })
        .returning();
      await recordAudit(
        mcpAuditActor(principal),
        "accounting.category_create",
        "accounting_category",
        category.id,
      );
      return toolResult({ category }, "Catégorie comptable créée.");
    },
  );

  server.registerTool(
    "update_accounting_category",
    {
      title: "Modifier une catégorie comptable",
      description:
        "Renomme une catégorie, change son sens ou la désactive. Une catégorie désactivée reste attachée aux écritures passées mais n’est plus proposée.",
      inputSchema: z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(160).optional(),
        type: z.enum(["income", "expense"]).optional(),
        description: optionalNullableString,
        isActive: z.boolean().optional(),
      }),
      annotations: writeTool,
    },
    async ({ id, ...input }) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      const [current] = await db
        .select()
        .from(accountingCategories)
        .where(eq(accountingCategories.id, id))
        .limit(1);
      if (!current) throw new Error("Catégorie comptable introuvable.");

      const updates: Partial<typeof accountingCategories.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.name !== undefined) updates.name = input.name;
      if (input.type !== undefined) updates.type = input.type;
      if (input.description !== undefined) {
        updates.description = emptyToNull(input.description);
      }
      if (input.isActive !== undefined) updates.isActive = input.isActive;

      const [category] = await db
        .update(accountingCategories)
        .set(updates)
        .where(eq(accountingCategories.id, id))
        .returning();
      await recordAudit(
        mcpAuditActor(principal),
        "accounting.category_update",
        "accounting_category",
        id,
      );
      return toolResult({ category }, "Catégorie comptable mise à jour.");
    },
  );

  server.registerTool(
    "delete_accounting_category",
    {
      title: "Supprimer une catégorie comptable",
      description:
        "Supprime définitivement une catégorie. Refusée si des écritures y sont rattachées : désactivez-la alors avec update_accounting_category pour préserver l’historique.",
      inputSchema: z.object({
        id: z.string().uuid(),
        confirm: z.literal(true),
      }),
      annotations: destructiveTool,
    },
    async ({ id }) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(accountingEntries)
        .where(eq(accountingEntries.categoryId, id));
      if (Number(count) > 0) {
        throw new Error(
          `Cette catégorie est utilisée par ${count} écriture(s). Désactivez-la au lieu de la supprimer.`,
        );
      }
      const [deleted] = await db
        .delete(accountingCategories)
        .where(eq(accountingCategories.id, id))
        .returning({ id: accountingCategories.id });
      if (!deleted) throw new Error("Catégorie comptable introuvable.");
      await recordAudit(
        mcpAuditActor(principal),
        "accounting.category_delete",
        "accounting_category",
        id,
      );
      return toolResult({ id, deleted: true });
    },
  );

  server.registerTool(
    "list_association_documents",
    {
      title: "Lister les documents",
      description:
        "Liste les procès-verbaux d’AG, attestations et documents de l’association.",
      inputSchema: z.object({
        type: z.enum(ASSOCIATION_DOCUMENT_TYPES).optional(),
        status: z.enum(["draft", "final", "archived"]).optional(),
        limit: z.number().int().min(1).max(500).default(100),
      }),
      annotations: readOnlyTool,
    },
    async ({ type, status, limit }) => {
      requireMcpAccess(principal, "mcp:read", "manager");
      let items = await listAssociationDocuments(limit);
      if (type) items = items.filter((item) => item.type === type);
      if (status) items = items.filter((item) => item.status === status);
      return toolResult({ items, count: items.length });
    },
  );

  server.registerTool(
    "get_association_document",
    {
      title: "Lire un document",
      description: "Retourne le contenu complet d’un PV ou d’une attestation.",
      inputSchema: z.object({ id: z.string().uuid() }),
      annotations: readOnlyTool,
    },
    async ({ id }) => {
      requireMcpAccess(principal, "mcp:read", "manager");
      const document = await getAssociationDocument(id);
      if (!document) throw new Error("Document introuvable.");
      return toolResult({ document });
    },
  );

  server.registerTool(
    "create_association_document",
    {
      title: "Créer un document",
      description:
        "Crée un PV d’AG, une attestation ou un document interne imprimable.",
      inputSchema: z.object({
        type: z.enum(ASSOCIATION_DOCUMENT_TYPES),
        status: z.enum(["draft", "final", "archived"]).default("draft"),
        title: z.string().min(1).max(300),
        documentDate: localDateTime,
        content: z.string().max(200_000).default(""),
        memberId: optionalNullableUuid,
        fileUrl: z.string().url().nullable().optional(),
      }),
      annotations: writeTool,
    },
    async (args) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const document = await createAssociationDocument(
        args,
        mcpAuditActor(principal),
      );
      return toolResult({ document }, "Document créé.");
    },
  );

  server.registerTool(
    "update_association_document",
    {
      title: "Modifier un document",
      description: "Met à jour le contenu ou le statut d’un document.",
      inputSchema: z.object({
        id: z.string().uuid(),
        version: z.number().int().min(0).optional(),
        type: z.enum(ASSOCIATION_DOCUMENT_TYPES).optional(),
        status: z.enum(["draft", "final", "archived"]).optional(),
        title: z.string().min(1).max(300).optional(),
        documentDate: localDateTime.optional(),
        content: z.string().max(200_000).optional(),
        memberId: optionalNullableUuid,
        fileUrl: z.string().url().nullable().optional(),
      }),
      annotations: writeTool,
    },
    async ({ id, ...updates }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const document = await updateAssociationDocument(
        id,
        updates,
        mcpAuditActor(principal),
      );
      return toolResult({ document }, "Document mis à jour.");
    },
  );

  server.registerTool(
    "archive_association_document",
    {
      title: "Archiver un document",
      description: "Archive un document sans supprimer son historique.",
      inputSchema: z.object({
        id: z.string().uuid(),
        confirm: z.literal(true),
      }),
      annotations: destructiveTool,
    },
    async ({ id }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const document = await archiveAssociationDocument(
        id,
        mcpAuditActor(principal),
      );
      return toolResult({ document, archived: true });
    },
  );

  server.registerTool(
    "delete_archived_ag_minutes",
    {
      title: "Supprimer un PV archivé",
      description:
        "Supprime définitivement un procès-verbal déjà archivé et sa pièce jointe stockée.",
      inputSchema: z.object({
        id: z.string().uuid(),
        confirm: z.literal(true),
      }),
      annotations: destructiveTool,
    },
    async ({ id }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const document = await deleteArchivedAgMinutes(
        id,
        mcpAuditActor(principal),
      );
      return toolResult(
        { id: document.id, deleted: true },
        "Procès-verbal supprimé définitivement.",
      );
    },
  );

  server.registerTool(
    "get_application_settings",
    {
      title: "Lire les réglages de l’association",
      description:
        "Retourne l’identité, les fenêtres de rappel et l’état non sensible de Telegram.",
      inputSchema: z.object({}),
      annotations: readOnlyTool,
    },
    async () => {
      requireMcpAccess(principal, "mcp:read", "admin");
      return toolResult({ settings: await getAssociationSettings() });
    },
  );

  server.registerTool(
    "update_application_settings",
    {
      title: "Modifier les réglages de l’association",
      description:
        "Met à jour l’identité, les fenêtres de rappel et l’activation de Telegram. Le token Telegram reste exclusivement configurable dans l’interface administrateur.",
      inputSchema: z.object({
        associationName: z.string().min(2).max(160).optional(),
        schoolName: z.string().min(2).max(200).optional(),
        contactEmail: z.string().email().nullable().optional(),
        logoUrl: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Chemin d'un logo déjà importé depuis Configuration, ou null pour revenir au logo par défaut.",
          ),
        rna: z
          .string()
          .regex(/^W\d{9}$/i, "Numéro RNA invalide")
          .optional(),
        taskReminderWindowDays: z.number().int().min(0).max(30).optional(),
        volunteerReminderWindowDays: z
          .number()
          .int()
          .min(0)
          .max(30)
          .optional(),
        telegramEnabled: z.boolean().optional(),
      }),
      annotations: writeTool,
    },
    async (args) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      const current = await getAssociationSettings();
      const settings = await saveAssociationSettings(
        {
          associationName:
            args.associationName ?? current.associationName,
          schoolName: args.schoolName ?? current.schoolName,
          contactEmail:
            args.contactEmail === undefined
              ? current.contactEmail
              : args.contactEmail,
          rna: args.rna ?? current.rna,
          taskReminderWindowDays:
            args.taskReminderWindowDays ??
            current.taskReminderWindowDays,
          volunteerReminderWindowDays:
            args.volunteerReminderWindowDays ??
            current.volunteerReminderWindowDays,
          telegramEnabled:
            args.telegramEnabled ?? current.telegramEnabled,
        },
        mcpAuditActor(principal),
      );
      return toolResult({ settings }, "Réglages de l’association enregistrés.");
    },
  );

  server.registerTool(
    "get_outbound_mail_status",
    {
      title: "État de la messagerie",
      description:
        "Retourne la configuration non sensible de la messagerie sortante. Ne révèle jamais les secrets.",
      inputSchema: z.object({}),
      annotations: readOnlyTool,
    },
    async () => {
      requireMcpAccess(principal, "mcp:read", "admin");
      return toolResult({ settings: await getOutboundMailStatus() });
    },
  );

  server.registerTool(
    "update_outbound_mail_settings",
    {
      title: "Configurer la messagerie",
      description:
        "Configure les paramètres non sensibles de Resend ou SMTP. Les secrets doivent être saisis exclusivement dans l’interface administrateur.",
      inputSchema: z.object({
        provider: z.enum(["resend", "smtp"]).optional(),
        enabled: z.boolean(),
        fromName: optionalNullableString,
        fromEmail: z.string().email().nullable().optional(),
        replyTo: z.string().email().nullable().optional(),
        domain: optionalNullableString,
        smtpHost: optionalNullableString,
        smtpPort: z.number().int().min(1).max(65_535).nullable().optional(),
        smtpSecure: z.boolean().optional(),
        smtpUsername: optionalNullableString,
      }),
      annotations: writeTool,
    },
    async (args) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      const current = await getOutboundMailStatus();
      const settings = await saveOutboundMailSettings(
        {
          provider: args.provider ?? current.provider,
          enabled: args.enabled,
          fromName:
            args.fromName === undefined ? current.fromName : args.fromName,
          fromEmail:
            args.fromEmail === undefined ? current.fromEmail : args.fromEmail,
          replyTo:
            args.replyTo === undefined ? current.replyTo : args.replyTo,
          domain: args.domain === undefined ? current.domain : args.domain,
          smtpHost:
            args.smtpHost === undefined ? current.smtpHost : args.smtpHost,
          smtpPort:
            args.smtpPort === undefined ? current.smtpPort : args.smtpPort,
          smtpSecure:
            args.smtpSecure === undefined
              ? current.smtpSecure
              : args.smtpSecure,
          smtpUsername:
            args.smtpUsername === undefined
              ? current.smtpUsername
              : args.smtpUsername,
        },
        mcpAuditActor(principal),
      );
      return toolResult({ settings }, "Configuration e-mail enregistrée.");
    },
  );

  server.registerTool(
    "send_test_email",
    {
      title: "Envoyer un e-mail de test",
      description:
        "Envoie un vrai message de test via le fournisseur configuré à l’adresse indiquée.",
      inputSchema: z.object({
        to: z.string().email(),
        confirm: z.literal(true),
      }),
      annotations: {
        ...destructiveTool,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ to }) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      const actor = mcpAuditActor(principal);
      const associationName = association.associationName;
      const sent = await sendEmail({
        to,
        subject: `Test de messagerie — ${associationName}`,
        html: `<h2>La messagerie fonctionne.</h2><p>Test envoyé depuis le serveur MCP sécurisé de ${escapeHtml(associationName)}.</p>`,
        text: `La messagerie de ${associationName} fonctionne.`,
        allowDisabled: true,
      });
      await markOutboundMailTest(actor, sent);
      if (!sent) throw new Error("L’envoi du message de test a échoué.");
      return toolResult({ sent: true, to }, "E-mail de test envoyé.");
    },
  );

  server.registerTool(
    "broadcast_to_adherents",
    {
      title: "Écrire aux adhérents",
      description:
        "Envoie un e-mail à tous les adhérents actifs disposant d’une adresse.",
      inputSchema: z.object({
        subject: z.string().min(2).max(160),
        message: z.string().min(2).max(10_000),
        schoolYear: z.string().regex(/^\d{4}-\d{4}$/).optional(),
        confirm: z.literal(true),
      }),
      annotations: {
        ...destructiveTool,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ subject, message, schoolYear }) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      let members = await db
        .select({
          id: associationMembers.id,
          email: associationMembers.email,
          schoolYear: associationMembers.schoolYear,
        })
        .from(associationMembers)
        .where(eq(associationMembers.status, "active"))
        .orderBy(desc(associationMembers.createdAt));
      if (schoolYear)
        members = members.filter((item) => item.schoolYear === schoolYear);
      const recipients = uniqueRecipients(
        members.map((member) => member.email),
      );
      if (recipients.length === 0) {
        throw new Error("Aucun adhérent actif avec une adresse e-mail.");
      }
      const mail = associationBroadcastEmail(
        { subject, message, senderName: principal.name },
        association.associationName,
      );
      const sent = await sendBulkEmail(recipients, mail);
      await recordAudit(
        mcpAuditActor(principal),
        "mail.broadcast_adherents",
        "association_member",
        null,
        { requested: recipients.length, sent, schoolYear: schoolYear ?? null },
      );
      return toolResult({
        requested: recipients.length,
        sent,
        failed: recipients.length - sent,
      });
    },
  );

  server.registerTool(
    "list_audit_logs",
    {
      title: "Consulter le journal d’audit",
      description:
        "Liste les actions enregistrées : qui a fait quoi, quand, depuis le site ou depuis un connecteur. Utile pour contrôler l’activité avant une assemblée générale ou après un incident.",
      inputSchema: z.object({
        action: z
          .string()
          .max(80)
          .optional()
          .describe(
            "Filtre par préfixe d’action, par exemple « accounting » ou « mail.broadcast ».",
          ),
        entityType: z.string().max(80).optional(),
        entityId: z.string().max(80).optional(),
        source: z.enum(["web", "mcp", "system"]).optional(),
        since: z
          .string()
          .datetime()
          .optional()
          .describe("Ne garder que les entrées postérieures à cette date ISO."),
        limit: z.number().int().min(1).max(500).default(100),
      }),
      annotations: readOnlyTool,
    },
    async ({ action, entityType, entityId, source, since, limit }) => {
      requireMcpAccess(principal, "mcp:read", "admin");
      const filters = [
        entityType ? eq(auditLogs.entityType, entityType) : undefined,
        entityId ? eq(auditLogs.entityId, entityId) : undefined,
        source ? eq(auditLogs.source, source) : undefined,
        since ? gte(auditLogs.createdAt, new Date(since)) : undefined,
        action ? like(auditLogs.action, `${action}%`) : undefined,
      ].filter(Boolean);
      const items = await db.query.auditLogs.findMany({
        where: filters.length ? and(...filters) : undefined,
        orderBy: [desc(auditLogs.createdAt)],
        limit,
        with: {
          actor: { columns: { id: true, name: true, email: true } },
        },
      });
      return toolResult({ items, count: items.length });
    },
  );

  server.registerTool(
    "get_update_status",
    {
      title: "État des mises à jour",
      description:
        "Retourne la version installée de l’application, sa révision, sa date de construction, la cadence de la mise à jour automatique et si une version plus récente est publiée.",
      inputSchema: z.object({
        refresh: z
          .boolean()
          .default(false)
          .describe(
            "Forcer un contrôle immédiat au lieu du résultat mis en cache.",
          ),
      }),
      annotations: readOnlyTool,
    },
    async ({ refresh }) => {
      requireMcpAccess(principal, "mcp:read", "admin");
      const status = await getUpdateStatus({ force: refresh });
      return toolResult({ status });
    },
  );
}
