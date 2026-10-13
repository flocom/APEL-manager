import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import { exportAdherents } from "@/lib/services/adherents-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liste des adhérents d'une année, en classeur Excel ou en CSV, pour l'APEL
 * départementale.
 * `GET /api/adherents/export?annee=2026-2027&format=xlsx&enAttente=1&autresEtablissements=1`
 */
export async function GET(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const params = new URL(req.url).searchParams;
    const file = await exportAdherents(
      {
        annee: params.get("annee"),
        format: params.get("format") ?? undefined,
        enAttente: params.get("enAttente") ?? undefined,
        autresEtablissements: params.get("autresEtablissements") ?? undefined,
      },
      webAuditActor(user.id, req),
    );
    return new Response(new Uint8Array(file.body), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
