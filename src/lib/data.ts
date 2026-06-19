import { and, asc, desc, eq, gte, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  events,
  taskAssignees,
  tasks,
  users,
  volunteerSlots,
} from "@/lib/db/schema";

/** Événements publiés à venir — pour la page d'accueil publique. */
export async function getUpcomingPublishedEvents() {
  return db.query.events.findMany({
    where: and(eq(events.status, "published"), gte(events.startAt, new Date())),
    orderBy: [asc(events.startAt)],
    with: {
      volunteerSlots: { with: { signups: true } },
    },
  });
}

/** Tous les événements — pour le dashboard (toutes statuts confondus). */
export async function getAllEvents() {
  return db.query.events.findMany({
    orderBy: [desc(events.startAt)],
    with: {
      tasks: true,
      volunteerSlots: true,
    },
  });
}

/** Un événement seul (sans relations) — pour l'édition. */
export async function getEventById(id: string) {
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, id))
    .limit(1);
  return event ?? null;
}

/** Un événement avec ses tâches (et leurs membres) + créneaux bénévoles. */
export async function getEventWithDetails(id: string) {
  return db.query.events.findFirst({
    where: eq(events.id, id),
    with: {
      creator: true,
      tasks: {
        orderBy: [asc(tasks.dueAt)],
        with: { assignees: { with: { user: true } } },
      },
      volunteerSlots: {
        orderBy: [asc(volunteerSlots.createdAt)],
        with: { signups: true },
      },
    },
  });
}

/** Un événement via son jeton public — pour l'inscription des bénévoles. */
export async function getEventByShareToken(token: string) {
  return db.query.events.findFirst({
    where: eq(events.shareToken, token),
    with: {
      volunteerSlots: {
        orderBy: [asc(volunteerSlots.createdAt)],
        with: { signups: true },
      },
    },
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

/** Toutes les tâches non terminées (vue organisateur). */
export async function getOpenTasks() {
  return db.query.tasks.findMany({
    where: ne(tasks.status, "done"),
    orderBy: [asc(tasks.dueAt)],
    with: {
      event: true,
      assignees: { with: { user: true } },
    },
  });
}

/** Liste des membres (sans le hash de mot de passe). */
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

export type EventWithDetails = NonNullable<
  Awaited<ReturnType<typeof getEventWithDetails>>
>;
export type EventPublic = NonNullable<
  Awaited<ReturnType<typeof getEventByShareToken>>
>;
export type UserTask = Awaited<ReturnType<typeof getTasksForUser>>[number];
export type MemberRow = Awaited<ReturnType<typeof getAllMembers>>[number];
