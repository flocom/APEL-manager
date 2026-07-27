import { NextResponse } from "next/server";

import {
  handleApiError,
  HttpError,
  requireApiRole,
} from "@/lib/auth/guards";
import {
  deleteDraftAccountingEntry,
  getAccountingEntry,
  updateAccountingEntry,
} from "@/lib/services/accounting";
import { webAuditActor } from "@/lib/services/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireApiRole("admin");
    const { id } = await params;
    const entry = await getAccountingEntry(id);
    if (!entry) throw new HttpError(404, "Écriture comptable introuvable.");
    return NextResponse.json({ entry });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("admin");
    const { id } = await params;
    const entry = await updateAccountingEntry(
      id,
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("admin");
    const { id } = await params;
    await deleteDraftAccountingEntry(id, webAuditActor(user.id, req));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
