import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { checklistTemplates } from "@/lib/db/schema";
import { recordAudit, webAuditActor } from "@/lib/services/audit";
import { normalizeTemplateTasks } from "@/lib/templates";
import { emptyToNull } from "@/lib/utils";
import { templateSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const user = await requireApiRole("manager");
    const data = templateSchema.parse(await req.json());

    const tasks = normalizeTemplateTasks(data.tasks);
    const [created] = await db
      .insert(checklistTemplates)
      .values({
        name: data.name,
        description: emptyToNull(data.description),
        tasks,
      })
      .returning({ id: checklistTemplates.id });

    await recordAudit(
      webAuditActor(user.id, req),
      "template.create",
      "checklist_template",
      created.id,
      { taskCount: tasks.length },
    );
    revalidateTag("templates");
    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    return handleApiError(error);
  }
}
