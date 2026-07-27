import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { sendEmail } from "@/lib/notifications/email";
import { webAuditActor } from "@/lib/services/audit";
import {
  getOutboundMailStatus,
  markOutboundMailTest,
  saveOutboundMailSettings,
} from "@/lib/services/mail-settings";

export async function GET() {
  try {
    await requireApiRole("admin");
    return NextResponse.json({ settings: await getOutboundMailStatus() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const settings = await saveOutboundMailSettings(
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const body = await req.json();
    const { testEmail } = z
      .object({
        testEmail: z
          .string()
          .trim()
          .toLowerCase()
          .email("Adresse de test invalide"),
      })
      .parse(body);
    const actor = webAuditActor(user.id, req);
    const sent = await sendEmail({
      to: testEmail,
      subject: "Test de messagerie — APEL Notre Dame des Flots",
      html: `<div style="font-family:Arial,sans-serif;color:#082a40"><h2>La messagerie fonctionne.</h2><p>Ce message confirme que l’envoi sortant de l’APEL Notre Dame des Flots est correctement configuré.</p><p style="color:#64748b;font-size:13px">RNA W853001441</p></div>`,
      text: "La messagerie de l’APEL Notre Dame des Flots est correctement configurée. RNA W853001441.",
    });
    await markOutboundMailTest(actor, sent);
    return NextResponse.json({ ok: sent, sent }, { status: sent ? 200 : 502 });
  } catch (error) {
    return handleApiError(error);
  }
}
