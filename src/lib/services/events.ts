import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { HttpError } from "@/lib/auth/guards";
import { computeDueAt } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  checklistTemplates,
  events,
  tasks,
  volunteerSlots,
} from "@/lib/db/schema";
import { normalizeTemplateTasks } from "@/lib/templates";
import { generateShareToken } from "@/lib/tokens";
import { emptyToNull } from "@/lib/utils";

import { recordAudit, type AuditActor } from "./audit";

/**
 * Reverse le contenu d'une check-list dans un modèle existant.
 *
 * Le modèle sert de point de départ, mais c'est en préparant l'événement qu'on
 * découvre ce qui manquait : cette opération renvoie les corrections vers le
 * modèle, pour que l'édition suivante en profite. Le contenu du modèle est
 * remplacé, pas fusionné — l'état de la check-line fait foi.
 */
export async function overwriteTemplateFromEvent(
  {
    eventId,
    templateId,
    expectedVersion,
  }: { eventId: string; templateId: string; expectedVersion?: number },
  actor: AuditActor,
) {
  const [[event], [template], eventTasks] = await Promise.all([
    db
      .select({ id: events.id, title: events.title })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1),
    db
      .select()
      .from(checklistTemplates)
      .where(eq(checklistTemplates.id, templateId))
      .limit(1),
    db
      .select({
        title: tasks.title,
        description: tasks.description,
        leadTimeDays: tasks.leadTimeDays,
        leadTimeValue: tasks.leadTimeValue,
        leadTimeUnit: tasks.leadTimeUnit,
      })
      .from(tasks)
      .where(eq(tasks.eventId, eventId))
      .orderBy(asc(tasks.position), asc(tasks.dueAt)),
  ]);

  if (!event) throw new HttpError(404, "Événement introuvable.");
  if (!template) throw new HttpError(404, "Modèle de check-list introuvable.");
  if (eventTasks.length === 0) {
    throw new HttpError(
      400,
      "La check-list de cet événement est vide : il n'y a rien à enregistrer dans le modèle.",
    );
  }
  if (eventTasks.length > 100) {
    throw new HttpError(
      400,
      "Un modèle ne peut pas dépasser 100 tâches.",
    );
  }

  const nextTasks = normalizeTemplateTasks(
    eventTasks.map((task) => ({
      title: task.title,
      description: task.description ?? undefined,
      leadTimeDays: task.leadTimeDays,
      leadTimeValue: task.leadTimeValue,
      leadTimeUnit: task.leadTimeUnit,
    })),
  );

  const previousCount = template.tasks.length;
  const where =
    expectedVersion === undefined
      ? eq(checklistTemplates.id, templateId)
      : and(
          eq(checklistTemplates.id, templateId),
          eq(checklistTemplates.version, expectedVersion),
        );

  const [updated] = await db
    .update(checklistTemplates)
    .set({
      tasks: nextTasks,
      version:
        expectedVersion === undefined
          ? sql`${checklistTemplates.version} + 1`
          : expectedVersion + 1,
    })
    .where(where)
    .returning();

  if (!updated) {
    throw new HttpError(
      409,
      "Ce modèle a été modifié entre-temps. Rechargez la page avant de recommencer.",
    );
  }

  await recordAudit(
    actor,
    "template.overwrite_from_event",
    "checklist_template",
    templateId,
    {
      eventId,
      eventTitle: event.title,
      previousCount,
      newCount: nextTasks.length,
    },
  );

  return { template: updated, taskCount: nextTasks.length, previousCount };
}

/**
 * Duplique un événement à une nouvelle date.
 *
 * La copie reprend ce qui se rejoue d'une édition à l'autre — la check-list et
 * les créneaux bénévoles — et laisse de côté ce qui appartient à l'édition
 * passée : inscriptions, écritures comptables et pièces jointes. Les échéances
 * et les horaires de créneaux sont replacés par rapport à la nouvelle date, en
 * conservant leur écart d'origine.
 */
export async function duplicateEvent(
  {
    eventId,
    startAt,
    title,
  }: { eventId: string; startAt: Date; title?: string | null },
  actor: AuditActor,
) {
  const source = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    with: {
      tasks: { orderBy: [asc(tasks.position), asc(tasks.dueAt)] },
      volunteerSlots: { orderBy: [asc(volunteerSlots.createdAt)] },
    },
  });
  if (!source) throw new HttpError(404, "Événement introuvable.");

  // Décalage appliqué à tout ce qui était positionné par rapport au début.
  const shiftMs = startAt.getTime() - source.startAt.getTime();
  const shift = (value: Date | null) =>
    value === null ? null : new Date(value.getTime() + shiftMs);

  const created = await db.transaction(async (tx) => {
    const [copy] = await tx
      .insert(events)
      .values({
        title: emptyToNull(title ?? null) ?? source.title,
        description: source.description,
        location: source.location,
        startAt,
        endAt: shift(source.endAt),
        // Une copie repart toujours en brouillon : ses dates et ses créneaux
        // demandent une relecture avant d'ouvrir les inscriptions.
        status: "draft",
        shareToken: generateShareToken(),
        createdBy: actor.userId,
      })
      .returning();

    if (source.tasks.length > 0) {
      await tx.insert(tasks).values(
        source.tasks.map((task, index) => ({
          eventId: copy.id,
          title: task.title,
          description: task.description,
          leadTimeDays: task.leadTimeDays,
          leadTimeValue: task.leadTimeValue,
          leadTimeUnit: task.leadTimeUnit,
          dueAt: computeDueAt(startAt, task.leadTimeDays),
          // L'avancement appartient à l'édition passée.
          status: "todo" as const,
          position: index,
        })),
      );
    }

    if (source.volunteerSlots.length > 0) {
      await tx.insert(volunteerSlots).values(
        source.volunteerSlots.map((slot) => ({
          eventId: copy.id,
          title: slot.title,
          description: slot.description,
          capacity: slot.capacity,
          startAt: shift(slot.startAt),
          endAt: shift(slot.endAt),
        })),
      );
    }

    return copy;
  });

  await recordAudit(actor, "event.duplicate", "event", created.id, {
    sourceEventId: eventId,
    taskCount: source.tasks.length,
    slotCount: source.volunteerSlots.length,
  });

  return {
    event: created,
    taskCount: source.tasks.length,
    slotCount: source.volunteerSlots.length,
  };
}
