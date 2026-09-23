import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  handleApiError,
  HttpError,
  requireApiRole,
  requireVersion,
} from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { events, meetingAttendance } from "@/lib/db/schema";
import { getEventWithDetails } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { sendBulkEmail, uniqueRecipients } from "@/lib/notifications/email";
import { eventCancelledEmail } from "@/lib/notifications/emails";
import { getNotificationIdentity } from "@/lib/notifications/identity";
import { recordAudit, webAuditActor } from "@/lib/services/audit";
import { assertBroadcastAllowed } from "@/lib/services/rate-limit";
import { evenementValide } from "@/lib/services/events";
import { eventCancelSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

const CONFLICT =
  "Cet événement a été modifié entre-temps. Rechargez la page pour repartir de la dernière version.";

/**
 * Annule un événement, ou le rétablit.
 *
 * L'annulation ne supprime rien : l'événement reste en place, barré, et ses
 * inscriptions avec lui. Ce qui s'arrête, ce sont ses tâches — le cron cesse
 * de relancer qui que ce soit sur la préparation d'une fête qui n'aura pas
 * lieu — et les inscriptions nouvelles, que la page publique refuse.
 *
 * Le message part dans la foulée, vers les bénévoles inscrits et, pour une
 * réunion, vers les personnes ayant répondu. C'est le seul moment où il est
 * utile : prévenir la veille au soir vaut mieux qu'un déplacement pour rien.
 *
 * L'échec d'envoi n'annule pas l'annulation. Les deux ne sont pas de même
 * nature : la décision est prise et doit se voir sur l'écran de l'équipe,
 * même si le courrier tombe. La réponse dit combien de messages sont partis,
 * pour que l'écran puisse le redire — et que personne ne croie l'affaire
 * classée quand elle ne l'est pas.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const { id } = await params;
    evenementValide(id);
    const body = await req.json();
    // Le bouton envoie toujours la version affichée : annuler (et prévenir
    // tous les inscrits) sur la foi d'un écran périmé ne doit pas passer.
    const version = requireVersion(body);
    const { annule, raison } = eventCancelSchema.parse(body);

    const event = await getEventWithDetails(id);
    if (!event) throw new HttpError(404, "Événement introuvable.");

    // Chaque annulation fait repartir le message vers tous les inscrits : la
    // basculer dix fois leur en enverrait dix. Contrôlé avant tout
    // changement, pour que le refus laisse l'événement tel quel.
    if (annule) {
      await assertBroadcastAllowed(user.id, { type: "annulation", eventId: id });
    }

    const maintenant = new Date();
    const [maj] = await db
      .update(events)
      .set({
        cancelledAt: annule ? maintenant : null,
        version: version + 1,
      })
      .where(and(eq(events.id, id), eq(events.version, version)))
      .returning({ id: events.id });
    if (!maj) throw new HttpError(409, CONFLICT);

    await recordAudit(
      webAuditActor(user.id, req),
      annule ? "event.cancel" : "event.uncancel",
      "event",
      id,
      { title: event.title, raison: raison?.trim() || null },
    );

    if (!annule) {
      return NextResponse.json({ ok: true, annule: false, sent: 0 });
    }

    // Les inscrits d'un événement, les répondants d'une réunion : dans les
    // deux cas, ceux qui avaient prévu de venir.
    const contacts = event.volunteerSlots.flatMap((slot) =>
      slot.signups.map((s) => s.email),
    );
    if (event.kind === "meeting") {
      const reponses = await db
        .select({ email: meetingAttendance.email })
        .from(meetingAttendance)
        .where(eq(meetingAttendance.eventId, id));
      contacts.push(...reponses.map((r) => r.email));
    }
    const destinataires = uniqueRecipients(contacts);
    // Sans adresse, on ne peut pas prévenir : l'écran affiche le décompte pour
    // que l'équipe passe un appel plutôt que de croire tout le monde averti.
    const sansEmail = contacts.length - destinataires.length;

    let sent = 0;
    if (destinataires.length > 0) {
      sent = await sendBulkEmail(
        destinataires,
        eventCancelledEmail({
          eventTitle: event.title,
          eventDate: formatDateTime(event.startAt),
          location: event.location,
          raison: raison ?? null,
          isMeeting: event.kind === "meeting",
          identity: await getNotificationIdentity(),
        }),
      );
      if (sent < destinataires.length) {
        console.warn(
          `[annulation] ${destinataires.length - sent} message(s) d'annulation non remis pour « ${event.title} ».`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      annule: true,
      sent,
      destinataires: destinataires.length,
      sansEmail,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
