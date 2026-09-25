import { NextResponse } from "next/server";

import {
  handleApiError,
  HttpError,
  requireApiRole,
  requireVersion,
} from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import {
  archiveAssociationDocument,
  deleteArchivedAgMinutes,
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
    const requete = new URL(req.url).searchParams;
    if (requete.get("format") === "print") {
      // `auto=0` sert l'aperçu affiché dans l'éditeur : sans lui, la boîte
      // d'impression du navigateur s'ouvrirait à chaque rendu de l'iframe.
      const auto = requete.get("auto") !== "0";
      return new NextResponse(
        await renderPrintableDocument(document, { auto }),
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            // `default-src 'none'` bloque les images en silence : l'erreur
            // n'apparaît qu'en console, et le logo disparaît sans rien dire.
            "Content-Security-Policy":
              "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
            "X-Content-Type-Options": "nosniff",
            // Comme les pages (src/middleware.ts) : derrière Cloudflare, les
            // adresses e-mail du document seraient remplacées par
            // « [email protected] », et le script qui les rétablit bloqué
            // par la CSP ci-dessus. Le papier garderait le masque.
            "Cache-Control": "private, no-store, no-transform",
          },
        },
      );
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
    const body = await req.json();
    // Le formulaire comme l'éditeur de PV envoient toujours leur version ; le
    // service, que partagent les outils MCP, la laisse facultative pour eux.
    requireVersion(body);
    const document = await updateAssociationDocument(
      id,
      body,
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
    const actor = webAuditActor(user.id, req);
    if (new URL(req.url).searchParams.get("permanent") === "true") {
      const document = await deleteArchivedAgMinutes(id, actor);
      return NextResponse.json({ ok: true, document, deleted: true });
    }
    const document = await archiveAssociationDocument(
      id,
      actor,
    );
    return NextResponse.json({ ok: true, document, archived: true });
  } catch (error) {
    return handleApiError(error);
  }
}
