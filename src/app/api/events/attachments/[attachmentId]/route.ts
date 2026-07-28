import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import { deleteEventAttachment } from "@/lib/services/event-attachments";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ attachmentId: string }> };

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const { attachmentId } = await params;
    await deleteEventAttachment(attachmentId, webAuditActor(user.id, req));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
