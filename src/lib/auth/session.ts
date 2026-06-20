import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";

import { db } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";

const COOKIE_NAME = "apel_session";
const ALG = "HS256";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 jours

/** Utilisateur sans le hash du mot de passe — sûr à exposer côté serveur. */
export type SafeUser = Omit<User, "passwordHash">;

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET est manquant ou trop court. Définissez une chaîne aléatoire d'au moins 32 caractères.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(
  userId: string,
  sessionEpoch: number,
): Promise<void> {
  const token = await new SignJWT({ sub: userId, epoch: sessionEpoch })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Lit le cookie de session, vérifie le JWT, puis recharge l'utilisateur depuis
 * la base (pour que les changements de rôle prennent effet immédiatement).
 *
 * Mémoïsé par `cache()` : plusieurs appels pendant le rendu d'une même requête
 * (layout + page, gardes…) ne déclenchent qu'une seule requête SQL.
 */
export const getCurrentUser = cache(async (): Promise<SafeUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  let userId: string;
  let tokenEpoch = 0;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.sub !== "string") return null;
    userId = payload.sub;
    tokenEpoch = typeof payload.epoch === "number" ? payload.epoch : 0;
  } catch {
    return null;
  }

  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = rows[0];
  if (!user) return null;

  // Session émise avant un changement de mot de passe → invalide.
  if (tokenEpoch !== user.sessionEpoch) return null;

  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
});
