import { NextResponse } from "next/server";
import { ZodError } from "zod";

import type { Role } from "@/lib/db/schema";

import { hasRole } from "./roles";
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

export async function requireApiUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Vous devez être connecté.");
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
