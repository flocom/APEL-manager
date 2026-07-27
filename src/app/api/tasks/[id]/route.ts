import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  handleApiError,
  HttpError,
  requireApiRole,
  requireApiUser,
} from "@/lib/auth/guards";

const CONFLICT =
  "Cette tâche a été modifiée entre-temps. Rechargez la page pour repartir de la dernière version.";
import { hasRole } from "@/lib/auth/rbac";
import { computeDueAt } from "@/lib/dates";
import { db } from "@/lib/db";
import { events, taskAssignees, tasks } from "@/lib/db/schema";
import { resolveLeadTime } from "@/lib/task-lead-time";
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
        data.leadTimeValue !== undefined ||
        data.leadTimeUnit !== undefined ||
        data.assigneeIds !== undefined;
      if (touchesRestricted) {
        throw new HttpError(
          403,
          "Vous ne pouvez modifier que l'avancement de la tâche.",
        );
      }
    }

    const updates: Partial<typeof tasks.$inferInsert> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (
      data.leadTimeDays !== undefined ||
      data.leadTimeValue !== undefined ||
      data.leadTimeUnit !== undefined
    ) {
      const duration = resolveLeadTime(data, {
        leadTimeDays: task.leadTimeDays,
        leadTimeValue: task.leadTimeValue,
        leadTimeUnit: task.leadTimeUnit,
      });
      if (duration.leadTimeDays > 365) {
        throw new HttpError(400, "La durée ne peut pas dépasser un an.");
      }
      updates.leadTimeDays = duration.leadTimeDays;
      updates.leadTimeValue = duration.leadTimeValue;
      updates.leadTimeUnit = duration.leadTimeUnit;
      const [event] = await db
        .select({ startAt: events.startAt })
        .from(events)
        .where(eq(events.id, task.eventId))
        .limit(1);
      if (event)
        updates.dueAt = computeDueAt(event.startAt, duration.leadTimeDays);
    }
    if (data.status !== undefined) {
      updates.status = data.status;
      updates.completedAt = data.status === "done" ? new Date() : null;
    }

    // Verrou optimiste pour l'édition complète (le client envoie sa version).
    // Les actions ciblées (changer l'avancement) n'envoient pas de version et
    // restent donc sans friction ; elles touchent des champs disjoints.
    if (data.version !== undefined) {
      const [updated] = await db
        .update(tasks)
        .set({ ...updates, version: sql`${tasks.version} + 1` })
        .where(and(eq(tasks.id, id), eq(tasks.version, data.version)))
        .returning({ id: tasks.id });
      // La tâche existe déjà (chargée plus haut) → 0 ligne = conflit de version.
      if (!updated) throw new HttpError(409, CONFLICT);
    } else if (Object.keys(updates).length > 0) {
      await db.update(tasks).set(updates).where(eq(tasks.id, id));
    }

    if (isManager && data.assigneeIds !== undefined) {
      // Remplacement des assigné·es en 2 requêtes (delete+insert) : non atomique
      // car le driver neon-http n'a pas de transactions. Conséquence acceptable
      // (et récupérable via la même UI) : un crash entre les deux laisserait la
      // tâche sans assigné·e. Le verrou de version ci-dessus protège déjà du
      // lost-update entre deux éditions concurrentes.
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
