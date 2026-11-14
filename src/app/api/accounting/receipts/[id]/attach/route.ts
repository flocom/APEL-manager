import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import {
  attachReceipt,
  ECRITURES_PAR_RECU_MAX,
} from "@/lib/services/accounting-receipts";
import { webAuditActor } from "@/lib/services/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// `entryId` : une écriture ; `entryIds` : plusieurs, qui partagent le reçu.
const bodySchema = z.union([
  z.object({ entryId: z.string().uuid() }),
  z.object({
    entryIds: z.array(z.string().uuid()).min(1).max(ECRITURES_PAR_RECU_MAX),
  }),
]);

/**
 * Fait du reçu le justificatif des écritures choisies — y compris validées,
 * pourvu qu'aucune n'en ait déjà un (409 sinon) — et le retire de la boîte.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("admin");
    const { id } = await params;
    const body = bodySchema.parse(await req.json());
    const entryIds = "entryIds" in body ? body.entryIds : [body.entryId];
    await attachReceipt(id, entryIds, webAuditActor(user.id, req));
    return NextResponse.json({ ok: true, entryIds });
  } catch (error) {
    return handleApiError(error);
  }
}
