import { NextResponse } from "next/server";
import { ZodError } from "zod";

import type { Role } from "@/lib/db/schema";
import { redactError } from "@/lib/errors";

import { hasRole, isApproved } from "./roles";
import { getCurrentUser, type SafeUser } from "./session";

/** Erreur HTTP transportant un statut, à intercepter dans les routes API. */
export class HttpError extends Error {
  /** Pour un 429 : dans combien de secondes réessayer (`Retry-After`). */
  readonly retryAfterSeconds?: number;

  constructor(
    public status: number,
    message: string,
    options: { retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = "HttpError";
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/**
 * Un utilisateur connecté ET validé. Le contrôle de validation vit ici, dans la
 * garde que toutes les routes appellent, plutôt que route par route : une
 * route ajoutée demain en hérite sans que personne ait à y penser.
 */
export async function requireApiUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Vous devez être connecté.");
  if (!isApproved(user)) {
    throw new HttpError(
      403,
      "Votre compte est en attente de validation par un administrateur de l'association.",
    );
  }
  return user;
}

export async function requireApiRole(min: Role): Promise<SafeUser> {
  const user = await requireApiUser();
  if (!hasRole(user, min)) {
    throw new HttpError(403, "Droits insuffisants pour cette action.");
  }
  return user;
}

/** Convertit une exception en réponse JSON normalisée. */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { error: error.message },
      {
        status: error.status,
        headers: error.retryAfterSeconds
          ? { "Retry-After": String(error.retryAfterSeconds) }
          : undefined,
      },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Données invalides", issues: error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  // `req.json()` sur un corps qui n'est pas du JSON : la faute est chez
  // l'appelant, pas au serveur. Le message de l'erreur recopie un morceau du
  // corps reçu : il ne va ni au journal ni dans la réponse.
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Données invalides : le corps de la requête n’est pas du JSON." },
      { status: 400 },
    );
  }
  // Jamais l'erreur brute : celle d'une requête SQL recopie toutes ses valeurs.
  console.error("[api] erreur inattendue:", redactError(error));
  return NextResponse.json(
    { error: "Une erreur serveur est survenue." },
    { status: 500 },
  );
}
