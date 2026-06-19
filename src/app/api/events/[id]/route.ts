import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { computeDueAt } from "@/lib/dates";
import { db } from "@/lib/db";
import { events, tasks } from "@/lib/db/schema";
import { emptyToNull } from "@/lib/utils";
import { eventSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireApiRole("manager");
    const { id } = await params;
    const data = eventSchema.partial().parse(await req.json());

    const updates: Record<string, unknown> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined)
      updates.description = emptyToNull(data.description);
    if (data.location !== undefined)
      updates.location = emptyToNull(data.location);
    if (data.startAt !== undefined) updates.startAt = data.startAt;
    if (data.endAt !== undefined) updates.endAt = data.endAt ?? null;
    if (data.status !== undefined) updates.status = data.status;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true });
    }

    const [updated] = await db
      .update(events)
      .set(updates)
      .where(eq(events.id, id))
      .returning({ id: events.id });

    if (!updated) throw new HttpError(404, "Événement introuvable.");

    // Si la date de début change, on recalcule l'échéance des tâches liées, avec
    // la même arithmétique (24h fixes) que la création/édition d'une tâche.
    if (data.startAt !== undefined) {
      const start = data.startAt;
      const eventTasks = await db
        .select({ id: tasks.id, leadTimeDays: tasks.leadTimeDays })
        .from(tasks)
        .where(eq(tasks.eventId, id));
      for (const t of eventTasks) {
        await db
          .update(tasks)
          .set({ dueAt: computeDueAt(start, t.leadTimeDays) })
          .where(eq(tasks.id, t.id));
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
    await db.delete(events).where(eq(events.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
