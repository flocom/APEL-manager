import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { HttpError } from "@/lib/auth/guards";
import { getBaseUrl } from "@/lib/base-url";
import {
  computeDueAt,
  formatDateTime,
  parseLocalDateTime,
} from "@/lib/dates";
import { db } from "@/lib/db";
import {
  checklistTemplates,
  events,
  taskAssignees,
  tasks,
  users,
  volunteerSignups,
  volunteerSlots,
} from "@/lib/db/schema";
import { getEventWithDetails } from "@/lib/data";
import { sendEmail } from "@/lib/notifications/email";
import {
  broadcastEmail,
  volunteerConfirmationEmail,
} from "@/lib/notifications/emails";
import { normalizeTemplateTasks } from "@/lib/templates";
import { resolveLeadTime } from "@/lib/task-lead-time";
import { generateShareToken, generateToken } from "@/lib/tokens";
import { emptyToNull } from "@/lib/utils";
import {
  eventSchema,
  slotSchema,
  taskSchema,
  taskUpdateSchema,
  templateSchema,
} from "@/lib/validation";
import { recordAudit } from "@/lib/services/audit";

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
const localDateTime = z
  .string()
  .min(16)
  .describe("Date et heure locale de Paris, format YYYY-MM-DDTHH:mm");

async function requireEvent(id: string) {
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, id))
    .limit(1);
  if (!event) throw new Error("Événement introuvable.");
  return event;
}

