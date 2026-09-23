import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { HttpError } from "@/lib/auth/guards";
import { computeDueAt } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  accountingEntries,
  checklistTemplates,
  events,
  tasks,
  volunteerSignups,
  volunteerSlots,
} from "@/lib/db/schema";
import { normalizeTemplateTasks } from "@/lib/templates";
import { generateShareToken } from "@/lib/tokens";
import { emptyToNull } from "@/lib/utils";

import { recordAudit, type AuditActor } from "./audit";

/**
 * Refuse d'emblée un identifiant d'événement mal formé.
 *
 * Passé tel quel à Postgres, « abc » fait échouer la requête sur une erreur de
 * syntaxe (`22P02`), que les routes rendent en « erreur serveur » (500) : un
 * lien tronqué ou un script maladroit passait pour une panne, et remplissait
 * les journaux du serveur. Appelée en tête de chaque route `/api/events/[id]`,
 * elle répond ce qui est vrai : cet événement n'existe pas.
 */
export function evenementValide(eventId: string): void {
  if (!z.string().uuid().safeParse(eventId).success) {
    throw new HttpError(404, "Événement introuvable.");
  }
}

/**
 * Enregistre la check-list d'un événement comme modèle réutilisable.
 *
 * Deux usages, une seule opération : créer un modèle à partir d'un événement
 * qu'on vient de mettre au point, ou remplacer un modèle existant quand la
 * préparation a révélé ce qui lui manquait. Le contenu est remplacé, jamais
 * fusionné — l'état de la check-list fait foi.
 */
export async function saveEventAsTemplate(
  {
    eventId,
    templateId,
    name,
    expectedVersion,
  }: {
    eventId: string;
    /** Modèle à remplacer ; absent, un nouveau modèle est créé. */
    templateId?: string | null;
    /** Nom du nouveau modèle ; par défaut le titre de l'événement. */
    name?: string | null;
    expectedVersion?: number;
  },
  actor: AuditActor,
) {
  const [[event], eventTasks] = await Promise.all([
    db
      .select({
        id: events.id,
        title: events.title,
        description: events.description,
      })
      .from(events)
      .where(eq(events.id, eventId))
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
      .orderBy(asc(tasks.dueAt), asc(tasks.position)),
  ]);

  if (!event) throw new HttpError(404, "Événement introuvable.");
  if (eventTasks.length === 0) {
    throw new HttpError(
      400,
      "La check-list de cet événement est vide : il n'y a rien à enregistrer.",
    );
  }
  if (eventTasks.length > 100) {
    throw new HttpError(400, "Un modèle ne peut pas dépasser 100 tâches.");
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

  // Création : le modèle hérite du titre et de la description de l'événement,
  // les deux seuls champs qu'un modèle porte en plus de ses tâches.
  if (!templateId) {
    const templateName = (emptyToNull(name ?? null) ?? event.title).slice(
      0,
      120,
    );
    const [created] = await db
      .insert(checklistTemplates)
      .values({
        name: templateName,
        description: event.description,
        tasks: nextTasks,
      })
      .returning();

    await recordAudit(
      actor,
      "template.create_from_event",
      "checklist_template",
      created.id,
      { eventId, eventTitle: event.title, taskCount: nextTasks.length },
    );
    return {
      template: created,
      taskCount: nextTasks.length,
      previousCount: 0,
      created: true,
    };
  }

  const [template] = await db
    .select()
    .from(checklistTemplates)
    .where(eq(checklistTemplates.id, templateId))
    .limit(1);
  if (!template) throw new HttpError(404, "Modèle de check-list introuvable.");

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

  return {
    template: updated,
    taskCount: nextTasks.length,
    previousCount,
    created: false,
  };
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
      tasks: { orderBy: [asc(tasks.dueAt), asc(tasks.position)] },
      volunteerSlots: {
        orderBy: [asc(volunteerSlots.startAt), asc(volunteerSlots.createdAt)],
      },
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
        kind: source.kind,
        title: emptyToNull(title ?? null) ?? source.title,
        description: source.description,
        publicDescription: source.publicDescription,
        // Le lien de paiement n'est PAS recopié : il est propre à une édition,
        // et une copie qui pointe vers la vente de l'an dernier encaisserait
        // pour le mauvais événement. Son usage non plus : choisi pour ce
        // lien-là, il s'appliquerait en silence au prochain.
        ticketingUrl: null,
        ticketingKind: null,
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

/**
 * Supprime un événement, et avec lui ses tâches, ses créneaux et les
 * inscriptions de bénévoles qui en dépendent.
 *
 * Refusée tant qu'une écriture comptable VALIDÉE s'y rattache. La clé
 * étrangère détache l'écriture (`on delete set null`) sans la supprimer, mais
 * c'était déjà la modifier : une écriture validée est immuable, et le bilan de
 * la kermesse perdait ses lignes sans qu'aucune correction n'apparaisse. Un
 * événement qui a eu une vie comptable s'annule ou s'archive ; il ne
 * disparaît pas. Les brouillons, eux, restent modifiables : ils sont détachés,
 * et le journal en garde le compte.
 *
 * Le verrou sur la ligne de l'événement est pris AVANT le comptage : une
 * écriture qu'on valide au même moment prend un verrou partagé sur ce même
 * événement (voir `updateAccountingEntry`), et une écriture qu'on crée en
 * prend un par sa clé étrangère. L'une attend l'autre ; le comptage voit donc
 * tout ce qui a été validé avant la suppression.
 */
export async function deleteEvent(eventId: string, actor: AuditActor) {
  evenementValide(eventId);
  return db.transaction(async (tx) => {
    const [evenement] = await tx
      .select({ id: events.id, title: events.title, status: events.status })
      .from(events)
      .where(eq(events.id, eventId))
      .for("update");
    if (!evenement) throw new HttpError(404, "Événement introuvable.");

    const [ecritures] = await tx
      .select({
        validees: sql<number>`count(*) filter (where ${accountingEntries.status} = 'posted')::int`,
        brouillons: sql<number>`count(*) filter (where ${accountingEntries.status} = 'draft')::int`,
      })
      .from(accountingEntries)
      .where(eq(accountingEntries.eventId, eventId));
    const validees = Number(ecritures?.validees ?? 0);
    if (validees > 0) {
      throw new HttpError(
        409,
        `Cet événement porte ${validees} écriture${validees > 1 ? "s" : ""} comptable${validees > 1 ? "s" : ""} validée${validees > 1 ? "s" : ""} : le supprimer ${validees > 1 ? "les" : "la"} détacherait de son bilan. Annulez-le ou archivez-le plutôt.`,
      );
    }

    // Comptées avant la suppression : après, la cascade les a emportées et le
    // journal ne saurait plus dire ce qu'on a détruit.
    const [{ inscriptions }] = await tx
      .select({ inscriptions: sql<number>`count(*)::int` })
      .from(volunteerSignups)
      .innerJoin(volunteerSlots, eq(volunteerSignups.slotId, volunteerSlots.id))
      .where(eq(volunteerSlots.eventId, eventId));

    await tx.delete(events).where(eq(events.id, eventId));

    await recordAudit(
      actor,
      "event.delete",
      "event",
      eventId,
      {
        title: evenement.title,
        status: evenement.status,
        inscriptions: Number(inscriptions),
        brouillonsDetaches: Number(ecritures?.brouillons ?? 0),
      },
      tx,
    );
    return evenement;
  });
}
