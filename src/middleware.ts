import { NextResponse, type NextRequest } from "next/server";

import { REQUESTED_PATH_HEADER } from "@/lib/auth/return-path";

/**
 * Transmet aux gardes serveur l'adresse de la page demandée.
 *
 * Ni `headers()` ni les paramètres d'une page ne donnent l'URL entière qui l'a
 * fait rendre. Sans elle, `requireUser` ne savait renvoyer que vers « /login »,
 * et le lien d'un e-mail finissait sur l'accueil une fois connecté. Le
 * middleware, lui, voit la requête : il en recopie le chemin et la requête
 * dans un en-tête que la garde lit.
 *
 * L'en-tête est toujours réécrit, jamais complété : une valeur envoyée par le
 * navigateur est écrasée. La garde la refiltre de toute façon
 * (lib/auth/return-path.ts) ; au pire, un en-tête forgé ramènerait sur une
 * autre page du même site.
 *
 * Rien d'autre ici — ni base, ni cryptographie : ce code tourne à chaque
 * navigation dans l'espace de gestion.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const params = new URLSearchParams(search);
  // Paramètre interne des navigations côté client. Next le retire déjà de ce
  // qu'il montre au middleware ; s'il passait quand même, la connexion
  // ramènerait sur la réponse RSC brute au lieu de la page.
  params.delete("_rsc");
  const query = params.toString();

  const headers = new Headers(request.headers);
  headers.set(REQUESTED_PATH_HEADER, query ? `${pathname}?${query}` : pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Les seules pages gardées par `requireUser` / `requireRole`. `:path*`
  // couvre aussi « /dashboard » lui-même.
  matcher: ["/dashboard/:path*"],
};
