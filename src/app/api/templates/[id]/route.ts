import { and, eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  handleApiError,
  HttpError,
  requireApiRole,
  requireVersion,
} from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { checklistTemplates } from "@/lib/db/schema";
import { recordAudit, webAuditActor } from "@/lib/services/audit";
import { normalizeTemplateTasks } from "@/lib/templates";
import { emptyToNull } from "@/lib/utils";
import { templateSchema } from "@/lib/validation";

const CONFLICT =
  "Ce modèle a été modifié entre-temps. Rechargez la page pour repartir de la dernière version.";

type Params = { params: Promise<{ id: string }> };

/** Valide l'id d'URL en UUID pour renvoyer un 404 propre (plutôt qu'un 500). */
async function getValidId(params: Params["params"]): Promise<string> {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    throw new HttpError(404, "Modèle introuvable.");
  }
  return id;
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const id = await getValidId(params);
    const body = await req.json();
    // Verrou optimiste obligatoire : l'éditeur réécrit toute la liste de
    // tâches, donc deux éditions simultanées s'écraseraient. L'éditeur envoie
    // toujours sa version ; une écriture sans elle n'avait aucune raison
    // légitime de passer.
    const version = requireVersion(body);
    const data = templateSchema.parse(body);

    const fields = {
      name: data.name,
      description: emptyToNull(data.description),
      tasks: normalizeTemplateTasks(data.tasks),
    };

    const [updated] = await db
      .update(checklistTemplates)
      .set({ ...fields, version: sql`${checklistTemplates.version} + 1` })
      .where(
        and(
          eq(checklistTemplates.id, id),
          eq(checklistTemplates.version, version),
        ),
      )
      .returning({ id: checklistTemplates.id });
    if (!updated) {
      const [exists] = await db
        .select({ v: checklistTemplates.version })
        .from(checklistTemplates)
        .where(eq(checklistTemplates.id, id))
        .limit(1);
      if (!exists) throw new HttpError(404, "Modèle introuvable.");
      throw new HttpError(409, CONFLICT);
    }
    await recordAudit(
      webAuditActor(user.id, req),
      "template.update",
      "checklist_template",
      id,
      { taskCount: fields.tasks.length },
    );
    revalidateTag("templates");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const id = await getValidId(params);
    const [deleted] = await db
      .delete(checklistTemplates)
      .where(eq(checklistTemplates.id, id))
      .returning({ id: checklistTemplates.id, name: checklistTemplates.name });
    if (!deleted) throw new HttpError(404, "Modèle introuvable.");
    await recordAudit(
      webAuditActor(user.id, req),
      "template.delete",
      "checklist_template",
      id,
      { name: deleted.name },
    );
    revalidateTag("templates");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
