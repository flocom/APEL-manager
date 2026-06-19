import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, HttpError } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { emptyToNull } from "@/lib/utils";
import { signupSchema } from "@/lib/validation";

const publicSignupSchema = signupSchema.extend({
  token: z.string().min(8, "Lien invalide"),
});

export async function POST(req: Request) {
  try {
    const data = publicSignupSchema.parse(await req.json());

    // L'événement doit exister, être publié, et le créneau lui appartenir.
    const event = await db.query.events.findFirst({
      where: eq(events.shareToken, data.token),
      with: { volunteerSlots: true },
    });
    if (!event || event.status !== "published") {
      throw new HttpError(404, "Cet événement n'accepte pas d'inscriptions.");
    }

    const slot = event.volunteerSlots.find((s) => s.id === data.slotId);
    if (!slot) throw new HttpError(400, "Créneau introuvable pour cet événement.");

    // Si un membre connecté s'inscrit, on relie l'inscription à son compte.
    const currentUser = await getCurrentUser();

    // Insertion atomique : on n'insère que si le créneau n'est pas déjà complet.
    // La vérification de capacité et l'insertion sont dans une seule requête SQL,
    // ce qui évite la condition de course du schéma "compter puis insérer".
    const inserted = await db.execute(sql`
      INSERT INTO volunteer_signups (slot_id, user_id, name, email, phone)
      SELECT
        ${slot.id}::uuid,
        ${currentUser?.id ?? null}::uuid,
        ${data.name},
        ${emptyToNull(data.email ?? null)},
        ${emptyToNull(data.phone ?? null)}
      WHERE (
        SELECT count(*) FROM volunteer_signups WHERE slot_id = ${slot.id}::uuid
      ) < ${slot.capacity}
      RETURNING id
    `);

    if (inserted.rows.length === 0) {
      throw new HttpError(409, "Ce créneau est complet.");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
