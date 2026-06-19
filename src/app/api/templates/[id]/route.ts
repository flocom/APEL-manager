import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { checklistTemplates } from "@/lib/db/schema";
import { normalizeTemplateTasks } from "@/lib/templates";
import { emptyToNull } from "@/lib/utils";
import { templateSchema } from "@/lib/validation";

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
    await requireApiRole("manager");
    const id = await getValidId(params);
    const data = templateSchema.parse(await req.json());

    const [updated] = await db
      .update(checklistTemplates)
      .set({
        name: data.name,
        description: emptyToNull(data.description),
        tasks: normalizeTemplateTasks(data.tasks),
      })
      .where(eq(checklistTemplates.id, id))
      .returning({ id: checklistTemplates.id });

    if (!updated) throw new HttpError(404, "Modèle introuvable.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireApiRole("manager");
    const id = await getValidId(params);
    const [deleted] = await db
      .delete(checklistTemplates)
      .where(eq(checklistTemplates.id, id))
      .returning({ id: checklistTemplates.id });
    if (!deleted) throw new HttpError(404, "Modèle introuvable.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
