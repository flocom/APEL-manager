import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { checklistTemplates } from "@/lib/db/schema";
import { normalizeTemplateTasks } from "@/lib/templates";
import { emptyToNull } from "@/lib/utils";
import { templateSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    await requireApiRole("manager");
    const data = templateSchema.parse(await req.json());

    const [created] = await db
      .insert(checklistTemplates)
      .values({
        name: data.name,
        description: emptyToNull(data.description),
        tasks: normalizeTemplateTasks(data.tasks),
      })
      .returning({ id: checklistTemplates.id });

    revalidateTag("templates");
    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    return handleApiError(error);
  }
}
