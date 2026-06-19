import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, HttpError } from "@/lib/auth/guards";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { loginSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const { email, password } = loginSchema.parse(await req.json());

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, "Adresse e-mail ou mot de passe incorrect.");
    }

    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
