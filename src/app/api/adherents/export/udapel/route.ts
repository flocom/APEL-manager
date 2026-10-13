import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import { exportUdapel } from "@/lib/services/udapel-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tableau des familles adhérentes au format de l'Apel départementale.
 * `GET /api/adherents/export/udapel?schoolYear=2026-2027`
 */
export async function GET(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const params = new URL(req.url).searchParams;
    const file = await exportUdapel(
      { schoolYear: params.get("schoolYear") || undefined },
      webAuditActor(user.id, req),
    );
    return new Response(file.body, {
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
