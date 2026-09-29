import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import { analyzeBankImport } from "@/lib/services/bank-imports";

// La lecture des PDF (pdfjs) a besoin de Node.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const analysis = await analyzeBankImport(
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, analysis });
  } catch (error) {
    return handleApiError(error);
  }
}
