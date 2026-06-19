import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { checklistTemplates } from "@/lib/db/schema";
import { DEFAULT_TEMPLATES } from "@/lib/templates";

export async function POST() {
  try {
    await requireApiRole("manager");

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

    return NextResponse.json({ ok: true, created: DEFAULT_TEMPLATES.length });
  } catch (error) {
    return handleApiError(error);
  }
}
