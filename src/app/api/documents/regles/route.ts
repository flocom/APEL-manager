import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import { saveStatutoryRules } from "@/lib/services/documents";

export const dynamic = "force-dynamic";

/**
 * Fiche statutaire : ce que prévoient les statuts en matière d'assemblée.
 *
 * Point d'entrée distinct des réglages généraux, parce que le schéma de
 * ceux-ci remplace par leur valeur par défaut tous les champs absents : les y
 * mêler ferait effacer la fiche à chaque enregistrement de la configuration.
 */
export async function PATCH(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const regles = await saveStatutoryRules(
      await req.json(),
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, regles });
  } catch (error) {
    return handleApiError(error);
  }
}
