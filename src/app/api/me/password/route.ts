import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiUser } from "@/lib/auth/guards";
import {
  assertAcceptablePassword,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { clientIpAddress } from "@/lib/client-ip";
import { db } from "@/lib/db";
import { oauthTokens, passwordResetTokens, users } from "@/lib/db/schema";
import {
  delaiLisible,
  hitRateLimitStages,
  ipKey,
  passwordAttemptStages,
  rateLimitError,
} from "@/lib/services/rate-limit";
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
    if (!user) throw new HttpError(401, "Vous devez être connecté.");

    // Une session volée ne doit pas servir à deviner le mot de passe actuel
    // tranquillement : les essais d'ici comptent avec ceux de la connexion,
    // pour la même adresse et avec les mêmes étapes. Comptés avant la
    // vérification, rendus s'il était bon — comme à la connexion, pour que
    // des envois simultanés ne passent pas tous sous le plafond.
    const essai = await hitRateLimitStages(
      passwordAttemptStages(user.email, ipKey(clientIpAddress(req))),
    );
    if (!essai.verdict.ok) {
      throw rateLimitError(
        essai.verdict,
        `Trop de tentatives avec un mot de passe incorrect. Réessayez ${delaiLisible(essai.verdict.retryAfterSeconds)}.`,
      );
    }
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new HttpError(400, "Mot de passe actuel incorrect.");
    }
    await essai.release();
    if (newPassword === currentPassword) {
      throw new HttpError(
        400,
        "Le nouveau mot de passe doit être différent de l’actuel.",
      );
    }
    await assertAcceptablePassword(newPassword, user.email);

    const [updated] = await db
      .update(users)
      .set({
        passwordHash: await hashPassword(newPassword),
        sessionEpoch: sql`${users.sessionEpoch} + 1`,
      })
      .where(eq(users.id, user.id))
      .returning({ sessionEpoch: users.sessionEpoch });

    // Un changement de mot de passe révoque aussi toutes les connexions MCP
    // existantes, y compris les refresh tokens de longue durée.
    await db
      .update(oauthTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(oauthTokens.userId, user.id),
          isNull(oauthTokens.revokedAt),
        ),
      );

    // Un lien de réinitialisation encore dans une boîte ne doit pas pouvoir
    // défaire, après coup, le mot de passe qu'on vient de choisir.
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt),
        ),
      );

    // On ré-émet la session de l'appareil courant (sinon l'utilisateur se
    // déconnecte lui-même) ; les autres sessions sont invalidées.
    await createSession(user.id, updated.sessionEpoch);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
