import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import {
  deleteVolunteerSlot,
  updateVolunteerSlot,
} from "@/lib/services/volunteer-signups";

type Params = { params: Promise<{ id: string }> };

/**
 * Modifie un créneau. Le verrou, le contrôle de la capacité face aux inscrits
 * et la trace au journal vivent dans le service, partagé avec l'outil MCP.
 */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const { id } = await params;
    const slot = await updateVolunteerSlot(
      id,
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, slot });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Supprime un créneau et ses inscriptions ; le journal en garde le compte. */
export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const { id } = await params;
    await deleteVolunteerSlot(id, webAuditActor(user.id, req));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
