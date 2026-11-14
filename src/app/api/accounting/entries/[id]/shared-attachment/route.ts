import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { shareEntryAttachment } from "@/lib/services/accounting-receipts";
import { webAuditActor } from "@/lib/services/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ sourceEntryId: z.string().uuid() });

/**
 * Donne à l'écriture le justificatif que porte déjà `sourceEntryId` : un
 * justificatif commun à plusieurs écritures. Refusé (409) si l'écriture en a
 * déjà un, ou si l'autre n'en a plus.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("admin");
    const { id } = await params;
    const { sourceEntryId } = bodySchema.parse(await req.json());
    await shareEntryAttachment(id, sourceEntryId, webAuditActor(user.id, req));
    return NextResponse.json({ ok: true, entryId: id });
  } catch (error) {
    return handleApiError(error);
  }
}
