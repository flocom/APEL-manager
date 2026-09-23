import { NextResponse } from "next/server";

import {
  handleApiError,
  HttpError,
  requireApiRole,
  requireVersion,
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
    const body = await req.json();
    // La fiche envoie toujours la version qu'elle a chargée ; le service, que
    // partagent les outils MCP, la laisse facultative pour eux seuls.
    requireVersion(body);
    const member = await updateAssociationMember(
      id,
      body,
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
