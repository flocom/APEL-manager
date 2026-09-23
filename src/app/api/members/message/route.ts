import { isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sendBulkEmail, uniqueRecipients } from "@/lib/notifications/email";
import { broadcastEmail } from "@/lib/notifications/emails";
import { getNotificationIdentity } from "@/lib/notifications/identity";
import { assertBroadcastAllowed } from "@/lib/services/rate-limit";
import { recordAudit, webAuditActor } from "@/lib/services/audit";
import { messageSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    // Diffuser à TOUS les comptes est une action d'administration (la page
    // /dashboard/members est elle-même réservée aux admins).
    const sender = await requireApiRole("admin");
    const { subject, message } = messageSchema.parse(await req.json());

    // Les comptes en attente sont exclus : ce qu'on écrit à l'équipe n'a pas à
    // partir chez quelqu'un que personne n'a encore reconnu comme en faisant partie.
    const members = await db
      .select({ email: users.email })
      .from(users)
      .where(isNotNull(users.approvedAt));
    const recipients = uniqueRecipients(members.map((member) => member.email));
    if (recipients.length === 0) {
      throw new HttpError(400, "Aucun membre à contacter.");
    }

    const rendreQuota = await assertBroadcastAllowed(sender.id, {
      type: "equipe",
    });

    const mail = broadcastEmail({
      subject,
      message,
      senderName: sender.name,
      identity: await getNotificationIdentity(),
    });
    // Quota réservé avant l'envoi, rendu si le message n'a atteint
    // personne : un transport en panne ne doit pas faire refuser le
    // renvoi, une fois réparé, au motif de messages jamais reçus.
    let sent = 0;
    try {
      sent = await sendBulkEmail(recipients, mail);
    } finally {
      if (sent === 0) await rendreQuota();
    }

    // Même trace que l'outil MCP `broadcast_to_members` : l'objet et le
    // nombre de destinataires, jamais le corps du message.
    await recordAudit(
      webAuditActor(sender.id, req),
      "mail.broadcast_members",
      "user",
      null,
      {
        subject,
        messageLength: message.length,
        requested: recipients.length,
        sent,
      },
    );

    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    return handleApiError(error);
  }
}
