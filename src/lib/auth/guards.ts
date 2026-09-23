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

/**
 * Exige le numéro de version (verrou optimiste) dans le corps d'une écriture.
 *
 * Pour les routes dont l'écran envoie TOUJOURS la version qu'il a chargée. La
 * laisser facultative, c'était garder une porte où l'écriture passait sans
 * contrôle : un onglet resté ouvert, un script, un client écrit à la main
 * écrasaient en silence ce qu'un autre venait d'enregistrer. Les outils MCP,
 * qui relisent la ligne avant d'écrire, gardent leur version facultative ; ils
 * n'appellent pas ces routes.
 *
 * 428 (« précondition requise ») plutôt que 400 : la requête est bien formée,
 * il lui manque la preuve qu'elle part de la dernière version.
 */
export function requireVersion(body: unknown): number {
  const version =
    body && typeof body === "object"
      ? (body as { version?: unknown }).version
      : undefined;
  const nombre =
    typeof version === "string" && version.trim() !== ""
      ? Number(version)
      : version;
  if (
    typeof nombre !== "number" ||
    !Number.isInteger(nombre) ||
    nombre < 0
  ) {
    throw new HttpError(
      428,
      "Version manquante : rechargez la page, puis refaites votre modification.",
    );
  }
  return nombre;
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
