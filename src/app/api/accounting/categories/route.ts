import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { accountingCategories } from "@/lib/db/schema";
import { webAuditActor, recordAudit } from "@/lib/services/audit";
import { emptyToNull } from "@/lib/utils";
import { accountingCategorySchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireApiRole("admin");
    const items = await db
      .select()
      .from(accountingCategories)
      .orderBy(asc(accountingCategories.name));
    return NextResponse.json({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const data = accountingCategorySchema.parse(await req.json());
    const [category] = await db
      .insert(accountingCategories)
      .values({
        name: data.name,
        type: data.type,
        description: emptyToNull(data.description),
        isActive: data.isActive,
      })
      .returning();
    await recordAudit(
      webAuditActor(user.id, req),
      "accounting.category_create",
      "accounting_category",
      category.id,
    );
    return NextResponse.json({ ok: true, category }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
