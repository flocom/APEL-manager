import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { volunteerSlots } from "@/lib/db/schema";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireApiRole("manager");
    const { id } = await params;
    await db.delete(volunteerSlots).where(eq(volunteerSlots.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
