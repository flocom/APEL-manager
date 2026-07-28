import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import {
  getAssociationSettings,
  saveAssociationSettings,
} from "@/lib/services/association-settings";
import { webAuditActor } from "@/lib/services/audit";

export async function GET() {
  try {
    await requireApiRole("admin");
    return NextResponse.json({ settings: await getAssociationSettings() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const settings = await saveAssociationSettings(
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return handleApiError(error);
  }
}
