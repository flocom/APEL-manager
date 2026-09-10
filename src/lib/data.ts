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
 * Rendez-vous publiés à venir — pour les pages publiques. Réunions comprises :
 * l'association veut que son agenda complet soit lisible des familles.
 *
 * Ce qui protège une réunion n'est donc plus son type mais son STATUT : tant
 * qu'elle est en brouillon, elle reste interne. Ce que les pages publiques
 * affichent d'un rendez-vous se limite au titre, à la date, au lieu et à la
 * description publique ; les notes internes, la check-list et les présences
 * n'en sortent jamais (voir les composants publics).
 */
export async function getUpcomingPublishedEvents() {
  return db.query.events.findMany({
    where: and(
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
 * Un rendez-vous via son jeton public — page publique d'un événement ou d'une
 * réunion. `cache()` évite le double appel (generateMetadata + corps de page).
 *
 * La page n'affiche que ce qui est publiable ; en particulier elle ne charge
 * pas les présences, qui sont une donnée de membres.
 */
export const getEventByShareToken = cache(async (token: string) => {
  return db.query.events.findFirst({
    where: eq(events.shareToken, token),
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

/**
 * Réponses de présence d'une réunion, membres et parents venus par le lien
 * public mêlés. Le nom affiché vient du compte quand il y en a un, du
 * formulaire sinon — `nomPresent()` fait ce choix en un seul endroit pour que
 * les trois colonnes de la page réunion ne divergent jamais.
 */
export async function getMeetingAttendance(eventId: string) {
  return db.query.meetingAttendance.findMany({
    where: eq(meetingAttendance.eventId, eventId),
    orderBy: [asc(meetingAttendance.createdAt)],
    with: {
      user: {
        columns: { id: true, name: true },
        // Un compte n'a pas de téléphone ; sa fiche d'adhérent, si elle est
        // rattachée, en porte un. C'est le seul numéro d'un membre que
        // l'association détient — le chercher ailleurs serait le deviner.
        with: { associationMember: { columns: { phone: true } } },
      },
    },
  });
}

/** Le nom sous lequel afficher une réponse de présence. */
export function nomPresent(reponse: {
  name: string | null;
  user: { name: string } | null;
}): string {
  return reponse.user?.name ?? reponse.name ?? "Sans nom";
}

/**
 * Le téléphone auquel joindre quelqu'un qui a répondu : celui qu'il a saisi
 * s'il est venu par le lien public, sinon celui de sa fiche d'adhérent.
 * `null` quand l'association n'en connaît pas — la plupart des membres.
 */
export function telephonePresent(reponse: {
  phone: string | null;
  user: { associationMember: { phone: string | null } | null } | null;
}): string | null {
  const numero = reponse.phone ?? reponse.user?.associationMember?.phone ?? null;
  return numero?.trim() || null;
}

/** Une présence annoncée publiquement, via son jeton de retrait. */
export async function getMeetingAttendanceByCancelToken(token: string) {
  return db.query.meetingAttendance.findFirst({
    where: eq(meetingAttendance.cancelToken, token),
    with: { event: true },
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
