import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, HttpError } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { oauthTokens, passwordResetTokens, users } from "@/lib/db/schema";
import { hashToken } from "@/lib/tokens";
import { resetPasswordSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const { token, password } = resetPasswordSchema.parse(await req.json());
    const tokenHash = hashToken(token);

    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!row) {
      throw new HttpError(400, "Lien invalide ou expiré. Refaites une demande.");
    }

    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(password),
        // Invalide toutes les sessions émises avant cette réinitialisation.
        sessionEpoch: sql`${users.sessionEpoch} + 1`,
      })
      .where(eq(users.id, row.userId));
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id));
    await db
      .update(oauthTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(oauthTokens.userId, row.userId),
          isNull(oauthTokens.revokedAt),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
