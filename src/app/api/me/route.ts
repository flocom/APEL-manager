import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, requireApiUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { emptyToNull } from "@/lib/utils";

const selfUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  telegramChatId: z.string().trim().max(60).nullable().optional(),
});

export async function PATCH(req: Request) {
  try {
    const user = await requireApiUser();
    const data = selfUpdateSchema.parse(await req.json());

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.telegramChatId !== undefined) {
      updates.telegramChatId = emptyToNull(data.telegramChatId);
    }

    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, user.id));
      revalidateTag("members"); // nom/telegram visibles dans la liste des membres
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
