import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import {
  deleteAccountingCategory,
  updateAccountingCategory,
} from "@/lib/services/accounting";
import { webAuditActor } from "@/lib/services/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseId(id: string) {
  return z.string().uuid("Identifiant de catégorie invalide.").parse(id);
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("admin");
    const { id: rawId } = await params;
    const id = parseId(rawId);
    const category = await updateAccountingCategory(
      id,
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, category });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("admin");
    const { id: rawId } = await params;
    const id = parseId(rawId);
    await deleteAccountingCategory(id, webAuditActor(user.id, req));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
