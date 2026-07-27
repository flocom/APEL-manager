import { NextResponse } from "next/server";

import {
  handleApiError,
  HttpError,
  requireApiRole,
} from "@/lib/auth/guards";
import {
  archiveAssociationMember,
  getAssociationMember,
  updateAssociationMember,
} from "@/lib/services/adherents";
import { webAuditActor } from "@/lib/services/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireApiRole("admin");
    const { id } = await params;
    const member = await getAssociationMember(id);
    if (!member) throw new HttpError(404, "Adhérent introuvable.");
    return NextResponse.json({ member });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("admin");
    const { id } = await params;
    const member = await updateAssociationMember(
      id,
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, member });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("admin");
    const { id } = await params;
    const member = await archiveAssociationMember(
      id,
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, member, archived: true });
  } catch (error) {
    return handleApiError(error);
  }
}
