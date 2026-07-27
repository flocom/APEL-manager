import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import {
  createAssociationDocument,
  listAssociationDocuments,
} from "@/lib/services/documents";

export async function GET(req: Request) {
  try {
    await requireApiRole("manager");
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? "200");
    return NextResponse.json({
      items: await listAssociationDocuments(limit),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiRole("manager");
    const document = await createAssociationDocument(
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, document }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
