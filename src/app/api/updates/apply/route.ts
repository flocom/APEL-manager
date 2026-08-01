import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { recordAudit, webAuditActor } from "@/lib/services/audit";
import { triggerUpdateNow } from "@/lib/services/updates";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireApiRole("admin");

    // Journalisé avant l'appel : si l'updater remplace le conteneur, la trace
    // est déjà écrite.
    await recordAudit(
      webAuditActor(user.id, req),
      "update.trigger",
      "application",
      null,
    );

    const outcome = await triggerUpdateNow();
    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    return handleApiError(error);
  }
}
