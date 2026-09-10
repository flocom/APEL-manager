import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { events, meetingAttendance } from "@/lib/db/schema";
import { meetingAttendanceSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Réponse de présence d'un membre à une réunion.
 *
 * Un seul enregistrement par personne et par réunion : changer d'avis met la
 * ligne à jour plutôt que d'en empiler une seconde. Réservé aux membres
 * connectés — on répond pour soi, jamais au nom d'un autre.
 */
export async function PUT(req: Request, { params }: Params) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    const data = meetingAttendanceSchema.parse(await req.json());

    const [reunion] = await db
      .select({ kind: events.kind })
      .from(events)
      .where(eq(events.id, id))
      .limit(1);
    if (!reunion) throw new HttpError(404, "Réunion introuvable.");
    if (reunion.kind !== "meeting") {
      throw new HttpError(
        400,
        "On annonce sa présence à une réunion ; pour un événement, ce sont les créneaux de bénévoles.",
      );
    }

    await db
      .insert(meetingAttendance)
      .values({
        eventId: id,
        userId: user.id,
        status: data.status,
        note: data.note?.trim() || null,
      })
      .onConflictDoUpdate({
        target: [meetingAttendance.eventId, meetingAttendance.userId],
        set: {
          status: data.status,
          note: data.note?.trim() || null,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Retire sa réponse : on redevient « sans réponse ». */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    await db
      .delete(meetingAttendance)
      .where(
        and(
          eq(meetingAttendance.eventId, id),
          eq(meetingAttendance.userId, user.id),
        ),
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
