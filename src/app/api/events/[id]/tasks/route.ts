import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { computeDueAt } from "@/lib/dates";
import { db } from "@/lib/db";
import { events, taskAssignees, tasks } from "@/lib/db/schema";
import { emptyToNull } from "@/lib/utils";
import { taskSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    await requireApiRole("manager");
    const { id: eventId } = await params;

    const [event] = await db
      .select({ startAt: events.startAt })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    if (!event) throw new HttpError(404, "Événement introuvable.");

    const data = taskSchema.parse(await req.json());
    const dueAt = computeDueAt(event.startAt, data.leadTimeDays);

    const [task] = await db
      .insert(tasks)
      .values({
        eventId,
        title: data.title,
        description: emptyToNull(data.description),
        leadTimeDays: data.leadTimeDays,
        dueAt,
      })
      .returning({ id: tasks.id });

    if (data.assigneeIds && data.assigneeIds.length > 0) {
      await db
        .insert(taskAssignees)
        .values(
          data.assigneeIds.map((userId) => ({ taskId: task.id, userId })),
        )
        .onConflictDoNothing();
    }

    return NextResponse.json({ ok: true, id: task.id });
  } catch (error) {
    return handleApiError(error);
  }
}
