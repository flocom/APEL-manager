import { NextResponse } from "next/server";

import {
  handleApiError,
  HttpError,
  requireApiRole,
} from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import {
  archiveAssociationDocument,
  getAssociationDocument,
  renderPrintableDocument,
  updateAssociationDocument,
} from "@/lib/services/documents";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    await requireApiRole("manager");
    const { id } = await params;
    const document = await getAssociationDocument(id);
    if (!document) throw new HttpError(404, "Document introuvable.");
    if (new URL(req.url).searchParams.get("format") === "print") {
      return new NextResponse(renderPrintableDocument(document), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return NextResponse.json({ document });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const { id } = await params;
    const document = await updateAssociationDocument(
      id,
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, document });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const { id } = await params;
    const document = await archiveAssociationDocument(
      id,
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, document, archived: true });
  } catch (error) {
    return handleApiError(error);
  }
}
