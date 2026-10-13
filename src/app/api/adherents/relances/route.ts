import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import type { MemberRelanceResult } from "@/lib/member-info/types";
import { webAuditActor } from "@/lib/services/audit";
import { previewOrSendRelances } from "@/lib/services/member-update-requests";

export const dynamic = "force-dynamic";
// Jusqu'à 300 familles, cinq e-mails à la fois : plus que les dix secondes
// par défaut d'une fonction Vercel.
export const maxDuration = 300;

/**
 * Relance des fiches d'adhérents incomplètes d'une année scolaire.
 * `dryRun: true` ne fait que lister qui serait relancé (corps :
 * `MemberRelanceRequest`, réponse : `MemberRelanceResult`).
 */
export async function POST(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const result: MemberRelanceResult = await previewOrSendRelances(
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
