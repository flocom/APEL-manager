import { NextResponse } from "next/server";

import { handleApiError, requireApiUser } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import { toggleSelfAssignment } from "@/lib/services/tasks";

type Params = { params: Promise<{ id: string }> };

/**
 * Bascule l'auto-assignation du membre courant sur une tâche (« Je m'en
 * charge » / « Me retirer »). Les règles — pas sur une tâche terminée, pas
 * sur un événement annulé, pas de retrait d'une tâche faite — et la trace au
 * journal sont dans le service.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireApiUser();
    const { id: taskId } = await params;
    const { assigned } = await toggleSelfAssignment(
      taskId,
      user,
      webAuditActor(user.id, req),
    );
    return NextResponse.json({ ok: true, assigned });
  } catch (error) {
    return handleApiError(error);
  }
}
