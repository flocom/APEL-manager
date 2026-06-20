import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { computeDueAt } from "@/lib/dates";
import { db } from "@/lib/db";
import { checklistTemplates, events, tasks } from "@/lib/db/schema";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({ templateId: z.string().uuid("Modèle invalide") });

export async function POST(req: Request, { params }: Params) {
  try {
    await requireApiRole("manager");
    const { id: eventId } = await params;
    const { templateId } = schema.parse(await req.json());

    const [template] = await db
      .select()
      .from(checklistTemplates)
      .where(eq(checklistTemplates.id, templateId))
      .limit(1);
    if (!template) throw new HttpError(400, "Modèle de check-list introuvable.");
    if (template.tasks.length === 0) {
      throw new HttpError(400, "Ce modèle ne contient aucune tâche.");
    }

    const [event] = await db
      .select({ startAt: events.startAt })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    if (!event) throw new HttpError(404, "Événement introuvable.");

    // Idempotence : on n'applique un modèle que sur une check-list vide.
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

    const rows = template.tasks.map((t, i) => ({
      eventId,
      title: t.title,
      description: t.description ?? null,
      leadTimeDays: t.leadTimeDays,
      dueAt: computeDueAt(event.startAt, t.leadTimeDays),
      position: i,
    }));

    await db.insert(tasks).values(rows);

    return NextResponse.json({ ok: true, created: rows.length });
  } catch (error) {
    return handleApiError(error);
  }
}
