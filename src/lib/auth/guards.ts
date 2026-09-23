import { NextResponse } from "next/server";
import { ZodError } from "zod";

import type { Role } from "@/lib/db/schema";

import { hasRole, isApproved } from "./roles";
import { getCurrentUser, type SafeUser } from "./session";

/** Erreur HTTP transportant un statut, à intercepter dans les routes API. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
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
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Données invalides", issues: error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  console.error("[api] erreur inattendue:", error);
  return NextResponse.json(
    { error: "Une erreur serveur est survenue." },
    { status: 500 },
  );
}
