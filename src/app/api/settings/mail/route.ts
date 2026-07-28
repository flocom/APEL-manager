import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { sendEmail } from "@/lib/notifications/email";
import { mailSettingsTestEmail } from "@/lib/notifications/emails";
import { getAssociationSettings } from "@/lib/services/association-settings";
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
    const association = await getAssociationSettings();
    const mail = mailSettingsTestEmail({
      associationName: association.associationName,
      schoolName: association.schoolName,
      rna: association.rna,
    });
    const sent = await sendEmail({
      to: testEmail,
      ...mail,
      allowDisabled: true,
    });
    await markOutboundMailTest(actor, sent);
    return NextResponse.json({ ok: sent, sent }, { status: sent ? 200 : 502 });
  } catch (error) {
    return handleApiError(error);
  }
}
