import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import { evenementValide } from "@/lib/services/events";
import { createTask } from "@/lib/services/tasks";
import { taskSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

/**
 * Ajoute une tâche à la check-list. La transaction, le contrôle des
 * responsables (comptes validés seulement) et la ligne au journal vivent dans
 * le service, partagé avec l'outil MCP.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const { id: eventId } = await params;
    evenementValide(eventId);
    const data = taskSchema.parse(await req.json());
    const task = await createTask(eventId, data, webAuditActor(user.id, req));
    return NextResponse.json({ ok: true, id: task.id });
  } catch (error) {
    return handleApiError(error);
  }
}
