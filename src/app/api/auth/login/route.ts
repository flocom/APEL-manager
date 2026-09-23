import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, HttpError } from "@/lib/auth/guards";
import { dummyPasswordHash, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { loginSchema } from "@/lib/validation";

// Le leurre se calcule dès le chargement de la route, pas à la première
// adresse inconnue : cette connexion-là paierait sinon deux calculs au lieu
// d'un, et se distinguerait encore au chronomètre.
void dummyPasswordHash();

export async function POST(req: Request) {
  try {
    const { email, password } = loginSchema.parse(await req.json());

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
      throw new HttpError(401, "Adresse e-mail ou mot de passe incorrect.");
    }

    await createSession(user.id, user.sessionEpoch);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
