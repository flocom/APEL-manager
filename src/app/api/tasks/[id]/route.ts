import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  handleApiError,
  HttpError,
  requireApiRole,
  requireApiUser,
} from "@/lib/auth/guards";
import { hasRole } from "@/lib/auth/rbac";
import { computeDueAt } from "@/lib/dates";
import { db } from "@/lib/db";
import { events, taskAssignees, tasks } from "@/lib/db/schema";
import { taskUpdateSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    const data = taskUpdateSchema.parse(await req.json());

    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id))
      .limit(1);
    if (!task) throw new HttpError(404, "Tâche introuvable.");

    const isManager = hasRole(user, "manager");

    if (!isManager) {
      // Un membre ne peut modifier que l'avancement d'une tâche qui lui est assignée.
      const [assigned] = await db
        .select({ userId: taskAssignees.userId })
        .from(taskAssignees)
        .where(
          and(eq(taskAssignees.taskId, id), eq(taskAssignees.userId, user.id)),
        )
        .limit(1);
      if (!assigned) {
        throw new HttpError(403, "Cette tâche ne vous est pas assignée.");
      }
      const touchesRestricted =
        data.title !== undefined ||
        data.description !== undefined ||
        data.leadTimeDays !== undefined ||
        data.assigneeIds !== undefined;
      if (touchesRestricted) {
        throw new HttpError(
          403,
          "Vous ne pouvez modifier que l'avancement de la tâche.",
        );
      }
    }

    const updates: Record<string, unknown> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.leadTimeDays !== undefined) {
      updates.leadTimeDays = data.leadTimeDays;
      const [event] = await db
        .select({ startAt: events.startAt })
        .from(events)
        .where(eq(events.id, task.eventId))
        .limit(1);
      if (event) updates.dueAt = computeDueAt(event.startAt, data.leadTimeDays);
    }
    if (data.status !== undefined) {
      updates.status = data.status;
      updates.completedAt = data.status === "done" ? new Date() : null;
    }

    if (Object.keys(updates).length > 0) {
      await db.update(tasks).set(updates).where(eq(tasks.id, id));
    }

    if (isManager && data.assigneeIds !== undefined) {
      await db.delete(taskAssignees).where(eq(taskAssignees.taskId, id));
      if (data.assigneeIds.length > 0) {
        await db
          .insert(taskAssignees)
          .values(data.assigneeIds.map((userId) => ({ taskId: id, userId })))
          .onConflictDoNothing();
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireApiRole("manager");
    const { id } = await params;
    await db.delete(tasks).where(eq(tasks.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
