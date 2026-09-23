import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, HttpError } from "@/lib/auth/guards";
import { dummyPasswordHash, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { clientIpAddress } from "@/lib/client-ip";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  delaiLisible,
  hitRateLimitStages,
  ipKey,
  passwordAttemptStages,
  rateLimitError,
} from "@/lib/services/rate-limit";
import { loginSchema } from "@/lib/validation";

// Le leurre se calcule dès le chargement de la route, pas à la première
// adresse inconnue : cette connexion-là paierait sinon deux calculs au lieu
// d'un, et se distinguerait encore au chronomètre.
void dummyPasswordHash();

/**
 * Connexion.
 *
 * Les essais sont comptés par connexion, par adresse saisie depuis cette
 * connexion, puis par adresse tout court : sans plafond, rien n'empêchait
 * d'essayer un dictionnaire entier sur le compte d'un trésorier. Le compte se
 * fait sur l'adresse *saisie*, qu'elle ait un compte ou non, et avant toute
 * recherche : une adresse inconnue est bloquée exactement comme une adresse
 * connue, au même moment et avec le même message.
 *
 * L'essai est compté avant de vérifier le mot de passe, puis rendu s'il était
 * bon : seuls les échecs restent — se tromper deux fois puis réussir ne
 * rapproche de rien. Compter après coup laissait des centaines d'essais
 * simultanés lire tous le même compteur, encore bas, et passer ensemble.
 */
export async function POST(req: Request) {
  try {
    const { email, password } = loginSchema.parse(await req.json());
    const ip = ipKey(clientIpAddress(req));

    const essai = await hitRateLimitStages(passwordAttemptStages(email, ip));
    if (!essai.verdict.ok) {
      throw rateLimitError(
        essai.verdict,
        `Trop de tentatives de connexion. Réessayez ${delaiLisible(essai.verdict.retryAfterSeconds)}, ou choisissez un nouveau mot de passe depuis « Mot de passe oublié ».`,
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // La vérification a lieu même sans compte : `verifyPassword` compare
    // alors au leurre. Refuser tout de suite une adresse inconnue répondait
    // vingt fois plus vite qu'un mauvais mot de passe, et disait donc, au
    // chronomètre, quelles adresses ont un compte.
    const valide = await verifyPassword(password, user?.passwordHash);
    if (!user || !valide) {
      // L'essai reste compté dans les deux cas, adresse connue ou non : même
      // coût, même plafond, rien à lire dans la différence.
      throw new HttpError(401, "Adresse e-mail ou mot de passe incorrect.");
    }

    await essai.release();
    await createSession(user.id, user.sessionEpoch);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
