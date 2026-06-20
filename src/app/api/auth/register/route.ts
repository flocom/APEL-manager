import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { hashPassword } from "@/lib/auth/password";
import { handleApiError, HttpError } from "@/lib/auth/guards";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { registerSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const { name, email, password } = registerSchema.parse(await req.json());

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing.length > 0) {
      throw new HttpError(409, "Un compte existe déjà avec cette adresse e-mail.");
    }

    // Le tout premier compte créé devient administrateur.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    const role = count === 0 ? "admin" : "member";

    const passwordHash = await hashPassword(password);
    const [created] = await db
      .insert(users)
      .values({ name, email, passwordHash, role })
      .returning({ id: users.id, role: users.role });

    await createSession(created.id, 0);
    return NextResponse.json({ ok: true, role: created.role });
  } catch (error) {
    return handleApiError(error);
  }
}
