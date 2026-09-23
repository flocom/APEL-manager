import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { checklistTemplates } from "@/lib/db/schema";
import { recordAudit, webAuditActor } from "@/lib/services/audit";
import { DEFAULT_TEMPLATES } from "@/lib/templates";

export async function POST(req: Request) {
  try {
    const user = await requireApiRole("manager");

    const existing = await db
      .select({ id: checklistTemplates.id })
      .from(checklistTemplates)
      .limit(1);
    if (existing.length > 0) {
      throw new HttpError(409, "Des modèles existent déjà.");
    }

    await db.insert(checklistTemplates).values(
      DEFAULT_TEMPLATES.map((t) => ({
        name: t.name,
        description: t.description,
        tasks: t.tasks,
      })),
    );

    await recordAudit(
      webAuditActor(user.id, req),
      "template.seed",
      "checklist_template",
      null,
      { created: DEFAULT_TEMPLATES.length },
    );
    revalidateTag("templates");
    return NextResponse.json({ ok: true, created: DEFAULT_TEMPLATES.length });
  } catch (error) {
    return handleApiError(error);
  }
}
