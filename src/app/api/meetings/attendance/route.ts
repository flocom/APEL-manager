import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, HttpError } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";
import { getBaseUrl } from "@/lib/base-url";
import { formatDateTime } from "@/lib/dates";
import { db } from "@/lib/db";
import { events, meetingAttendance } from "@/lib/db/schema";
import { sendEmail } from "@/lib/notifications/email";
import { meetingAttendanceConfirmationEmail } from "@/lib/notifications/emails";
import {
  getAssociationSettings,
  getRecaptchaRuntimeConfig,
} from "@/lib/services/association-settings";
import { verifyRecaptcha } from "@/lib/services/recaptcha";
import { generateToken } from "@/lib/tokens";
import { emptyToNull } from "@/lib/utils";
import { publicMeetingAttendanceSchema } from "@/lib/validation";

/**
 * « Je serai là » depuis la page publique d'une réunion.
 *
 * Les réunions sont ouvertes aux familles : on ne peut donc pas demander un
 * compte pour annoncer sa venue. Ce point d'entrée est public et se protège
 * comme les autres formulaires du site — pot de miel, reCAPTCHA, réunion
 * retrouvée par son jeton de partage et non par son identifiant.
 *
 * Un membre connecté qui répond depuis cette page est reconnu : sa réponse est
 * rattachée à son compte plutôt qu'ajoutée en double sous son nom saisi.
 */
const schemaPublic = publicMeetingAttendanceSchema
  .extend({
    token: z.string().min(8, "Lien invalide"),
    // Pot de miel anti-robot : champ caché qui doit rester vide.
    website: z.string().optional(),
  })
  .refine(
    (d) => (d.email && d.email.length > 0) || (d.phone && d.phone.trim().length > 0),
    {
      message: "Indiquez au moins un e-mail ou un téléphone.",
      path: ["email"],
    },
  );

export async function POST(req: Request) {
  try {
    const data = schemaPublic.parse(await req.json());

    // Robot détecté (pot de miel rempli) : on répond OK sans rien enregistrer.
    if (data.website && data.website.trim().length > 0) {
      return NextResponse.json({ ok: true });
    }

    const recaptcha = await getRecaptchaRuntimeConfig();
    if (recaptcha) {
      await verifyRecaptcha({
        secret: recaptcha.secret,
        token: data.recaptchaToken,
        action: "inscription",
        minScore: recaptcha.minScore,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      });
    }

    const [reunion] = await db
      .select({
        id: events.id,
        kind: events.kind,
        status: events.status,
        title: events.title,
        startAt: events.startAt,
        location: events.location,
      })
      .from(events)
      .where(eq(events.shareToken, data.token))
      .limit(1);

    if (!reunion || reunion.status !== "published") {
      throw new HttpError(404, "Cette réunion n'accepte pas de réponses.");
    }
    if (reunion.kind !== "meeting") {
      throw new HttpError(
        400,
        "Ce rendez-vous n'est pas une réunion : pour un événement, ce sont les créneaux de bénévoles.",
      );
    }

    const email = emptyToNull(data.email ?? null);
    const phone = emptyToNull(data.phone ?? null);
    const currentUser = await getCurrentUser();

    // Un membre connecté répond sous son compte : c'est la même réponse que
    // celle du tableau de bord, pas une seconde ligne au même nom.
    if (currentUser) {
      await db
        .insert(meetingAttendance)
        .values({
          eventId: reunion.id,
          userId: currentUser.id,
          status: data.status,
        })
        .onConflictDoUpdate({
          target: [meetingAttendance.eventId, meetingAttendance.userId],
          set: { status: data.status, updatedAt: new Date() },
        });
      return NextResponse.json({ ok: true });
    }

    const cancelToken = generateToken(18);

    // Revenir sur sa réponse doit marcher aussi bien que la donner : un même
    // e-mail met sa ligne à jour au lieu de buter sur « déjà répondu », car le
    // parent qui recoche n'a le plus souvent pas gardé l'e-mail de confirmation.
    if (email) {
      const [existant] = await db
        .select({ id: meetingAttendance.id, cancelToken: meetingAttendance.cancelToken })
        .from(meetingAttendance)
        .where(
          and(
            eq(meetingAttendance.eventId, reunion.id),
            isNull(meetingAttendance.userId),
            sql`lower(${meetingAttendance.email}) = ${email}`,
          ),
        )
        .limit(1);

      if (existant) {
        await db
          .update(meetingAttendance)
          .set({
            status: data.status,
            name: data.name,
            phone,
            cancelToken: existant.cancelToken ?? cancelToken,
            updatedAt: new Date(),
          })
          .where(eq(meetingAttendance.id, existant.id));
        await envoyerConfirmation({
          email,
          nom: data.name,
          statut: data.status,
          reunion,
          cancelToken: existant.cancelToken ?? cancelToken,
        });
        return NextResponse.json({ ok: true });
      }
    }

    try {
      await db.insert(meetingAttendance).values({
        eventId: reunion.id,
        status: data.status,
        name: data.name,
        email,
        phone,
        cancelToken,
      });
    } catch (e) {
      // Double soumission simultanée : l'index unique partiel a tranché.
      if ((e as { code?: string })?.code === "23505") {
        return NextResponse.json({ ok: true });
      }
      throw e;
    }

    if (email) {
      await envoyerConfirmation({
        email,
        nom: data.name,
        statut: data.status,
        reunion,
        cancelToken,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

async function envoyerConfirmation({
  email,
  nom,
  statut,
  reunion,
  cancelToken,
}: {
  email: string;
  nom: string;
  statut: "yes" | "maybe" | "no";
  reunion: { title: string; startAt: Date; location: string | null };
  cancelToken: string;
}) {
  const [baseUrl, association] = await Promise.all([
    getBaseUrl(),
    getAssociationSettings(),
  ]);
  const mail = meetingAttendanceConfirmationEmail({
    name: nom,
    eventTitle: reunion.title,
    eventDate: formatDateTime(reunion.startAt),
    location: reunion.location,
    status: statut,
    cancelUrl: `${baseUrl}/annulation/${cancelToken}`,
    identity: {
      associationName: association.associationName,
      schoolName: association.schoolName,
      rna: association.rna,
    },
  });
  await sendEmail({ to: email, ...mail });
}
