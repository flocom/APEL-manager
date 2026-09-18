import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import { rattraperCotisations } from "@/lib/services/cotisations";

/**
 * Porte aux comptes les adhésions déjà encaissées mais jamais écrites. Les
 * écritures naissent en brouillon : une reprise de masse validée d'emblée
 * serait immuable, donc irrattrapable en cas d'erreur de sélection.
 */
export async function POST(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const bilan = await rattraperCotisations(
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, ...bilan });
  } catch (error) {
    return handleApiError(error);
  }
}
