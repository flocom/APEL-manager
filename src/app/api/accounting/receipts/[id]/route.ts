import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import {
  deleteReceipt,
  receiptView,
  updateReceipt,
} from "@/lib/services/accounting-receipts";
import { webAuditActor } from "@/lib/services/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** `{ label?, amountCents?, receiptDate?: "AAAA-MM-JJ" | null, version }`. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("admin");
    const { id } = await params;
    const receipt = await updateReceipt(
      id,
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ receipt: receiptView(receipt) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("admin");
    const { id } = await params;
    await deleteReceipt(id, webAuditActor(user.id, req));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