export function registerCoreTools(
  server: McpServer,
  principal: McpPrincipal,
  association: McpAssociationProfile,
) {
  server.registerTool(
    "get_association_overview",
    {
      title: "Vue d’ensemble de l’APEL",
      description:
        "Retourne l’identité de l’association et les principaux compteurs opérationnels.",
      inputSchema: z.object({}),
      annotations: readOnlyTool,
    },
    async () => {
      requireMcpAccess(principal, "mcp:read");
      const [[eventCount], [taskCount], [userCount], [signupCount]] =
        await Promise.all([
          db.select({ count: sql<number>`count(*)::int` }).from(events),
          db.select({ count: sql<number>`count(*)::int` }).from(tasks),
          db.select({ count: sql<number>`count(*)::int` }).from(users),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(volunteerSignups),
        ]);
      return toolResult({
        association: {
          name: association.associationName,
          school: association.schoolName,
          contactEmail: association.contactEmail,
          rna: association.rna,
        },
        counts: {
          events: Number(eventCount?.count ?? 0),
          tasks: Number(taskCount?.count ?? 0),
          users: Number(userCount?.count ?? 0),
          volunteerSignups: Number(signupCount?.count ?? 0),
        },
        connectedAs: {
          name: principal.name,
          email: principal.email,
          role: principal.role,
        },
      });
    },
  );

  server.registerTool(
    "list_events",
    {
      title: "Lister les événements",
      description:
        "Liste les événements avec leurs compteurs de tâches et créneaux bénévoles.",
      inputSchema: z.object({
        status: z.enum(["draft", "published", "archived"]).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
      annotations: readOnlyTool,
    },
    async ({ status, limit }) => {
      requireMcpAccess(principal, "mcp:read");
      const items = await db.query.events.findMany({
        where: status ? eq(events.status, status) : undefined,
        orderBy: [desc(events.startAt)],
        limit,
        with: {
          tasks: { columns: { id: true, status: true, dueAt: true } },
          volunteerSlots: { columns: { id: true, capacity: true } },
        },
      });
      return toolResult({ items, count: items.length });
    },
  );

  server.registerTool(
    "get_event",
    {
      title: "Lire un événement",
      description:
        "Retourne un événement avec sa checklist, ses assignés, ses créneaux et inscriptions.",
      inputSchema: z.object({ id: z.string().uuid() }),
      annotations: readOnlyTool,
    },
    async ({ id }) => {
      requireMcpAccess(principal, "mcp:read", "manager");
      const event = await getEventWithDetails(id);
      if (!event) throw new Error("Événement introuvable.");
      return toolResult({ event });
    },
  );

  server.registerTool(
    "create_event",
    {
      title: "Créer un événement",
      description:
        "Crée un événement APEL avec un lien public d’inscription bénévole.",
      inputSchema: z.object({
        title: z.string().min(2).max(200),
        description: optionalNullableString,
        location: optionalNullableString,
        startAt: localDateTime,
        endAt: localDateTime.nullable().optional(),
        status: z.enum(["draft", "published", "archived"]).default("draft"),
      }),
      annotations: writeTool,
    },
    async (input) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const data = eventSchema.parse(input);
      const [event] = await db
        .insert(events)
        .values({
          title: data.title,
          description: emptyToNull(data.description),
          location: emptyToNull(data.location),
          startAt: data.startAt,
          endAt: data.endAt ?? null,
          status: data.status,
          shareToken: generateShareToken(),
          createdBy: principal.userId,
        })
        .returning();
      await recordAudit(
        mcpAuditActor(principal),
        "event.create",
        "event",
        event.id,
        { status: event.status },
      );
      return toolResult({ event }, "Événement créé.");
    },
  );

  server.registerTool(
    "update_event",
    {
      title: "Modifier un événement",
      description:
        "Met à jour un événement et recalcule les échéances si sa date change.",
      inputSchema: z.object({
        id: z.string().uuid(),
        version: z.number().int().min(0).optional(),
        title: z.string().min(2).max(200).optional(),
        description: optionalNullableString,
        location: optionalNullableString,
        startAt: localDateTime.optional(),
        endAt: localDateTime.nullable().optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
      }),
      annotations: writeTool,
    },
    async ({ id, ...input }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const data = eventSchema.partial().parse(input);
      const current = await requireEvent(id);
      const updates: Partial<typeof events.$inferInsert> = {};
      if (data.title !== undefined) updates.title = data.title;
      if (data.description !== undefined)
        updates.description = emptyToNull(data.description);
      if (data.location !== undefined)
        updates.location = emptyToNull(data.location);
      if (data.startAt !== undefined) updates.startAt = data.startAt;
      if (data.endAt !== undefined) updates.endAt = data.endAt ?? null;
      if (data.status !== undefined) updates.status = data.status;

      const expectedVersion = data.version ?? current.version;
      const [event] = await db
        .update(events)
        .set({ ...updates, version: expectedVersion + 1 })
        .where(and(eq(events.id, id), eq(events.version, expectedVersion)))
        .returning();
      if (!event) throw new Error("Conflit de modification de l’événement.");
      if (data.startAt !== undefined) {
        await db.execute(sql`
          update tasks
          set due_at = ${data.startAt}::timestamptz - (lead_time_days * interval '24 hours')
          where event_id = ${id}
        `);
      }
      await recordAudit(
        mcpAuditActor(principal),
        "event.update",
        "event",
        id,
        { changedFields: Object.keys(data).filter((key) => key !== "version") },
      );
      return toolResult({ event }, "Événement mis à jour.");
    },
  );

  server.registerTool(
    "delete_event",
    {
      title: "Supprimer un événement",
      description:
        "Supprime définitivement l’événement, ses tâches, créneaux et inscriptions.",
      inputSchema: z.object({
        id: z.string().uuid(),
        confirm: z.literal(true),
      }),
      annotations: destructiveTool,
    },
    async ({ id }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const [deleted] = await db
        .delete(events)
        .where(eq(events.id, id))
        .returning({ id: events.id });
      if (!deleted) throw new Error("Événement introuvable.");
      await recordAudit(
        mcpAuditActor(principal),
        "event.delete",
        "event",
        id,
      );
      return toolResult({ id, deleted: true });
    },
  );

  server.registerTool(
    "create_event_task",
    {
      title: "Créer une tâche d’événement",
      description:
        "Ajoute une tâche et définit à partir de quand la traiter, en jours, semaines ou mois avant l’événement.",
      inputSchema: z.object({
        eventId: z.string().uuid(),
        title: z.string().min(2).max(200),
        description: optionalNullableString,
        leadTimeDays: z.number().int().min(0).max(365).default(7),
        leadTimeValue: z.number().int().min(0).max(365).optional(),
        leadTimeUnit: z.enum(["days", "weeks", "months"]).optional(),
        assigneeIds: z.array(z.string().uuid()).max(100).default([]),
      }),
      annotations: writeTool,
    },
    async ({ eventId, ...input }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const event = await requireEvent(eventId);
      const data = taskSchema.parse(input);
      const duration = resolveLeadTime(data);
      if (duration.leadTimeDays > 365) {
        throw new Error("La durée ne peut pas dépasser un an.");
      }
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(eq(tasks.eventId, eventId));
      const [task] = await db
        .insert(tasks)
        .values({
          eventId,
          title: data.title,
          description: emptyToNull(data.description),
          ...duration,
          dueAt: computeDueAt(event.startAt, duration.leadTimeDays),
          position: Number(count),
        })
        .returning();
      if (data.assigneeIds?.length) {
        await db
          .insert(taskAssignees)
          .values(
            data.assigneeIds.map((userId) => ({ taskId: task.id, userId })),
          )
          .onConflictDoNothing();
      }
      await recordAudit(
        mcpAuditActor(principal),
        "task.create",
        "task",
        task.id,
        { eventId },
      );
      return toolResult({ task }, "Tâche créée.");
    },
  );

  server.registerTool(
    "update_task",
    {
      title: "Modifier une tâche",
      description:
        "Modifie une tâche, son avancement, sa durée de préparation ou ses assignés.",
      inputSchema: z.object({
        id: z.string().uuid(),
        version: z.number().int().min(0).optional(),
        title: z.string().min(2).max(200).optional(),
        description: optionalNullableString,
        leadTimeDays: z.number().int().min(0).max(365).optional(),
        leadTimeValue: z.number().int().min(0).max(365).optional(),
        leadTimeUnit: z.enum(["days", "weeks", "months"]).optional(),
        status: z.enum(["todo", "in_progress", "done"]).optional(),
        assigneeIds: z.array(z.string().uuid()).max(100).optional(),
      }),
      annotations: writeTool,
    },
    async ({ id, ...input }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const data = taskUpdateSchema.parse(input);
      const [current] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, id))
        .limit(1);
      if (!current) throw new Error("Tâche introuvable.");
      const updates: Partial<typeof tasks.$inferInsert> = {};
      if (data.title !== undefined) updates.title = data.title;
      if (data.description !== undefined)
        updates.description = emptyToNull(data.description);
      if (data.status !== undefined) {
        updates.status = data.status;
        updates.completedAt = data.status === "done" ? new Date() : null;
      }
      if (
        data.leadTimeDays !== undefined ||
        data.leadTimeValue !== undefined ||
        data.leadTimeUnit !== undefined
      ) {
        const event = await requireEvent(current.eventId);
        const duration = resolveLeadTime(data, {
          leadTimeDays: current.leadTimeDays,
          leadTimeValue: current.leadTimeValue,
          leadTimeUnit: current.leadTimeUnit,
        });
        if (duration.leadTimeDays > 365) {
          throw new Error("La durée ne peut pas dépasser un an.");
        }
        updates.leadTimeDays = duration.leadTimeDays;
        updates.leadTimeValue = duration.leadTimeValue;
        updates.leadTimeUnit = duration.leadTimeUnit;
        updates.dueAt = computeDueAt(event.startAt, duration.leadTimeDays);
      }
      const expectedVersion = data.version ?? current.version;
      const [task] = await db
        .update(tasks)
        .set({ ...updates, version: expectedVersion + 1 })
        .where(and(eq(tasks.id, id), eq(tasks.version, expectedVersion)))
        .returning();
      if (!task) throw new Error("Conflit de modification de la tâche.");
      if (data.assigneeIds !== undefined) {
        await db.delete(taskAssignees).where(eq(taskAssignees.taskId, id));
        if (data.assigneeIds.length) {
          await db
            .insert(taskAssignees)
            .values(
              data.assigneeIds.map((userId) => ({ taskId: id, userId })),
            )
            .onConflictDoNothing();
        }
      }
      await recordAudit(
        mcpAuditActor(principal),
        "task.update",
        "task",
        id,
      );
      return toolResult({ task }, "Tâche mise à jour.");
    },
  );

  server.registerTool(
    "delete_task",
    {
      title: "Supprimer une tâche",
      description: "Supprime définitivement une tâche de checklist.",
      inputSchema: z.object({
        id: z.string().uuid(),
        confirm: z.literal(true),
      }),
      annotations: destructiveTool,
    },
    async ({ id }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const [deleted] = await db
        .delete(tasks)
        .where(eq(tasks.id, id))
        .returning({ id: tasks.id });
      if (!deleted) throw new Error("Tâche introuvable.");
      await recordAudit(
        mcpAuditActor(principal),
        "task.delete",
        "task",
        id,
      );
      return toolResult({ id, deleted: true });
    },
  );

  server.registerTool(
    "create_volunteer_slot",
    {
      title: "Créer un créneau bénévole",
      description:
        "Ajoute un besoin bénévole à un événement avec sa capacité.",
      inputSchema: z.object({
        eventId: z.string().uuid(),
        title: z.string().min(2).max(200),
        description: optionalNullableString,
        capacity: z.number().int().min(1).max(1000).default(1),
        startAt: localDateTime.nullable().optional(),
        endAt: localDateTime.nullable().optional(),
      }),
      annotations: writeTool,
    },
    async ({ eventId, ...input }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      await requireEvent(eventId);
      const data = slotSchema.parse(input);
      const [slot] = await db
        .insert(volunteerSlots)
        .values({
          eventId,
          title: data.title,
          description: emptyToNull(data.description),
          capacity: data.capacity,
          startAt: data.startAt ?? null,
          endAt: data.endAt ?? null,
        })
        .returning();
      await recordAudit(
        mcpAuditActor(principal),
        "volunteer_slot.create",
        "volunteer_slot",
        slot.id,
        { eventId },
      );
      return toolResult({ slot }, "Créneau bénévole créé.");
    },
  );

  server.registerTool(
    "update_volunteer_slot",
    {
      title: "Modifier un créneau bénévole",
      description: "Modifie un besoin bénévole existant.",
      inputSchema: z.object({
        id: z.string().uuid(),
        title: z.string().min(2).max(200).optional(),
        description: optionalNullableString,
        capacity: z.number().int().min(1).max(1000).optional(),
        startAt: localDateTime.nullable().optional(),
        endAt: localDateTime.nullable().optional(),
      }),
      annotations: writeTool,
    },
    async ({ id, ...input }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const data = slotSchema.partial().parse(input);
      const updates: Partial<typeof volunteerSlots.$inferInsert> = {};
      if (data.title !== undefined) updates.title = data.title;
      if (data.description !== undefined)
        updates.description = emptyToNull(data.description);
      if (data.capacity !== undefined) updates.capacity = data.capacity;
      if (data.startAt !== undefined) updates.startAt = data.startAt ?? null;
      if (data.endAt !== undefined) updates.endAt = data.endAt ?? null;
      const [slot] = await db
        .update(volunteerSlots)
        .set(updates)
        .where(eq(volunteerSlots.id, id))
        .returning();
      if (!slot) throw new Error("Créneau bénévole introuvable.");
      await recordAudit(
        mcpAuditActor(principal),
        "volunteer_slot.update",
        "volunteer_slot",
        id,
      );
      return toolResult({ slot }, "Créneau bénévole mis à jour.");
    },
  );

  server.registerTool(
    "delete_volunteer_slot",
    {
      title: "Supprimer un créneau bénévole",
      description:
        "Supprime le créneau et toutes les inscriptions qui lui sont liées.",
      inputSchema: z.object({
        id: z.string().uuid(),
        confirm: z.literal(true),
      }),
      annotations: destructiveTool,
    },
    async ({ id }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const [deleted] = await db
        .delete(volunteerSlots)
        .where(eq(volunteerSlots.id, id))
        .returning({ id: volunteerSlots.id });
      if (!deleted) throw new Error("Créneau bénévole introuvable.");
      await recordAudit(
        mcpAuditActor(principal),
        "volunteer_slot.delete",
        "volunteer_slot",
        id,
      );
      return toolResult({ id, deleted: true });
    },
  );

  server.registerTool(
    "list_event_signups",
    {
      title: "Lister les inscriptions bénévoles",
      description:
        "Liste les bénévoles inscrits à tous les créneaux d’un événement.",
      inputSchema: z.object({ eventId: z.string().uuid() }),
      annotations: readOnlyTool,
    },
    async ({ eventId }) => {
      requireMcpAccess(principal, "mcp:read", "manager");
      const slots = await db.query.volunteerSlots.findMany({
        where: eq(volunteerSlots.eventId, eventId),
        orderBy: [asc(volunteerSlots.createdAt)],
        with: { signups: true },
      });
      return toolResult({ eventId, slots });
    },
  );

  server.registerTool(
    "delete_volunteer_signup",
    {
      title: "Supprimer une inscription bénévole",
      description: "Annule définitivement une inscription bénévole.",
      inputSchema: z.object({
        id: z.string().uuid(),
        confirm: z.literal(true),
      }),
      annotations: destructiveTool,
    },
    async ({ id }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const [deleted] = await db
        .delete(volunteerSignups)
        .where(eq(volunteerSignups.id, id))
        .returning({ id: volunteerSignups.id });
      if (!deleted) throw new Error("Inscription bénévole introuvable.");
      await recordAudit(
        mcpAuditActor(principal),
        "volunteer_signup.delete",
        "volunteer_signup",
        id,
      );
      return toolResult({ id, deleted: true });
    },
  );

  server.registerTool(
    "list_checklist_templates",
    {
      title: "Lister les modèles de checklist",
      description: "Liste les modèles réutilisables et leurs tâches.",
      inputSchema: z.object({}),
      annotations: readOnlyTool,
    },
    async () => {
      requireMcpAccess(principal, "mcp:read", "manager");
      const items = await db
        .select()
        .from(checklistTemplates)
        .orderBy(asc(checklistTemplates.name));
      return toolResult({ items });
    },
  );

  const templateInput = z.object({
    name: z.string().min(2).max(120),
    description: optionalNullableString,
    tasks: z
      .array(
        z.object({
          title: z.string().min(1).max(200),
          leadTimeDays: z.number().int().min(0).max(365).default(7),
          leadTimeValue: z.number().int().min(0).max(365).optional(),
          leadTimeUnit: z.enum(["days", "weeks", "months"]).optional(),
          description: z.string().max(2000).optional(),
        }),
      )
      .min(1)
      .max(100),
  });

  server.registerTool(
    "create_checklist_template",
    {
      title: "Créer un modèle de checklist",
      description: "Crée un modèle réutilisable pour les événements.",
      inputSchema: templateInput,
      annotations: writeTool,
    },
    async (input) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const data = templateSchema.parse(input);
      const [template] = await db
        .insert(checklistTemplates)
        .values({
          name: data.name,
          description: emptyToNull(data.description),
          tasks: normalizeTemplateTasks(data.tasks),
        })
        .returning();
      await recordAudit(
        mcpAuditActor(principal),
        "template.create",
        "checklist_template",
        template.id,
      );
      return toolResult({ template }, "Modèle créé.");
    },
  );

  server.registerTool(
    "update_checklist_template",
    {
      title: "Modifier un modèle de checklist",
      description: "Remplace les informations et tâches d’un modèle.",
      inputSchema: templateInput.extend({
        id: z.string().uuid(),
        version: z.number().int().min(0).optional(),
      }),
      annotations: writeTool,
    },
    async ({ id, ...input }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const data = templateSchema.parse(input);
      const [current] = await db
        .select()
        .from(checklistTemplates)
        .where(eq(checklistTemplates.id, id))
        .limit(1);
      if (!current) throw new Error("Modèle introuvable.");
      const expectedVersion = data.version ?? current.version;
      const [template] = await db
        .update(checklistTemplates)
        .set({
          name: data.name,
          description: emptyToNull(data.description),
          tasks: normalizeTemplateTasks(data.tasks),
          version: expectedVersion + 1,
        })
        .where(
          and(
            eq(checklistTemplates.id, id),
            eq(checklistTemplates.version, expectedVersion),
          ),
        )
        .returning();
      if (!template) throw new Error("Conflit de modification du modèle.");
      await recordAudit(
        mcpAuditActor(principal),
        "template.update",
        "checklist_template",
        id,
      );
      return toolResult({ template }, "Modèle mis à jour.");
    },
  );

  server.registerTool(
    "delete_checklist_template",
    {
      title: "Supprimer un modèle de checklist",
      description: "Supprime définitivement un modèle réutilisable.",
      inputSchema: z.object({
        id: z.string().uuid(),
        confirm: z.literal(true),
      }),
      annotations: destructiveTool,
    },
    async ({ id }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const [deleted] = await db
        .delete(checklistTemplates)
        .where(eq(checklistTemplates.id, id))
        .returning({ id: checklistTemplates.id });
      if (!deleted) throw new Error("Modèle introuvable.");
      await recordAudit(
        mcpAuditActor(principal),
        "template.delete",
        "checklist_template",
        id,
      );
      return toolResult({ id, deleted: true });
    },
  );

  server.registerTool(
    "apply_checklist_template",
    {
      title: "Appliquer un modèle à un événement",
      description:
        "Crée les tâches d’un modèle sur un événement dont la checklist est vide.",
      inputSchema: z.object({
        eventId: z.string().uuid(),
        templateId: z.string().uuid(),
      }),
      annotations: writeTool,
    },
    async ({ eventId, templateId }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const [event, template, [{ count }]] = await Promise.all([
        requireEvent(eventId),
        db
          .select()
          .from(checklistTemplates)
          .where(eq(checklistTemplates.id, templateId))
          .limit(1)
          .then((rows) => rows[0]),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(tasks)
          .where(eq(tasks.eventId, eventId)),
      ]);
      if (!template) throw new Error("Modèle introuvable.");
      if (Number(count) > 0)
        throw new Error("L’événement contient déjà des tâches.");
      if (!template.tasks.length) throw new Error("Le modèle est vide.");
      const rows = template.tasks.map((task, position) => {
        const duration = resolveLeadTime(task);
        return {
          eventId,
          title: task.title,
          description: task.description ?? null,
          ...duration,
          dueAt: computeDueAt(event.startAt, duration.leadTimeDays),
          position,
        };
      });
      await db.insert(tasks).values(rows);
      await recordAudit(
        mcpAuditActor(principal),
        "template.apply",
        "event",
        eventId,
        { templateId, created: rows.length },
      );
      return toolResult({ eventId, templateId, created: rows.length });
    },
  );

  server.registerTool(
    "list_users",
    {
      title: "Lister les utilisateurs",
      description:
        "Liste les comptes applicatifs et leurs rôles, sans aucune donnée secrète.",
      inputSchema: z.object({}),
      annotations: readOnlyTool,
    },
    async () => {
      requireMcpAccess(principal, "mcp:read", "admin");
      const items = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          telegramChatId: users.telegramChatId,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(asc(users.name));
      return toolResult({ items });
    },
  );

  server.registerTool(
    "update_user_role",
    {
      title: "Modifier le rôle d’un utilisateur",
      description:
        "Change le niveau d’accès d’un compte : membre, organisateur ou administrateur.",
      inputSchema: z.object({
        id: z.string().uuid(),
        role: z.enum(["member", "manager", "admin"]),
      }),
      annotations: writeTool,
    },
    async ({ id, role }) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      if (id === principal.userId && role !== "admin") {
        throw new Error(
          "Vous ne pouvez pas retirer votre propre rôle administrateur.",
        );
      }
      const [user] = await db
        .update(users)
        .set({ role })
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
        });
      if (!user) throw new Error("Utilisateur introuvable.");
      await recordAudit(
        mcpAuditActor(principal),
        "user.role_update",
        "user",
        id,
        { role },
      );
      return toolResult({ user }, "Rôle mis à jour.");
    },
  );

  server.registerTool(
    "delete_user",
    {
      title: "Supprimer un utilisateur",
      description:
        "Supprime définitivement un compte applicatif. Ne supprime pas l’adhérent associé.",
      inputSchema: z.object({
        id: z.string().uuid(),
        confirm: z.literal(true),
      }),
      annotations: destructiveTool,
    },
    async ({ id }) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      if (id === principal.userId) {
        throw new Error("Vous ne pouvez pas supprimer votre propre compte.");
      }
      const [deleted] = await db
        .delete(users)
        .where(eq(users.id, id))
        .returning({ id: users.id });
      if (!deleted) throw new Error("Utilisateur introuvable.");
      await recordAudit(
        mcpAuditActor(principal),
        "user.delete",
        "user",
        id,
      );
      return toolResult({ id, deleted: true });
    },
  );

  server.registerTool(
    "list_tasks",
    {
      title: "Lister les tâches",
      description:
        "Liste les tâches de tous les événements, filtrables par statut, échéance, événement ou responsable. Complète get_event, qui ne montre qu’un événement.",
      inputSchema: z.object({
        status: z.enum(["todo", "in_progress", "done"]).optional(),
        eventId: z.string().uuid().optional(),
        assigneeId: z
          .string()
          .uuid()
          .optional()
          .describe("Ne garder que les tâches confiées à ce compte."),
        dueBefore: localDateTime
          .optional()
          .describe("Ne garder que les tâches à traiter avant cette date."),
        limit: z.number().int().min(1).max(200).default(50),
      }),
      annotations: readOnlyTool,
    },
    async ({ status, eventId, assigneeId, dueBefore, limit }) => {
      requireMcpAccess(principal, "mcp:read", "manager");
      const filters = [
        status ? eq(tasks.status, status) : undefined,
        eventId ? eq(tasks.eventId, eventId) : undefined,
      ].filter(Boolean);
      let items = await db.query.tasks.findMany({
        where: filters.length ? and(...filters) : undefined,
        orderBy: [asc(tasks.dueAt), asc(tasks.position)],
        limit: assigneeId || dueBefore ? 500 : limit,
        with: {
          event: { columns: { id: true, title: true, startAt: true } },
          assignees: {
            with: {
              user: { columns: { id: true, name: true, email: true } },
            },
          },
        },
      });
      if (assigneeId) {
        items = items.filter((task) =>
          task.assignees.some((entry) => entry.userId === assigneeId),
        );
      }
      if (dueBefore) {
        // Comme partout ailleurs, la chaîne est lue en heure de Paris.
        const limitDate = parseLocalDateTime(dueBefore);
        items = items.filter(
          (task) => task.dueAt !== null && task.dueAt <= limitDate,
        );
      }
      items = items.slice(0, limit);
      return toolResult({ items, count: items.length });
    },
  );

  server.registerTool(
    "reorder_event_tasks",
    {
      title: "Réorganiser une check-list",
      description:
        "Réordonne les tâches d’un événement. La liste doit contenir chaque tâche de l’événement exactement une fois.",
      inputSchema: z.object({
        eventId: z.string().uuid(),
        orderedTaskIds: z.array(z.string().uuid()).min(1).max(500),
      }),
      annotations: writeTool,
    },
    async ({ eventId, orderedTaskIds }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      // Contrôle et écriture dans la même transaction : une tâche ajoutée
      // entre-temps fait échouer la réorganisation au lieu de rester orpheline.
      await db.transaction(async (tx) => {
        const existing = await tx
          .select({ id: tasks.id })
          .from(tasks)
          .where(eq(tasks.eventId, eventId));
        const expected = new Set(existing.map((task) => task.id));
        const requested = new Set(orderedTaskIds);
        if (
          requested.size !== orderedTaskIds.length ||
          requested.size !== expected.size ||
          orderedTaskIds.some((id) => !expected.has(id))
        ) {
          throw new Error(
            "L’ordre doit contenir chaque tâche de l’événement une seule fois.",
          );
        }
        for (const [position, taskId] of orderedTaskIds.entries()) {
          await tx
            .update(tasks)
            .set({ position })
            .where(and(eq(tasks.id, taskId), eq(tasks.eventId, eventId)));
        }
        await tx
          .update(events)
          .set({ version: sql`${events.version} + 1` })
          .where(eq(events.id, eventId));
      });
      await recordAudit(
        mcpAuditActor(principal),
        "task.reorder",
        "event",
        eventId,
        { count: orderedTaskIds.length },
      );
      return toolResult(
        { eventId, ordered: orderedTaskIds.length },
        "Check-list réorganisée.",
      );
    },
  );

  server.registerTool(
    "create_volunteer_signup",
    {
      title: "Inscrire un bénévole",
      description:
        "Inscrit manuellement un bénévole sur un créneau, par exemple après une réponse reçue de vive voix. Refuse un créneau complet ou un doublon d’e-mail, et envoie la confirmation si une adresse est fournie.",
      inputSchema: z.object({
        slotId: z.string().uuid(),
        name: z.string().min(2).max(120),
        email: z.string().email().nullable().optional(),
        phone: z.string().max(40).nullable().optional(),
        notify: z
          .boolean()
          .default(true)
          .describe("Envoyer l’e-mail de confirmation au bénévole."),
      }),
      annotations: writeTool,
    },
    async ({ slotId, name, email, phone, notify }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const slot = await db.query.volunteerSlots.findFirst({
        where: eq(volunteerSlots.id, slotId),
        with: { event: true },
      });
      if (!slot) throw new Error("Créneau introuvable.");
      if (!email && !phone) {
        throw new Error("Indiquez au moins un e-mail ou un téléphone.");
      }

      const normalizedEmail = emptyToNull(email ?? null)?.toLowerCase() ?? null;
      // Même longueur que l'inscription publique : ce jeton protège le lien de
      // désinscription envoyé au bénévole.
      const cancelToken = generateToken(18);

      // Insertion conditionnée à la capacité restante, comme l'inscription
      // publique : deux appels simultanés ne peuvent pas dépasser la capacité.
      let inserted;
      try {
        inserted = await db.execute(sql`
          INSERT INTO volunteer_signups (slot_id, name, email, phone, cancel_token)
          SELECT
            ${slot.id}::uuid,
            ${name},
            ${normalizedEmail},
            ${emptyToNull(phone ?? null)},
            ${cancelToken}
          WHERE (
            SELECT count(*) FROM volunteer_signups WHERE slot_id = ${slot.id}::uuid
          ) < ${slot.capacity}
          RETURNING id
        `);
      } catch (error) {
        if ((error as { code?: string })?.code === "23505") {
          throw new Error("Ce bénévole est déjà inscrit à ce créneau.");
        }
        throw error;
      }
      if (inserted.length === 0) {
        throw new Error("Ce créneau est complet.");
      }
      const signupId = (inserted[0] as { id: string }).id;

      let notified = false;
      if (notify && normalizedEmail) {
        const baseUrl = await getBaseUrl();
        const mail = volunteerConfirmationEmail({
          name,
          eventTitle: slot.event.title,
          eventDate: formatDateTime(slot.event.startAt),
          slotTitle: slot.title,
          location: slot.event.location,
          cancelUrl: `${baseUrl}/annulation/${cancelToken}`,
          identity: {
            associationName: association.associationName,
            schoolName: association.schoolName,
            rna: association.rna,
          },
        });
        notified = Boolean(await sendEmail({ to: normalizedEmail, ...mail }));
      }

      await recordAudit(
        mcpAuditActor(principal),
        "volunteer_signup.create",
        "volunteer_signup",
        signupId,
        { slotId, notified },
      );
      return toolResult(
        { id: signupId, slotId, notified },
        "Bénévole inscrit.",
      );
    },
  );

  server.registerTool(
    "send_event_message",
    {
      title: "Écrire aux bénévoles d’un événement",
      description:
        "Envoie un e-mail à tous les bénévoles inscrits aux créneaux d’un événement.",
      inputSchema: z.object({
        eventId: z.string().uuid(),
        subject: z.string().min(2).max(160),
        message: z.string().min(2).max(10_000),
        confirm: z.literal(true),
      }),
      annotations: {
        ...destructiveTool,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ eventId, subject, message }) => {
      requireMcpAccess(principal, "mcp:write", "manager");
      const event = await getEventWithDetails(eventId);
      if (!event) throw new Error("Événement introuvable.");

      const recipients = [
        ...new Set(
          event.volunteerSlots
            .flatMap((slot) => slot.signups)
            .map((signup) => signup.email?.toLowerCase())
            .filter((email): email is string => Boolean(email)),
        ),
      ].slice(0, 500);
      if (recipients.length === 0) {
        throw new Error("Aucun bénévole inscrit avec une adresse e-mail.");
      }

      const mail = broadcastEmail({
        subject,
        message,
        senderName: principal.name,
        identity: {
          associationName: association.associationName,
          schoolName: association.schoolName,
          rna: association.rna,
        },
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
        "mail.broadcast_event",
        "event",
        eventId,
        { requested: recipients.length, sent },
      );
      return toolResult(
        { eventId, requested: recipients.length, sent },
        `Message envoyé à ${sent} bénévole(s).`,
      );
    },
  );

  server.registerTool(
    "broadcast_to_members",
    {
      title: "Écrire aux membres de l’équipe",
      description:
        "Envoie un e-mail à tous les comptes applicatifs. Distinct de broadcast_to_adherents, qui vise les adhérents de l’association.",
      inputSchema: z.object({
        subject: z.string().min(2).max(160),
        message: z.string().min(2).max(10_000),
        role: z
          .enum(["member", "manager", "admin"])
          .optional()
          .describe("Ne viser que les comptes ayant ce rôle."),
        confirm: z.literal(true),
      }),
      annotations: {
        ...destructiveTool,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ subject, message, role }) => {
      requireMcpAccess(principal, "mcp:write", "admin");
      const rows = await db
        .select({ email: users.email })
        .from(users)
        .where(role ? eq(users.role, role) : undefined);
      const recipients = [
        ...new Set(
          rows
            .map((row) => row.email?.toLowerCase())
            .filter((email): email is string => Boolean(email)),
        ),
      ].slice(0, 500);
      if (recipients.length === 0) {
        throw new Error("Aucun membre à contacter.");
      }

      const mail = broadcastEmail({
        subject,
        message,
        senderName: principal.name,
        identity: {
          associationName: association.associationName,
          schoolName: association.schoolName,
          rna: association.rna,
        },
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
        "mail.broadcast_members",
        "user",
        null,
        { requested: recipients.length, sent, role: role ?? null },
      );
      return toolResult(
        { requested: recipients.length, sent },
        `Message envoyé à ${sent} membre(s).`,
      );
    },
  );
}
