import { NextResponse } from "next/server";

import {
  handleApiError,
  requireApiRole,
} from "@/lib/auth/guards";
import { isPublicScope, readUpload, uploadScopeFromId } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; name: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id, name } = await params;
    const scope = uploadScopeFromId(id);
    // Le logo s'affiche sur l'accueil, la page d'inscription et les écrans de
    // connexion : il doit rester lisible sans compte. Tous les autres scopes
    // restent privés.
    const isPublic = isPublicScope(scope);
    if (!isPublic) {
      await requireApiRole(scope === "accounting" ? "admin" : "manager");
    }
    const file = await readUpload(id, name);
    const fallbackName = file.filename.replace(/["\\\r\n]/g, "_");

    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.data.byteLength),
        "Content-Disposition": `${file.inline ? "inline" : "attachment"}; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        // L'identifiant change à chaque envoi : l'ancienne URL n'est jamais
        // réutilisée, le cache long est donc sans risque.
        "Cache-Control": isPublic
          ? "public, max-age=31536000, immutable"
          : "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        ...(isPublic ? {} : { "X-Robots-Tag": "noindex, nofollow" }),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
