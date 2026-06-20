import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { taskAssignees, tasks } from "@/lib/db/schema";

type Params = { params: Promise<{ id: string }> };

/** Bascule l'auto-assignation du membre courant sur une tâche (« Je m'en charge »). */
export async function POST(_req: Request, { params }: Params) {
  try {
    const user = await requireApiUser();
    const { id: taskId } = await params;

    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (!task) throw new HttpError(404, "Tâche introuvable.");

    const [existing] = await db
      .select({ userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(
        and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, user.id)),
      )
      .limit(1);

    if (existing) {
      await db
        .delete(taskAssignees)
        .where(
          and(
            eq(taskAssignees.taskId, taskId),
            eq(taskAssignees.userId, user.id),
          ),
        );
      return NextResponse.json({ ok: true, assigned: false });
    }

    await db
      .insert(taskAssignees)
      .values({ taskId, userId: user.id })
      .onConflictDoNothing();
    return NextResponse.json({ ok: true, assigned: true });
  } catch (error) {
    return handleApiError(error);
  }
}
