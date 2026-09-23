import { NextResponse, type NextRequest } from "next/server";

import { REQUESTED_PATH_HEADER } from "@/lib/auth/return-path";

/**
 * Trois choses, toutes sans base ni cryptographie coûteuse : ce code tourne à
 * chaque page et à chaque appel d'API.
 *
 * 1. Les API qui modifient quelque chose refusent les requêtes venues d'un
 *    autre site (`verifierOrigine`).
 * 2. Chaque page reçoit une politique de sécurité du contenu (CSP) avec un
 *    nonce tiré pour elle (`politiqueDeContenu`).
 * 3. Les pages de l'espace de gestion reçoivent l'adresse demandée, pour que
 *    la garde sache où revenir après la connexion.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    return verifierOrigine(request) ?? NextResponse.next();
  }

  const nonce = tirerNonce();
  const csp = politiqueDeContenu(nonce, estEnHttps(request));
  const headers = new Headers(request.headers);
  // Next lit le nonce dans cet en-tête de la requête et l'appose de lui-même
  // sur ses propres scripts (amorçage, données de rendu, morceaux du bundle).
  headers.set("content-security-policy", csp);

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    headers.set(REQUESTED_PATH_HEADER, cheminDemande(request));
  } else {
    // Seules les pages gardées s'en servent ; ailleurs, une valeur envoyée
    // par le navigateur n'a pas à traîner jusqu'au rendu.
    headers.delete(REQUESTED_PATH_HEADER);
  }

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

// ---------------------------------------------------------------------------
// 1. Origine des requêtes qui modifient
// ---------------------------------------------------------------------------

/**
 * Le cookie de session n'était protégé que par `SameSite=Lax`. Or un
 * formulaire posté depuis un autre site en `text/plain` ou `multipart`, ou un
 * `fetch` sans CORS, part sans question préalable du navigateur : les routes
 * qui lisent `req.json()` acceptaient ces corps-là, et une page piégée pouvait
 * modifier un événement, diffuser un message, connecter le visiteur au compte
 * de l'attaquant ou le déconnecter, avec la session de qui l'ouvrait.
 *
 * Désormais, pour toute API qui modifie (POST, PUT, PATCH, DELETE) :
 * - si le navigateur dit d'où vient la requête (`Sec-Fetch-Site`, puis
 *   `Origin`), elle doit venir de ce site ;
 * - un corps doit être du JSON — ce qu'aucune page d'un autre site ne peut
 *   envoyer sans que le navigateur ne demande d'abord la permission, jamais
 *   accordée ici. Les téléversements, seuls à envoyer du `multipart`, doivent
 *   en plus prouver leur origine.
 *
 * Un client sans navigateur (curl, script) n'envoie ni l'un ni l'autre en-tête
 * et passe s'il envoie du JSON : il n'a pas la session d'un autre à détourner.
 */

/**
 * Appelées d'ailleurs, ou sans cookie, par construction : elles ont leur
 * propre authentification et ne passent pas par ce contrôle.
 */
const SANS_CONTROLE_D_ORIGINE = [
  // Le client MCP (Claude…) les appelle depuis ses serveurs, avec ses propres
  // identifiants : pas de cookie à détourner.
  "/api/oauth/token",
  "/api/oauth/register",
  "/api/oauth/revoke",
  // Le formulaire de consentement porte un jeton signé, lié au compte et
  // valable dix minutes : c'est lui qui prouve que la page était la nôtre. Sa
  // page impose `Referrer-Policy: no-referrer`, ce qui fait envoyer
  // « Origin: null » par le navigateur.
  "/api/oauth/authorize",
  // Jeton porteur ; la route vérifie elle-même l'origine des navigateurs.
  "/api/mcp",
  // Secret porteur du planificateur.
  "/api/cron/",
];

/** Les seules routes qui reçoivent autre chose que du JSON. */
const TELEVERSEMENTS = ["/api/uploads"];

const METHODES_QUI_MODIFIENT = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function commencePar(pathname: string, prefixes: string[]) {
  return prefixes.some(
    (prefixe) =>
      pathname === prefixe ||
      pathname.startsWith(prefixe.endsWith("/") ? prefixe : `${prefixe}/`),
  );
}

