import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, HttpError } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { volunteerSignups } from "@/lib/db/schema";

const schema = z.object({ token: z.string().min(8) });

export async function POST(req: Request) {
  try {
    const { token } = schema.parse(await req.json());
    const [deleted] = await db
      .delete(volunteerSignups)
      .where(eq(volunteerSignups.cancelToken, token))
      .returning({ id: volunteerSignups.id });
    if (!deleted) {
      throw new HttpError(404, "Inscription introuvable ou déjà annulée.");
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
