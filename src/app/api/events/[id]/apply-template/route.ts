import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { computeDueAt } from "@/lib/dates";
import { db } from "@/lib/db";
import { events, tasks } from "@/lib/db/schema";
import { getTemplate } from "@/lib/templates";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({ templateKey: z.string().min(1) });

export async function POST(req: Request, { params }: Params) {
  try {
    await requireApiRole("manager");
    const { id: eventId } = await params;
    const { templateKey } = schema.parse(await req.json());

    const template = getTemplate(templateKey);
    if (!template) throw new HttpError(400, "Modèle de check-list inconnu.");

    const [event] = await db
      .select({ startAt: events.startAt })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    if (!event) throw new HttpError(404, "Événement introuvable.");

    // Idempotence : on n'applique un modèle que sur une check-list vide, pour
    // éviter de dupliquer les tâches (un POST direct ou rejoué est ainsi rejeté).
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(eq(tasks.eventId, eventId));
    if (count > 0) {
      throw new HttpError(
        409,
        "Cet événement a déjà des tâches. Videz la check-list avant d'appliquer un modèle.",
      );
    }

    const rows = template.tasks.map((t) => ({
      eventId,
      title: t.title,
      description: t.description ?? null,
      leadTimeDays: t.leadTimeDays,
      dueAt: computeDueAt(event.startAt, t.leadTimeDays),
    }));

    await db.insert(tasks).values(rows);

    return NextResponse.json({ ok: true, created: rows.length });
  } catch (error) {
    return handleApiError(error);
  }
}
