import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, requireApiUser } from "@/lib/auth/guards";
import { clearSessionCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { oauthTokens, users } from "@/lib/db/schema";
import { recordAudit, webAuditActor } from "@/lib/services/audit";

/**
 * « Se déconnecter de tous les appareils ».
 *
 * Le compteur de sessions avance : tous les jetons émis jusque-là, celui de ce
 * navigateur compris, cessent de valoir à la requête suivante — c'est le même
 * mécanisme qu'un changement de mot de passe, sans avoir à en changer. Pour
 * l'ordinateur d'une salle des professeurs où l'on a oublié de se
 * déconnecter, ou un téléphone perdu.
 *
 * Les connecteurs MCP autorisés tombent aussi : une session détournée a pu en
 * autoriser un, et il survivrait sinon à la déconnexion. Ils se reconnectent
 * en repassant par l'écran d'autorisation.
 */
export async function DELETE(req: Request) {
  try {
    const user = await requireApiUser();

    await db
      .update(users)
      .set({ sessionEpoch: sql`${users.sessionEpoch} + 1` })
      .where(eq(users.id, user.id));
    const connecteurs = await db
      .update(oauthTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(oauthTokens.userId, user.id), isNull(oauthTokens.revokedAt)),
      )
      .returning({ id: oauthTokens.id });

    await recordAudit(
      webAuditActor(user.id, req),
      "user.sessions_revoked",
      "user",
      user.id,
      { oauthTokensRevoked: connecteurs.length },
    );

    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
