import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import {
  getBankLinkOptions,
  relinkImportedEntry,
} from "@/lib/services/bank-imports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const idSchema = z.string().uuid();
const bodySchema = z.object({ targetEntryId: z.string().uuid() }).strict();

/**
 * Rapprochement après coup d'une écriture créée par un import de relevé :
 * l'opération du relevé et les écritures déjà saisies qui peuvent la recevoir.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    await requireApiRole("admin");
    const id = idSchema.parse((await params).id);
    return NextResponse.json({ ok: true, options: await getBankLinkOptions(id) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("admin");
    const id = idSchema.parse((await params).id);
    const { targetEntryId } = bodySchema.parse(await req.json());
    const result = await relinkImportedEntry(id, targetEntryId, webAuditActor(user.id, req));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}
