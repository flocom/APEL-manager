import { timingSafeEqual } from "node:crypto";

import { and, eq, lte, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { notificationsLog, tasks } from "@/lib/db/schema";
import { notifyTaskDue, type NotifyKind } from "@/lib/notifications";

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

  const windowDaysRaw = Number(process.env.REMINDER_WINDOW_DAYS ?? "3");
  const windowDays = Number.isFinite(windowDaysRaw) ? windowDaysRaw : 3;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const now = new Date();
  const horizon = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const dueTasks = await db.query.tasks.findMany({
    where: and(ne(tasks.status, "done"), lte(tasks.dueAt, horizon)),
    with: {
      event: true,
      assignees: { with: { user: true } },
    },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const task of dueTasks) {
    const kind: NotifyKind = task.dueAt < now ? "overdue" : "reminder";

    for (const { user } of task.assignees) {
      if (!user) continue;

      // Déjà notifié pour cette tâche / ce membre / ce type ? On saute.
      const [already] = await db
        .select({ id: notificationsLog.id })
        .from(notificationsLog)
        .where(
          and(
            eq(notificationsLog.taskId, task.id),
            eq(notificationsLog.userId, user.id),
            eq(notificationsLog.kind, kind),
          ),
        )
        .limit(1);

      if (already) {
        skipped++;
        continue;
      }

      const ok = await notifyTaskDue({
        user: {
          name: user.name,
          email: user.email,
          telegramChatId: user.telegramChatId,
        },
        taskTitle: task.title,
        eventTitle: task.event.title,
        dueAt: task.dueAt,
        kind,
        appUrl,
      });

      // On ne journalise (et donc ne « consomme » le rappel) qu'en cas de
      // succès : si aucun canal n'est configuré ou en cas d'échec transitoire,
      // la tâche sera retentée à la prochaine exécution.
      if (ok) {
        await db
          .insert(notificationsLog)
          .values({ taskId: task.id, userId: user.id, kind })
          .onConflictDoNothing();
        sent++;
      } else {
        failed++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    checkedTasks: dueTasks.length,
    sent,
    skipped,
    failed,
  });
}
