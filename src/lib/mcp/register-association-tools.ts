import { asc, desc, eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  accountingCategories,
  associationMembers,
  financialAccounts,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/notifications/email";
import { broadcastEmail } from "@/lib/notifications/emails";
import {
  createAccountingEntry,
  deleteDraftAccountingEntry,
  getAccountingSummary,
  listAccountingEntries,
  updateAccountingEntry,
} from "@/lib/services/accounting";
import {
  archiveAssociationMember,
  createAssociationMember,
  listAssociationMembers,
  updateAssociationMember,
} from "@/lib/services/adherents";
import { recordAudit } from "@/lib/services/audit";
import {
  archiveAssociationDocument,
  createAssociationDocument,
  getAssociationDocument,
  listAssociationDocuments,
  updateAssociationDocument,
} from "@/lib/services/documents";
import {
  getOutboundMailStatus,
  markOutboundMailTest,
  saveOutboundMailSettings,
} from "@/lib/services/mail-settings";
import { emptyToNull } from "@/lib/utils";
import {
  accountingCategorySchema,
  financialAccountSchema,
} from "@/lib/validation";

import {
  destructiveTool,
  mcpAuditActor,
  readOnlyTool,
  requireMcpAccess,
  toolResult,
  writeTool,
  type McpPrincipal,
} from "./types";

const optionalNullableString = z.string().nullable().optional();
const optionalNullableUuid = z.string().uuid().nullable().optional();
const localDateTime = z
  .string()
  .min(16)
  .describe("Date et heure locale de Paris, format YYYY-MM-DDTHH:mm");

export function registerAssociationTools(
  server: McpServer,
  principal: McpPrincipal,
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
        "Ajoute un adhérent à l’APEL Notre Dame des Flots pour une année scolaire.",
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
        "Calcule recettes, dépenses, solde, brouillons et justificatifs manquants.",
      inputSchema: z.object({}),
      annotations: readOnlyTool,
    },
    async () => {
      requireMcpAccess(principal, "mcp:read", "admin");
      return toolResult({ summary: await getAccountingSummary() });
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
      }),
      annotations: readOnlyTool,
    },
    async ({ limit, type, status }) => {
      requireMcpAccess(principal, "mcp:read", "admin");
      let items = await listAccountingEntries(limit);
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
      let items = await db
        .select()
        .from(financialAccounts)
        .orderBy(asc(financialAccounts.name));
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
        mcpAuditActor(principal),
        "accounting.account_create",
        "financial_account",
        account.id,
      );
      return toolResult({ account }, "Compte financier créé.");
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
    "list_association_documents",
    {
      title: "Lister les documents",
      description:
        "Liste les procès-verbaux d’AG, attestations et documents de l’association.",
      inputSchema: z.object({
        type: z.enum(["ag_minutes", "attestation", "other"]).optional(),
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
        type: z.enum(["ag_minutes", "attestation", "other"]),
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
        type: z.enum(["ag_minutes", "attestation", "other"]).optional(),
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
    "get_outbound_mail_status",
    {
      title: "État de la messagerie",
      description:
        "Retourne la configuration non sensible de Resend. Ne révèle jamais la clé API.",
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
        "Configure les paramètres non sensibles de Resend. La clé API doit être saisie exclusivement dans l’interface administrateur.",
      inputSchema: z.object({
        enabled: z.boolean(),
        fromName: optionalNullableString,
        fromEmail: z.string().email().nullable().optional(),
        replyTo: z.string().email().nullable().optional(),
        domain: optionalNullableString,
      }),
      annotations: writeTool,
    },
    async (args) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      const current = await getOutboundMailStatus();
      const settings = await saveOutboundMailSettings(
        {
          provider: "resend",
          enabled: args.enabled,
          fromName:
            args.fromName === undefined ? current.fromName : args.fromName,
          fromEmail:
            args.fromEmail === undefined ? current.fromEmail : args.fromEmail,
          replyTo:
            args.replyTo === undefined ? current.replyTo : args.replyTo,
          domain: args.domain === undefined ? current.domain : args.domain,
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
        "Envoie un vrai message de test via Resend à l’adresse indiquée.",
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
      const sent = await sendEmail({
        to,
        subject: "Test de messagerie — APEL Notre Dame des Flots",
        html: "<h2>La messagerie fonctionne.</h2><p>Test envoyé depuis le serveur MCP sécurisé de l’APEL Notre Dame des Flots.</p>",
        text: "La messagerie de l’APEL Notre Dame des Flots fonctionne.",
      });
      await markOutboundMailTest(actor, sent);
      if (!sent) throw new Error("L’envoi Resend a échoué.");
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
      const recipients = [
        ...new Set(
          members
            .map((member) => member.email?.toLowerCase())
            .filter((email): email is string => Boolean(email)),
        ),
      ].slice(0, 500);
      if (recipients.length === 0) {
        throw new Error("Aucun adhérent actif avec une adresse e-mail.");
      }
      const mail = broadcastEmail({
        subject,
        message,
        senderName: principal.name,
      });
      let sent = 0;
      const batchSize = 5;
      for (let index = 0; index < recipients.length; index += batchSize) {
        const results = await Promise.all(
          recipients
            .slice(index, index + batchSize)
            .map((to) => sendEmail({ to, ...mail })),
        );
        sent += results.filter(Boolean).length;
      }
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
}
