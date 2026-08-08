import { timingSafeEqual } from "node:crypto";

import { and, inArray, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { formatDateTime } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  notificationsLog,
  tasks,
  volunteerSignups,
} from "@/lib/db/schema";
import { notifyTaskDue, type NotifyKind } from "@/lib/notifications";
import { sendEmail } from "@/lib/notifications/email";
import { volunteerReminderEmail } from "@/lib/notifications/emails";
import {
  getAssociationSettings,
  getTelegramBotToken,
} from "@/lib/services/association-settings";
import { collectReferencedUploadIds } from "@/lib/services/uploads-references";
import { cleanupOrphanedUploads } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Déclenché par le Cron Vercel (voir vercel.json). Parcourt les tâches non
 * terminées dont l'échéance approche ou est dépassée et notifie les membres
 * assignés. Un journal évite les doublons (un rappel + un retard par tâche/membre).
 */
export async function GET(req: Request) {
  // Fail-closed : sans secret configuré, l'endpoint refuse de s'exécuter.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET n'est pas configuré sur le serveur." },
      { status: 500 },
    );
  }
  const provided = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const [association, telegramBotToken] = await Promise.all([
    getAssociationSettings(),
    getTelegramBotToken(),
  ]);
  const appUrl = (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    ""
  ).replace(/\/$/, "");

  const now = new Date();
  const notificationIdentity = {
    associationName: association.associationName,
    schoolName: association.schoolName,
    rna: association.rna,
  };
  const horizon = new Date(
    now.getTime() +
      association.taskReminderWindowDays * 24 * 60 * 60 * 1000,
  );

  const dueTasks = await db.query.tasks.findMany({
    where: and(ne(tasks.status, "done"), lte(tasks.dueAt, horizon)),
    with: {
      event: true,
      assignees: { with: { user: true } },
    },
  });

  // 1) Construire la liste des notifications candidates (tâche × membre).
  type Candidate = {
    task: (typeof dueTasks)[number];
    user: NonNullable<(typeof dueTasks)[number]["assignees"][number]["user"]>;
    kind: NotifyKind;
  };
  const candidates: Candidate[] = [];
  for (const task of dueTasks) {
    const kind: NotifyKind = task.dueAt < now ? "overdue" : "reminder";
    for (const { user } of task.assignees) {
      if (user) candidates.push({ task, user, kind });
    }
  }

  // 2) Récupérer en UNE requête les notifications déjà envoyées (anti-doublon).
  const taskIds = [...new Set(dueTasks.map((t) => t.id))];
  const existing = taskIds.length
    ? await db
        .select({
          taskId: notificationsLog.taskId,
          userId: notificationsLog.userId,
          kind: notificationsLog.kind,
        })
        .from(notificationsLog)
        .where(inArray(notificationsLog.taskId, taskIds))
    : [];
  const alreadySent = new Set(
    existing.map((e) => `${e.taskId}:${e.userId}:${e.kind}`),
  );

  const todo = candidates.filter(
    (c) => !alreadySent.has(`${c.task.id}:${c.user.id}:${c.kind}`),
  );
  const skipped = candidates.length - todo.length;

  // 3) Envoyer tous les rappels en parallèle.
  const results = await Promise.all(
    todo.map(async (c) => {
      const ok = await notifyTaskDue({
        user: {
          name: c.user.name,
          email: c.user.email,
          telegramChatId: c.user.telegramChatId,
        },
        taskTitle: c.task.title,
        eventTitle: c.task.event.title,
        dueAt: c.task.dueAt,
        kind: c.kind,
        appUrl,
        identity: notificationIdentity,
        telegramBotToken,
      });
      return { c, ok };
    }),
  );

  // 4) Journaliser en un seul insert ceux qui ont réussi (les échecs seront
  //    réessayés au prochain passage).
  const succeeded = results.filter((r) => r.ok).map((r) => r.c);
  if (succeeded.length > 0) {
    await db
      .insert(notificationsLog)
      .values(
        succeeded.map((c) => ({
          taskId: c.task.id,
          userId: c.user.id,
          kind: c.kind,
        })),
      )
      .onConflictDoNothing();
  }

  // --- Rappels aux bénévoles : événement publié dans la fenêtre configurée,
  //     e-mail fourni, pas encore rappelé. -------------------------------------
  const volunteerHorizon = new Date(
    now.getTime() +
      association.volunteerReminderWindowDays * 24 * 60 * 60 * 1000,
  );
  // Sans URL publique configurée, les liens des e-mails seraient cassés : on saute.
  const signups = appUrl
    ? await db.query.volunteerSignups.findMany({
        where: and(
          isNull(volunteerSignups.remindedAt),
          isNotNull(volunteerSignups.email),
        ),
        with: { slot: { with: { event: true } } },
      })
    : [];

  const eligibleSignups = signups.filter((s) => {
    const ev = s.slot.event;
    return (
      ev.status === "published" &&
      ev.startAt > now &&
      ev.startAt <= volunteerHorizon &&
      !!s.email
    );
  });

  // Envois en parallèle puis un seul UPDATE groupé (au lieu de N en série).
  const remindedIds = (
    await Promise.all(
      eligibleSignups.map(async (s) => {
        const ev = s.slot.event;
        const mail = volunteerReminderEmail({
          name: s.name,
          eventTitle: ev.title,
          eventDate: formatDateTime(ev.startAt),
          slotTitle: s.slot.title,
          location: ev.location,
          cancelUrl: s.cancelToken
            ? `${appUrl}/annulation/${s.cancelToken}`
            : appUrl,
          identity: notificationIdentity,
        });
        const ok = await sendEmail({ to: s.email as string, ...mail });
        return ok ? s.id : null;
      }),
    )
  ).filter((id): id is string => id !== null);

  if (remindedIds.length > 0) {
    await db
      .update(volunteerSignups)
      .set({ remindedAt: new Date() })
      .where(inArray(volunteerSignups.id, remindedIds));
  }
  const volunteerReminders = remindedIds.length;

  let orphanedUploadsRemoved = 0;
  try {
    // Une erreur ici abandonne le nettoyage : mieux vaut garder des fichiers
    // inutiles que d'en supprimer un qui servait encore.
    orphanedUploadsRemoved = await cleanupOrphanedUploads(
      await collectReferencedUploadIds(),
    );
  } catch (error) {
    console.error(
      "[uploads] nettoyage des fichiers orphelins impossible :",
      error instanceof Error ? error.message : error,
    );
  }

  return NextResponse.json({
    ok: true,
    checkedTasks: dueTasks.length,
    sent: succeeded.length,
    skipped,
    failed: results.length - succeeded.length,
    volunteerReminders,
    orphanedUploadsRemoved,
  });
}
