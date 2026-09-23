import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { getEventWithDetails } from "@/lib/data";
import { sendBulkEmail, uniqueRecipients } from "@/lib/notifications/email";
import { broadcastEmail } from "@/lib/notifications/emails";
import { getNotificationIdentity } from "@/lib/notifications/identity";
import { messageSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const sender = await requireApiRole("manager");
    const { id } = await params;
    const { subject, message } = messageSchema.parse(await req.json());

    const event = await getEventWithDetails(id);
    if (!event) throw new HttpError(404, "Événement introuvable.");

    const inscrits = event.volunteerSlots.flatMap((slot) => slot.signups);
    const recipients = uniqueRecipients(inscrits.map((signup) => signup.email));

    // L'e-mail est désormais exigé à l'inscription, mais les inscriptions
    // antérieures à cette règle n'en ont pas toujours un. Le bouton promettait
    // d'écrire « aux bénévoles » et en oubliait silencieusement : on compte
    // ceux qu'on laisse de côté et on le dit à l'expéditeur, qui a leur numéro
    // sous les yeux sur le même écran.
    const sansEmail = inscrits.filter((signup) => !signup.email).length;

    if (recipients.length === 0) {
      throw new HttpError(
        400,
        sansEmail > 0
          ? `Aucun des ${sansEmail} bénévole${sansEmail > 1 ? "s" : ""} inscrit${sansEmail > 1 ? "s" : ""} n’a laissé d’adresse e-mail. Leurs numéros figurent sous chaque créneau.`
          : "Aucun bénévole inscrit à cet événement.",
      );
    }

    const mail = broadcastEmail({
      subject,
      message,
      senderName: sender.name,
      identity: await getNotificationIdentity(),
    });
    const sent = await sendBulkEmail(recipients, mail);

    return NextResponse.json({ ok: true, sent, sansEmail });
  } catch (error) {
    return handleApiError(error);
  }
}
