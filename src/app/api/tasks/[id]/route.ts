import { NextResponse } from "next/server";

import {
  handleApiError,
  requireApiRole,
  requireApiUser,
  requireVersion,
} from "@/lib/auth/guards";
import { webAuditActor } from "@/lib/services/audit";
import {
  deleteTask,
  touchesTaskContent,
  updateTask,
} from "@/lib/services/tasks";
import { taskUpdateSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

/**
 * Modifie une tâche. Les règles — un membre ne change que l'avancement de ses
 * tâches, un organisateur tout — et la trace au journal vivent dans le service,
 * partagé avec les outils MCP.
 */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    const body = await req.json();
    const data = taskUpdateSchema.parse(body);

    // L'édition complète envoie toujours la version chargée par le formulaire :
    // sans elle, deux organisateurs s'écraseraient en silence. Le sélecteur
    // d'avancement, lui, ne touche que le statut et s'en passe.
    if (touchesTaskContent(data)) requireVersion(body);

    await updateTask(id, data, user, webAuditActor(user.id, req));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const { id } = await params;
    await deleteTask(id, webAuditActor(user.id, req));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
