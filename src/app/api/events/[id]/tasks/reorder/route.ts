import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  handleApiError,
  HttpError,
  requireApiRole,
} from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(500),
  version: z.number().int().nonnegative(),
});

export async function POST(req: Request, { params }: Params) {
  try {
    await requireApiRole("manager");
    const { id: eventId } = await params;
    const { orderedIds, version } = schema.parse(await req.json());

    /*
     * Une seule instruction :
     * - vérifie que la liste est une permutation exacte des tâches de l'événement ;
     * - verrouille la réorganisation avec la version de l'événement ;
     * - met à jour toutes les positions sans état intermédiaire partiel.
     */
    const result = await db.execute(sql`
      WITH requested AS (
        SELECT
          requested.id,
          (requested.ordinality - 1)::integer AS position
        FROM unnest(ARRAY[
          ${sql.join(
            orderedIds.map((taskId) => sql`${taskId}::uuid`),
            sql`, `,
          )}
        ]::uuid[])
          WITH ORDINALITY AS requested(id, ordinality)
      ),
      valid_order AS (
        SELECT (
          (SELECT count(*) FROM requested) =
            (SELECT count(*) FROM tasks WHERE event_id = ${eventId})
          AND
          (SELECT count(DISTINCT id) FROM requested) =
            (SELECT count(*) FROM requested)
          AND NOT EXISTS (
            SELECT 1
            FROM requested
            LEFT JOIN tasks
              ON tasks.id = requested.id
              AND tasks.event_id = ${eventId}
            WHERE tasks.id IS NULL
          )
        ) AS ok
      ),
      bumped AS (
        UPDATE events
        SET version = version + 1
        WHERE id = ${eventId}
          AND version = ${version}
          AND (SELECT ok FROM valid_order)
        RETURNING id, version
      ),
      reordered AS (
        UPDATE tasks
        SET position = requested.position
        FROM requested, bumped
        WHERE tasks.id = requested.id
          AND tasks.event_id = bumped.id
        RETURNING tasks.id
      )
      SELECT
        (SELECT ok FROM valid_order) AS valid,
        (SELECT count(*) FROM bumped)::int AS matched,
        (SELECT version FROM bumped) AS version,
        (SELECT count(*) FROM reordered)::int AS updated
    `);
    const row = result[0] as
      | {
          valid?: boolean;
          matched?: number;
          version?: number;
          updated?: number;
        }
      | undefined;

    if (!row?.valid) {
      throw new HttpError(
        400,
        "L’ordre doit contenir chaque tâche de l’événement une seule fois.",
      );
    }
    if (Number(row.matched ?? 0) === 0) {
      const [event] = await db
        .select({ version: events.version })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);
      if (!event) throw new HttpError(404, "Événement introuvable.");
      throw new HttpError(
        409,
        "La check-list a été modifiée entre-temps. Rechargez la page avant de la réorganiser.",
      );
    }
    if (Number(row.updated ?? 0) !== orderedIds.length) {
      throw new HttpError(500, "La réorganisation est incomplète.");
    }

    return NextResponse.json({ ok: true, version: Number(row.version) });
  } catch (error) {
    return handleApiError(error);
  }
}
