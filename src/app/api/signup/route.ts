import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, HttpError } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";
import { getBaseUrl } from "@/lib/base-url";
import { formatDateTime } from "@/lib/dates";
import { db } from "@/lib/db";
import { events, volunteerSignups } from "@/lib/db/schema";
import { sendEmail } from "@/lib/notifications/email";
import { volunteerConfirmationEmail } from "@/lib/notifications/emails";
import { generateToken } from "@/lib/tokens";
import { emptyToNull } from "@/lib/utils";
import { signupSchema } from "@/lib/validation";

const publicSignupSchema = signupSchema
  .extend({
    token: z.string().min(8, "Lien invalide"),
    // Honeypot anti-bot : champ caché qui doit rester vide.
    website: z.string().optional(),
  })
  .refine((d) => (d.email && d.email.length > 0) || (d.phone && d.phone.trim().length > 0), {
    message: "Indiquez au moins un e-mail ou un téléphone.",
    path: ["email"],
  });

export async function POST(req: Request) {
  try {
    const data = publicSignupSchema.parse(await req.json());

    // Bot détecté (honeypot rempli) : on répond OK sans rien enregistrer.
    if (data.website && data.website.trim().length > 0) {
      return NextResponse.json({ ok: true });
    }

    const event = await db.query.events.findFirst({
      where: eq(events.shareToken, data.token),
      with: { volunteerSlots: true },
    });
    if (!event || event.status !== "published") {
      throw new HttpError(404, "Cet événement n'accepte pas d'inscriptions.");
    }

    const slot = event.volunteerSlots.find((s) => s.id === data.slotId);
    if (!slot) throw new HttpError(400, "Créneau introuvable pour cet événement.");

    const email = emptyToNull(data.email ?? null);
    const phone = emptyToNull(data.phone ?? null);

    // Anti-doublon : même créneau + même e-mail.
    if (email) {
      const [dup] = await db
        .select({ id: volunteerSignups.id })
        .from(volunteerSignups)
        .where(
          and(
            eq(volunteerSignups.slotId, slot.id),
            sql`lower(${volunteerSignups.email}) = ${email}`,
          ),
        )
        .limit(1);
      if (dup) {
        throw new HttpError(409, "Vous êtes déjà inscrit·e à ce créneau.");
      }
    }

    const currentUser = await getCurrentUser();
    const cancelToken = generateToken(18);

    // Insertion atomique : on n'insère que si le créneau n'est pas déjà complet.
    // L'index unique partiel (slot_id, lower(email)) sécurise l'anti-doublon en
    // cas de course (deux soumissions simultanées) → erreur Postgres 23505.
    let inserted;
    try {
      inserted = await db.execute(sql`
        INSERT INTO volunteer_signups (slot_id, user_id, name, email, phone, cancel_token)
        SELECT
          ${slot.id}::uuid,
          ${currentUser?.id ?? null}::uuid,
          ${data.name},
          ${email},
          ${phone},
          ${cancelToken}
        WHERE (
          SELECT count(*) FROM volunteer_signups WHERE slot_id = ${slot.id}::uuid
        ) < ${slot.capacity}
        RETURNING id
      `);
    } catch (e) {
      if ((e as { code?: string })?.code === "23505") {
        throw new HttpError(409, "Vous êtes déjà inscrit·e à ce créneau.");
      }
      throw e;
    }

    if (inserted.rows.length === 0) {
      throw new HttpError(409, "Ce créneau est complet.");
    }

    // Confirmation par e-mail (avec lien de désinscription), si un e-mail est fourni.
    if (email) {
      const baseUrl = await getBaseUrl();
      const mail = volunteerConfirmationEmail({
        name: data.name,
        eventTitle: event.title,
        eventDate: formatDateTime(event.startAt),
        slotTitle: slot.title,
        location: event.location,
        cancelUrl: `${baseUrl}/annulation/${cancelToken}`,
      });
      await sendEmail({ to: email, ...mail });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
