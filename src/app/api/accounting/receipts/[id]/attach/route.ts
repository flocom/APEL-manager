import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { attachReceipt } from "@/lib/services/accounting-receipts";
import { webAuditActor } from "@/lib/services/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ entryId: z.string().uuid() });

/**
 * Fait du reçu le justificatif de l'écriture `entryId` — y compris validée,
 * pourvu qu'elle n'en ait pas déjà un (409 sinon) — et le retire de la boîte.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("admin");
    const { id } = await params;
    const { entryId } = bodySchema.parse(await req.json());
    await attachReceipt(id, entryId, webAuditActor(user.id, req));
    return NextResponse.json({ ok: true, entryId });
  } catch (error) {
    return handleApiError(error);
  }
}