/** Les hôtes sous lesquels ce site se connaît. */
function hotesDuSite(request: NextRequest): Set<string> {
  const hotes = new Set<string>();
  const ajouter = (valeur: string | null | undefined) => {
    const hote = valeur?.split(",")[0]?.trim().toLowerCase();
    if (hote) hotes.add(hote);
  };
  // L'hôte auquel le navigateur s'est adressé : une page d'un autre site ne
  // peut pas le choisir à sa place.
  ajouter(request.headers.get("host"));
  ajouter(request.headers.get("x-forwarded-host"));
  for (const configuree of [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    try {
      if (configuree?.trim()) ajouter(new URL(configuree.trim()).host);
    } catch {
      // Adresse mal formée : signalée ailleurs (écran Configuration).
    }
  }
  return hotes;
}

function refus(status: 403 | 415, error: string) {
  return NextResponse.json({ error }, { status });
}

function verifierOrigine(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (!METHODES_QUI_MODIFIENT.has(request.method)) return null;
  if (commencePar(pathname, SANS_CONTROLE_D_ORIGINE)) return null;

  const site = request.headers.get("sec-fetch-site");
  const origine = request.headers.get("origin");
  const refusOrigine = () =>
    refus(
      403,
      "Requête refusée : elle ne vient pas de ce site. Rechargez la page et réessayez.",
    );

  // `Sec-Fetch-Site` d'abord : le navigateur le fixe lui-même, et il reste
  // juste quand la politique de référent vide l'en-tête `Origin`.
  if (site) {
    if (site !== "same-origin") return refusOrigine();
  } else if (origine) {
    let hote: string | null = null;
    try {
      hote = origine === "null" ? null : new URL(origine).host.toLowerCase();
    } catch {
      hote = null;
    }
    if (!hote || !hotesDuSite(request).has(hote)) return refusOrigine();
  }

  const type = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (commencePar(pathname, TELEVERSEMENTS)) {
    // Un formulaire d'un autre site sait envoyer du multipart : l'origine
    // doit donc être prouvée, pas seulement non démentie.
    if (!site && !origine) return refusOrigine();
    if (type && !type.startsWith("multipart/form-data")) {
      return refus(415, "Format de requête non accepté pour un envoi de fichier.");
    }
    return null;
  }

  const avecCorps =
    Number(request.headers.get("content-length") ?? "0") > 0 ||
    request.headers.has("transfer-encoding");
  const estJson = /^application\/json\s*(;|$)/.test(type);
  if (type ? !estJson : avecCorps) {
    return refus(415, "Format de requête non accepté : le corps doit être du JSON.");
  }
  return null;
}

// ---------------------------------------------------------------------------
// 2. Politique de sécurité du contenu
// ---------------------------------------------------------------------------

function tirerNonce(): string {
  const octets = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...octets));
}

function estEnHttps(request: NextRequest): boolean {
  const proto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  return proto ? proto === "https" : request.nextUrl.protocol === "https:";
}

/**
 * La CSP des pages.
 *
 * Les scripts ne s'exécutent que s'ils portent le nonce de la page
 * (`'strict-dynamic'` étend la confiance aux scripts qu'ils chargent, comme
 * reCAPTCHA). Un script injecté dans une page — par un champ mal échappé, une
 * extension, un proxy — ne l'a pas, et ne s'exécute pas. C'est pourquoi le
 * nonce plutôt que `'unsafe-inline'` : Next écrit ses données de rendu dans
 * des scripts en ligne, et `'unsafe-inline'` aurait laissé passer tous les
 * autres avec eux. Toutes les pages sont déjà rendues à la demande (le layout
 * racine est dynamique) : tirer un nonce par page ne coûte rien de plus.
 *
 * Les hôtes de reCAPTCHA restent listés pour les navigateurs qui ignorent
 * `'strict-dynamic'`. Les styles en ligne sont permis : React en écrit dans
 * les attributs `style` (barres de progression), et un style ne s'exécute
 * pas. Images : le site, et `data:`/`blob:` pour les aperçus et les QR codes.
 * Le service worker des notifications est servi par le site (`worker-src`).
 */
function politiqueDeContenu(nonce: string, https: boolean): string {
  const developpement = process.env.NODE_ENV !== "production";
  const recaptcha = "https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${recaptcha}${developpement ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' https://www.google.com/recaptcha/${developpement ? " ws: wss:" : ""}`,
    "frame-src 'self' https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Même règle que X-Frame-Options (next.config.mjs, docker/Caddyfile) :
    // pas d'affichage dans le cadre d'un autre site.
    "frame-ancestors 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

// ---------------------------------------------------------------------------
// 3. Adresse demandée, pour le retour après connexion
// ---------------------------------------------------------------------------

/**
 * Ni `headers()` ni les paramètres d'une page ne donnent l'URL entière qui l'a
 * fait rendre. Sans elle, `requireUser` ne savait renvoyer que vers « /login »,
 * et le lien d'un e-mail finissait sur l'accueil une fois connecté.
 *
 * L'en-tête est toujours réécrit, jamais complété : une valeur envoyée par le
 * navigateur est écrasée. La garde la refiltre de toute façon
 * (lib/auth/return-path.ts) ; au pire, un en-tête forgé ramènerait sur une
 * autre page du même site.
 */
function cheminDemande(request: NextRequest): string {
  const { pathname, search } = request.nextUrl;
  const params = new URLSearchParams(search);
  // Paramètre interne des navigations côté client. Next le retire déjà de ce
  // qu'il montre au middleware ; s'il passait quand même, la connexion
  // ramènerait sur la réponse RSC brute au lieu de la page.
  params.delete("_rsc");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export const config = {
  // Tout, sauf les fichiers statiques : leurs réponses ne portent ni page à
  // protéger par une CSP, ni action à vérifier. Les API y passent pour le
  // contrôle d'origine, les pages pour leur CSP, et « /dashboard/:path* »
  // pour l'adresse demandée, comme avant.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|logo\\.svg).*)",
  ],
};
