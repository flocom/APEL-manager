import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, HttpError } from "@/lib/auth/guards";
import { isApproved } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { events, meetingAttendance } from "@/lib/db/schema";
import { getRecaptchaRuntimeConfig } from "@/lib/services/association-settings";
import {
  avertirLeBureauPresence as avertirLeBureau,
  demanderConfirmationDuChangement,
  envoyerConfirmationPresence as envoyerConfirmation,
} from "@/lib/services/meeting-attendance";
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
// Les deux coordonnées sont exigées par `publicMeetingAttendanceSchema` :
// plus de règle « au moins l'un des deux » à poser ici.
const schemaPublic = publicMeetingAttendanceSchema.extend({
  token: z.string().min(8, "Lien invalide"),
  // Pot de miel anti-robot : champ caché qui doit rester vide.
  website: z.string().optional(),
});

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
        cancelledAt: events.cancelledAt,
        title: events.title,
        startAt: events.startAt,
        location: events.location,
      })
      .from(events)
      .where(eq(events.shareToken, data.token))
      .limit(1);

    if (reunion?.cancelledAt) {
      throw new HttpError(
        410,
        "Cette réunion a été annulée : les réponses sont closes.",
      );
    }
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
    const sessionUser = await getCurrentUser();
    // Un compte en attente répond comme un invité : sa réponse ne doit pas
    // s'afficher parmi celles de l'équipe, ni disparaître avec lui s'il est
    // refusé (la réponse d'un compte est supprimée avec le compte).
    const currentUser = isApproved(sessionUser) ? sessionUser : null;

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
      await avertirLeBureau({
        nom: currentUser.name,
        email: currentUser.email,
        phone,
        statut: data.status,
        reunion,
      });
      return NextResponse.json({ ok: true });
    }

    const cancelToken = generateToken(18);

    // Une adresse qui a déjà répondu : sa réponse n'est PAS remplacée. Elle
    // l'était, en silence, et il suffisait donc de connaître l'adresse d'un
    // parent pour changer sa réponse, son nom et son téléphone dans la liste
    // du bureau. Le changement part désormais en demande de confirmation à
    // cette adresse — le parent qui recoche le confirme d'un clic, un tiers ne
    // peut pas.
    //
    // La réponse faite ici est la même que pour une première réponse : dire
    // « vous aviez déjà répondu » apprendrait à n'importe qui qu'une adresse
    // donnée vient à la réunion. L'écran le dit en termes neutres.
    if (email) {
      const [existant] = await db
        .select({
          id: meetingAttendance.id,
          status: meetingAttendance.status,
          name: meetingAttendance.name,
          phone: meetingAttendance.phone,
          cancelToken: meetingAttendance.cancelToken,
          updatedAt: meetingAttendance.updatedAt,
        })
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
        await demanderConfirmationDuChangement({
          existant,
          reunion,
          email,
          propose: { status: data.status, name: data.name, phone },
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
    await avertirLeBureau({
      nom: data.name,
      email,
      phone,
      statut: data.status,
      reunion,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
