import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import {
  createAssociationMember,
  listAssociationMembers,
} from "@/lib/services/adherents";
import { webAuditActor } from "@/lib/services/audit";

export async function GET() {
  try {
    await requireApiRole("admin");
    return NextResponse.json({ items: await listAssociationMembers() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const member = await createAssociationMember(
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, member }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
