import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { getEventWithDetails } from "@/lib/data";
import { sendEmail } from "@/lib/notifications/email";
import { broadcastEmail } from "@/lib/notifications/emails";
import { messageSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const sender = await requireApiRole("manager");
    const { id } = await params;
    const { subject, message } = messageSchema.parse(await req.json());

    const event = await getEventWithDetails(id);
    if (!event) throw new HttpError(404, "Événement introuvable.");

    // E-mails distincts des bénévoles inscrits.
    const emails = new Set<string>();
    for (const slot of event.volunteerSlots) {
      for (const s of slot.signups) {
        if (s.email) emails.add(s.email.toLowerCase());
      }
    }
    if (emails.size === 0) {
      throw new HttpError(400, "Aucun bénévole avec une adresse e-mail.");
    }

    const mail = broadcastEmail({ subject, message, senderName: sender.name });
    const results = await Promise.all(
      [...emails].map((to) => sendEmail({ to, ...mail })),
    );
    const sent = results.filter(Boolean).length;

    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    return handleApiError(error);
  }
}
