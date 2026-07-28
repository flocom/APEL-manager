import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/notifications/email";
import { broadcastEmail } from "@/lib/notifications/emails";
import { getAssociationSettings } from "@/lib/services/association-settings";
import { messageSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    // Diffuser à TOUS les comptes est une action d'administration (la page
    // /dashboard/members est elle-même réservée aux admins).
    const sender = await requireApiRole("admin");
    const { subject, message } = messageSchema.parse(await req.json());

    const members = await db.select({ email: users.email }).from(users);
    const emails = members.map((m) => m.email).filter(Boolean);
    if (emails.length === 0) {
      throw new HttpError(400, "Aucun membre à contacter.");
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
    const results = await Promise.all(
      emails.map((to) => sendEmail({ to, ...mail })),
    );
    const sent = results.filter(Boolean).length;

    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    return handleApiError(error);
  }
}
