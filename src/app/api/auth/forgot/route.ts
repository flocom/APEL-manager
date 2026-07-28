import { and, eq, isNull } from "drizzle-orm";
import { NextResponse, after } from "next/server";

import { handleApiError } from "@/lib/auth/guards";
import { getBaseUrl } from "@/lib/base-url";
import { db } from "@/lib/db";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/notifications/email";
import { passwordResetEmail } from "@/lib/notifications/emails";
import { getAssociationSettings } from "@/lib/services/association-settings";
import { generateToken, hashToken } from "@/lib/tokens";
import { forgotSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const { email } = forgotSchema.parse(await req.json());
    const baseUrl = await getBaseUrl();

    // Le travail (lookup + e-mail) est fait APRÈS la réponse, pour que les deux
    // cas (compte existant ou non) répondent en un temps identique — pas
    // d'énumération par chronométrage. On répond toujours « ok ».
    after(async () => {
      try {
        const [user] = await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (!user) return;

        // Invalide les éventuels jetons encore valides de cet utilisateur.
        await db
          .update(passwordResetTokens)
          .set({ usedAt: new Date() })
          .where(
            and(
              eq(passwordResetTokens.userId, user.id),
              isNull(passwordResetTokens.usedAt),
            ),
          );

        const token = generateToken(32);
        await db.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 heure
        });

        const association = await getAssociationSettings();
        const mail = passwordResetEmail({
          name: user.name,
          resetUrl: `${baseUrl}/reset/${token}`,
          identity: {
            associationName: association.associationName,
            schoolName: association.schoolName,
            rna: association.rna,
          },
        });
        await sendEmail({ to: email, ...mail });
      } catch (err) {
        console.error("[forgot] échec de l'envoi:", err);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
