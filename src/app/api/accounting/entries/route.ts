import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import {
  createAccountingEntry,
  getAccountingSummary,
  listAccountingEntries,
} from "@/lib/services/accounting";
import { webAuditActor } from "@/lib/services/audit";

export async function GET(req: Request) {
  try {
    await requireApiRole("admin");
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? "200");
    const [items, summary] = await Promise.all([
      listAccountingEntries(limit),
      getAccountingSummary(),
    ]);
    return NextResponse.json({ items, summary });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const entry = await createAccountingEntry(
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, entry }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
