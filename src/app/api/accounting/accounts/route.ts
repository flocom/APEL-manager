import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import {
  createFinancialAccount,
  listFinancialAccounts,
} from "@/lib/services/accounting";
import { webAuditActor } from "@/lib/services/audit";

export async function GET() {
  try {
    await requireApiRole("admin");
    const items = await listFinancialAccounts();
    return NextResponse.json({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const account = await createFinancialAccount(
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, account }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
