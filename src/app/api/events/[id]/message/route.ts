import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { getEventWithDetails } from "@/lib/data";
import { sendBulkEmail, uniqueRecipients } from "@/lib/notifications/email";
import { broadcastEmail } from "@/lib/notifications/emails";
import { getAssociationSettings } from "@/lib/services/association-settings";
import { messageSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const sender = await requireApiRole("manager");
    const { id } = await params;
    const { subject, message } = messageSchema.parse(await req.json());

    const event = await getEventWithDetails(id);
    if (!event) throw new HttpError(404, "Événement introuvable.");

    const recipients = uniqueRecipients(
      event.volunteerSlots
        .flatMap((slot) => slot.signups)
        .map((signup) => signup.email),
    );
    if (recipients.length === 0) {
      throw new HttpError(400, "Aucun bénévole avec une adresse e-mail.");
    }

    const association = await getAssociationSettings();
    const mail = broadcastEmail({
      subject,
      message,
      senderName: sender.name,
      identity: {
        associationName: association.associationName,
        schoolName: association.schoolName,
        rna: association.rna,
      },
    });
    const sent = await sendBulkEmail(recipients, mail);

    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    return handleApiError(error);
  }
}
