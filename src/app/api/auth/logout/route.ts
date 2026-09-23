import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/auth/guards";
import { destroySession } from "@/lib/auth/session";

/**
 * Déconnexion : la session est fermée côté serveur, pas seulement oubliée par
 * ce navigateur (voir `destroySession`). La vérification d'origine du
 * middleware s'applique ici aussi : sans elle, n'importe quel site pouvait
 * déconnecter un membre à son insu.
 */
export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
