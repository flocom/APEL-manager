import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, HttpError } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { meetingAttendance, volunteerSignups } from "@/lib/db/schema";

const schema = z.object({ token: z.string().min(8) });

/**
 * Retrait par lien public : créneau de bénévole ou présence annoncée à une
 * réunion. Un seul point d'entrée pour les deux, parce que le parent, lui, n'a
 * qu'un lien « me désinscrire » au bas d'un e-mail et ne sait pas de quelle
 * table il relève.
 */
export async function POST(req: Request) {
  try {
    const { token } = schema.parse(await req.json());

    const [signup] = await db
      .delete(volunteerSignups)
      .where(eq(volunteerSignups.cancelToken, token))
      .returning({ id: volunteerSignups.id });
    if (signup) return NextResponse.json({ ok: true });

    const [presence] = await db
      .delete(meetingAttendance)
      .where(eq(meetingAttendance.cancelToken, token))
      .returning({ id: meetingAttendance.id });
    if (presence) return NextResponse.json({ ok: true });

    throw new HttpError(404, "Inscription introuvable ou déjà annulée.");
  } catch (error) {
    return handleApiError(error);
  }
}
