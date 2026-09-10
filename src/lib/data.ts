import { and, asc, desc, eq, gte, ne } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import { db } from "@/lib/db";
import {
  checklistTemplates,
  events,
  meetingAttendance,
  taskAssignees,
  tasks,
  users,
  volunteerSignups,
  volunteerSlots,
} from "@/lib/db/schema";

/**
 * Événements publiés à venir — pour la page d'accueil publique.
 *
 * Le filtre `kind = 'event'` est le premier des deux verrous qui tiennent les
 * réunions hors du site public ; le second est dans getEventByShareToken.
 * Ne jamais le retirer « pour simplifier » : une réunion de bureau publiée
 * afficherait son ordre du jour et l'adresse d'un domicile sur Internet.
 */
export async function getUpcomingPublishedEvents() {
  return db.query.events.findMany({
    where: and(
      eq(events.kind, "event"),
      eq(events.status, "published"),
      gte(events.startAt, new Date()),
    ),
    orderBy: [asc(events.startAt)],
    with: {
      volunteerSlots: { with: { signups: true } },
    },
  });
}

/**
 * Tous les événements — pour le dashboard (toutes statuts confondus).
 * On ne récupère que les colonnes des relations réellement utilisées (compteurs
 * de tâches/créneaux + statut/échéance pour les « en retard »).
 */
export async function getAllEvents() {
  return db.query.events.findMany({
    orderBy: [desc(events.startAt)],
    with: {
      tasks: { columns: { status: true, dueAt: true } },
      volunteerSlots: { columns: { id: true } },
    },
  });
}

/** Un événement seul (sans relations) — pour l'édition. */
export const getEventById = cache(async (id: string) => {
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, id))
    .limit(1);
  return event ?? null;
});

/**
 * Un événement avec ses tâches (et leurs assigné·es) + créneaux bénévoles.
 * `cache()` déduplique l'appel au sein d'une même requête (page + helpers).
 */
export const getEventWithDetails = cache(async (id: string) => {
  return db.query.events.findFirst({
    where: eq(events.id, id),
    with: {
      tasks: {
        // L'échéance d'abord : une check-list de préparation se lit dans
        // l'ordre où le travail doit être fait. La position ne départage plus
        // que les tâches dues le même jour, celles qu'on range à la main.
        orderBy: [asc(tasks.dueAt), asc(tasks.position), asc(tasks.id)],
        with: { assignees: { columns: { userId: true } } },
      },
      volunteerSlots: {
        // Heure de début d'abord : un tableau de créneaux se lit dans l'ordre
        // de la journée. PostgreSQL range les valeurs nulles en dernier, donc
        // les créneaux sans horaire ferment la liste, dans leur ordre de
        // création.
        orderBy: [asc(volunteerSlots.startAt), asc(volunteerSlots.createdAt)],
        with: {
          signups: {
            columns: {
              id: true,
              name: true,
              email: true,
              phone: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
});

/**
 * Un événement via son jeton public — pour l'inscription des bénévoles.
 * `cache()` évite le double appel (generateMetadata + corps de la page).
 *
 * Second verrou : une réunion possède un jeton de partage comme tout
 * événement, mais ce jeton ne doit ouvrir aucune page. Le filtre est porté par
 * la requête et non par la page, pour qu'un futur appelant hérite de la
 * protection sans avoir à y penser.
 */
export const getEventByShareToken = cache(async (token: string) => {
  return db.query.events.findFirst({
    where: and(eq(events.kind, "event"), eq(events.shareToken, token)),
    with: {
      volunteerSlots: {
        // Heure de début d'abord : un tableau de créneaux se lit dans l'ordre
        // de la journée. PostgreSQL range les valeurs nulles en dernier, donc
        // les créneaux sans horaire ferment la liste, dans leur ordre de
        // création.
        orderBy: [asc(volunteerSlots.startAt), asc(volunteerSlots.createdAt)],
        with: { signups: true },
      },
    },
  });
});

/**
 * Réunions à venir, avec les réponses de présence.
 *
 * Réservé aux écrans authentifiés : la liste des présents est une donnée de
 * membres. Aucune page publique n'appelle cette fonction.
 */
export async function getUpcomingMeetings() {
  return db.query.events.findMany({
    where: and(
      eq(events.kind, "meeting"),
      gte(events.startAt, new Date()),
      ne(events.status, "archived"),
    ),
    orderBy: [asc(events.startAt)],
    with: {
      attendance: {
        with: { user: { columns: { id: true, name: true } } },
      },
    },
  });
}

/** Réponses de présence d'une réunion, avec le nom de chaque membre. */
export async function getMeetingAttendance(eventId: string) {
  return db.query.meetingAttendance.findMany({
    where: eq(meetingAttendance.eventId, eventId),
    with: { user: { columns: { id: true, name: true } } },
  });
}

/** Tâches assignées à un membre, avec leur événement. */
export async function getTasksForUser(userId: string) {
  const rows = await db.query.taskAssignees.findMany({
    where: eq(taskAssignees.userId, userId),
    with: { task: { with: { event: true } } },
  });
  return rows
    .map((r) => r.task)
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

/** Une inscription bénévole via son jeton d'annulation (lien public). */
export async function getSignupByCancelToken(token: string) {
  return db.query.volunteerSignups.findFirst({
    where: eq(volunteerSignups.cancelToken, token),
    with: { slot: { with: { event: true } } },
  });
}

/** Inscriptions bénévoles d'un membre, avec le créneau et l'événement. */
export async function getSignupsForUser(userId: string) {
  return db.query.volunteerSignups.findMany({
    where: eq(volunteerSignups.userId, userId),
    orderBy: [desc(volunteerSignups.createdAt)],
    with: { slot: { with: { event: true } } },
  });
}

/**
 * Modèles de check-list (éditables). Mis en cache (données quasi statiques) ;
 * invalidé par revalidateTag("templates") à chaque écriture sur les modèles.
 */
export const getChecklistTemplates = unstable_cache(
  async () =>
    db.select().from(checklistTemplates).orderBy(asc(checklistTemplates.name)),
  ["checklist-templates"],
  { tags: ["templates"] },
);

/**
 * Options légères {id, name} des membres pour les sélecteurs (assignation de
 * tâches…). Mis en cache et invalidé par revalidateTag("members"). Ne contient
 * aucune Date (sûr pour la sérialisation JSON du cache de données).
 */
export const getMemberOptions = unstable_cache(
  async () =>
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .orderBy(asc(users.name)),
  ["member-options"],
  { tags: ["members"] },
);

/** Liste complète des membres (sans le hash) — page d'administration. */
export async function getAllMembers() {
  return db
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
}

export type UserTask = Awaited<ReturnType<typeof getTasksForUser>>[number];
