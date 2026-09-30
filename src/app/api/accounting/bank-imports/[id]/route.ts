import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import { undoBankImport } from "@/lib/services/bank-imports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseId(id: string) {
  return z.string().uuid("Identifiant d’import invalide.").parse(id);
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("admin");
    const { id: rawId } = await params;
    const id = parseId(rawId);
    await undoBankImport(id, webAuditActor(user.id, req));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
