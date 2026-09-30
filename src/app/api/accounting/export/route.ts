import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { exportAccounting } from "@/lib/services/accounting-export";
import { webAuditActor } from "@/lib/services/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Export comptable téléchargé : FEC ou tableur, pour une période.
 * `GET /api/accounting/export?format=fec&from=2025-09-01&to=2026-08-31&siren=…`
 */
export async function GET(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const params = new URL(req.url).searchParams;
    const file = await exportAccounting(
      {
        format: params.get("format"),
        from: params.get("from"),
        to: params.get("to"),
        siren: params.get("siren") ?? undefined,
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
