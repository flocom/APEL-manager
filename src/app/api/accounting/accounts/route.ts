import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { financialAccounts } from "@/lib/db/schema";
import { webAuditActor, recordAudit } from "@/lib/services/audit";
import { emptyToNull } from "@/lib/utils";
import { financialAccountSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireApiRole("admin");
    const items = await db
      .select()
      .from(financialAccounts)
      .orderBy(asc(financialAccounts.name));
    return NextResponse.json({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiRole("admin");
    const data = financialAccountSchema.parse(await req.json());
    const [account] = await db
      .insert(financialAccounts)
      .values({
        name: data.name,
        type: data.type,
        description: emptyToNull(data.description),
        isActive: data.isActive,
      })
      .returning();
    await recordAudit(
      webAuditActor(user.id, req),
      "accounting.account_create",
      "financial_account",
      account.id,
    );
    return NextResponse.json({ ok: true, account }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
