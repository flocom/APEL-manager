import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import {
  getHelloAssoStatus,
  saveHelloAssoSettings,
} from "@/lib/services/helloasso";

/** État de la connexion HelloAsso, sans le secret. */
export async function GET() {
  try {
    await requireApiRole("admin");
    return NextResponse.json({ status: await getHelloAssoStatus() });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Enregistre ou efface les clés d'API (`HelloAssoSettingsInput`). */
export async function PATCH(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const status = await saveHelloAssoSettings(
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ status });
  } catch (error) {
    return handleApiError(error);
  }
}
