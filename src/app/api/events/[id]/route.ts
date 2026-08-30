import { eq, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { toSqlTimestamp } from "@/lib/dates";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { emptyToNull } from "@/lib/utils";
import { eventSchema } from "@/lib/validation";

const CONFLICT =
  "Cet événement a été modifié entre-temps. Rechargez la page pour repartir de la dernière version.";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireApiRole("manager");
    const { id } = await params;
    const data = eventSchema.partial().parse(await req.json());

    const updates: Partial<typeof events.$inferInsert> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined)
      updates.description = emptyToNull(data.description);
    if (data.publicDescription !== undefined)
      updates.publicDescription = emptyToNull(data.publicDescription);
    // Déjà normalisée par le schéma : "" est devenu null, l'URL est absolue.
    if (data.ticketingUrl !== undefined)
      updates.ticketingUrl = data.ticketingUrl;
    if (data.location !== undefined)
      updates.location = emptyToNull(data.location);
    if (data.startAt !== undefined) updates.startAt = data.startAt;
    if (data.endAt !== undefined) updates.endAt = data.endAt ?? null;
    if (data.status !== undefined) updates.status = data.status;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true });
    }

    // Verrou optimiste : si le client a fourni la version qu'il a chargée, on
    // n'écrit que si elle correspond encore (sinon 409, l'autre a édité avant).
    if (data.version !== undefined) {
      // SET dynamique (seuls les champs réellement fournis).
      const setFragments: SQL[] = [];
      if (data.title !== undefined) setFragments.push(sql`title = ${data.title}`);
      if (data.description !== undefined)
        setFragments.push(sql`description = ${emptyToNull(data.description)}`);
      if (data.publicDescription !== undefined)
        setFragments.push(
          sql`public_description = ${emptyToNull(data.publicDescription)}`,
        );
      if (data.ticketingUrl !== undefined)
        setFragments.push(sql`ticketing_url = ${data.ticketingUrl}`);
      if (data.location !== undefined)
        setFragments.push(sql`location = ${emptyToNull(data.location)}`);
      if (data.startAt !== undefined)
        setFragments.push(
          sql`start_at = ${toSqlTimestamp(data.startAt)}::timestamptz`,
        );
      if (data.endAt !== undefined)
        setFragments.push(
          sql`end_at = ${toSqlTimestamp(data.endAt)}::timestamptz`,
        );
      if (data.status !== undefined)
        setFragments.push(sql`status = ${data.status}`);

      // Un seul statement (CTE) rend atomiques la mise à jour de l'événement
      // (verrouillée par la version) et le recalcul des échéances des tâches.
      // Le recalcul est idempotent (due_at dérivé de start_at), il auto-corrige
      // donc toute dérive. `interval '24 hours'` = 24h fixes (cf. computeDueAt).
      const res = await db.execute(sql`
        WITH bumped AS (
          UPDATE events
          SET ${sql.join(setFragments, sql`, `)}, version = version + 1
          WHERE id = ${id}::uuid AND version = ${data.version}
          RETURNING id, start_at
        ), recompute AS (
          UPDATE tasks
          SET due_at = b.start_at - (lead_time_days * interval '24 hours')
          FROM bumped b
          WHERE tasks.event_id = b.id
          RETURNING tasks.id
        )
        SELECT (SELECT count(*) FROM bumped)::int AS matched
      `);
      const matched = Number(
        (res[0] as { matched?: number } | undefined)?.matched ?? 0,
      );
      if (matched === 0) {
        const [exists] = await db
          .select({ v: events.version })
          .from(events)
          .where(eq(events.id, id))
          .limit(1);
        if (!exists) throw new HttpError(404, "Événement introuvable.");
        throw new HttpError(409, CONFLICT);
      }
      return NextResponse.json({ ok: true });
    }

    // Chemin sans version (compatibilité) — inutilisé par le formulaire d'édition.
    const [updated] = await db
      .update(events)
      .set(updates)
      .where(eq(events.id, id))
      .returning({ id: events.id });
    if (!updated) throw new HttpError(404, "Événement introuvable.");
    if (data.startAt !== undefined) {
      await db.execute(
        sql`update tasks
            set due_at = ${toSqlTimestamp(data.startAt)}::timestamptz - (lead_time_days * interval '24 hours')
            where event_id = ${id}::uuid`,
      );
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
