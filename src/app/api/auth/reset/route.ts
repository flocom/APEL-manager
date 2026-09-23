import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, HttpError } from "@/lib/auth/guards";
import {
  assertAcceptablePassword,
  hashPassword,
} from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { clientIpAddress } from "@/lib/client-ip";
import { db } from "@/lib/db";
import { oauthTokens, passwordResetTokens, users } from "@/lib/db/schema";
import { clearPasswordAttempts, ipKey } from "@/lib/services/rate-limit";
import { hashToken } from "@/lib/tokens";
import { resetPasswordSchema } from "@/lib/validation";

/**
 * Nouveau mot de passe, depuis le lien reçu par e-mail.
 *
 * Le lien prouve qu'on tient la boîte : la session s'ouvre ici, sans repasser
 * par la connexion. La connexion peut en effet être bloquée pour cette
 * adresse — quelqu'un d'autre a pu la taper dix fois avec un faux mot de
 * passe —, et c'est justement vers ce lien que renvoie son message de refus.
 */
export async function POST(req: Request) {
  try {
    const { token, password } = resetPasswordSchema.parse(await req.json());
    const tokenHash = hashToken(token);

    const [row] = await db
      .select({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
        email: users.email,
      })
      .from(passwordResetTokens)
      .innerJoin(users, eq(users.id, passwordResetTokens.userId))
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

    // Après le lien : un jeton inventé n'apprend rien de la règle, et
    // l'adresse du compte sert à refuser un mot de passe qui la reprendrait.
    await assertAcceptablePassword(password, row.email);

    const now = new Date();
    // Le jeton est réclamé d'abord, sous condition : deux envois simultanés du
    // même lien ne changent pas deux fois le mot de passe.
    const [reclame] = await db
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.id, row.id),
          isNull(passwordResetTokens.usedAt),
        ),
      )
      .returning({ id: passwordResetTokens.id });
    if (!reclame) {
      throw new HttpError(400, "Lien invalide ou expiré. Refaites une demande.");
    }

    const [misAJour] = await db
      .update(users)
      .set({
        passwordHash: await hashPassword(password),
        // Invalide toutes les sessions émises avant cette réinitialisation.
        sessionEpoch: sql`${users.sessionEpoch} + 1`,
      })
      .where(eq(users.id, row.userId))
      .returning({ sessionEpoch: users.sessionEpoch });
    // Les autres liens encore valables tombent avec celui-ci. Une demande
    // nouvelle ne les annule plus (voir /api/auth/forgot) ; une fois le mot de
    // passe choisi, un lien resté dans une boîte n'a plus rien à ouvrir.
    await db
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, row.userId),
          isNull(passwordResetTokens.usedAt),
        ),
      );
    await db
      .update(oauthTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(oauthTokens.userId, row.userId),
          isNull(oauthTokens.revokedAt),
        ),
      );

    // Les essais ratés comptés contre cette adresse tombent : sans quoi le
    // blocage survivait au nouveau mot de passe, sur ses autres appareils.
    await clearPasswordAttempts(row.email, ipKey(clientIpAddress(req)));
    if (misAJour) await createSession(row.userId, misAJour.sessionEpoch);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
