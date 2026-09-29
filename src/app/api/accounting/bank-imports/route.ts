import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import {
  commitBankImport,
  listBankStatementImports,
} from "@/lib/services/bank-imports";

// L'enregistrement relit les PDF (pdfjs) : il a besoin de Node.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireApiRole("admin");
    const items = await listBankStatementImports();
    return NextResponse.json({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const result = await commitBankImport(
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
