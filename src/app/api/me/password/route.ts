import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiUser } from "@/lib/auth/guards";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { passwordChangeSchema } from "@/lib/validation";

export async function PATCH(req: Request) {
  try {
    const sessionUser = await requireApiUser();
    const { currentPassword, newPassword } = passwordChangeSchema.parse(
      await req.json(),
    );

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, sessionUser.id))
      .limit(1);
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new HttpError(400, "Mot de passe actuel incorrect.");
    }

    const [updated] = await db
      .update(users)
      .set({
        passwordHash: await hashPassword(newPassword),
        sessionEpoch: sql`${users.sessionEpoch} + 1`,
      })
      .where(eq(users.id, user.id))
      .returning({ sessionEpoch: users.sessionEpoch });

    // On ré-émet la session de l'appareil courant (sinon l'utilisateur se
    // déconnecte lui-même) ; les autres sessions sont invalidées.
    await createSession(user.id, updated.sessionEpoch);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
