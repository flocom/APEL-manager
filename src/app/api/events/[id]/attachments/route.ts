import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import {
  createEventAttachment,
  listEventAttachments,
} from "@/lib/services/event-attachments";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireApiRole("manager");
    const { id } = await params;
    return NextResponse.json({ items: await listEventAttachments(id) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const { id } = await params;
    const attachment = await createEventAttachment(
      id,
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, attachment }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
