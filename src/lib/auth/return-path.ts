/**
 * Le retour vers la page demandée, une fois connecté.
 *
 * Les e-mails envoient vers des pages précises de l'espace de gestion : les
 * présences d'une réunion, la check-list d'un événement. Sans session, la garde
 * renvoyait vers « /login » tout court, et la connexion faite on atterrissait
 * sur l'accueil du tableau de bord : le lien du message ne menait nulle part,
 * il fallait aller rechercher la réunion à la main.
 *
 * La page de départ voyage donc dans l'adresse de connexion (`/login?next=…`).
 * C'est une donnée que n'importe qui peut forger, et la porte classique d'une
 * redirection ouverte : un lien piégé vers la vraie page de connexion, qui
 * renverrait après coup sur un site imitant celui-ci. Le même filtre sert à
 * l'aller (construction du lien par la garde) et au retour (lecture par la
 * page de connexion) : rien ne sort de l'origine du site.
 *
 * Module pur, sans dépendance serveur : le middleware, les gardes et les
 * formulaires de connexion le partagent.
 */

/**
 * En-tête où le middleware recopie le chemin et la requête de la page
 * demandée. Un composant serveur ne connaît pas l'URL qui l'a fait rendre :
 * c'est le seul moyen, pour la garde, de savoir où revenir.
 */
export const REQUESTED_PATH_HEADER = "x-apel-requested-path";

/** Destination par défaut d'une connexion : l'accueil de l'espace de gestion. */
export const DEFAULT_NEXT_PATH = "/dashboard";

/**
 * Au-delà, on renonce plutôt que de promener une adresse démesurée d'une
 * redirection à l'autre. Large quand même : le retour d'une autorisation MCP
 * porte toute sa requête OAuth.
 */
const MAX_LENGTH = 4_096;

/** Origine fictive servant seulement à résoudre les chemins relatifs. */
const ORIGIN = "https://apel.invalid";

/** Commence par une seule barre, et n'en contient aucune à l'envers. */
function isLocalPath(value: string) {
  return (
    value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
  );
}

/**
 * Le chemin de retour s'il est sûr, `null` sinon.
 *
 * Refusés : tout ce qui n'est pas un chemin local (`https:`, `javascript:`,
 * `//hote`, `/\hote`), les caractères de contrôle — que l'analyseur d'URL
 * efface en silence, ce qui peut recoller deux barres —, et les valeurs
 * démesurées.
 *
 * Le contrôle est refait *après* normalisation : `/..//hote` passe le premier
 * examen, mais la résolution des `..` le ramène à `//hote`, qu'un navigateur
 * lit comme une adresse sur un autre site.
 */
export function returnPath(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > MAX_LENGTH ||
    !isLocalPath(value) ||
    /[\u0000-\u001f\u007f-\u009f]/.test(value)
  ) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(value, ORIGIN);
  } catch {
    return null;
  }
  if (parsed.origin !== ORIGIN) return null;
  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  return isLocalPath(path) ? path : null;
}

/** Le chemin de retour, ou l'accueil de l'espace de gestion à défaut. */
export function safeNextPath(value: unknown): string {
  return returnPath(value) ?? DEFAULT_NEXT_PATH;
}

/**
 * Une page d'authentification qui emporte la destination avec elle.
 *
 * Rien n'est ajouté quand la destination est l'accueil : c'est déjà celle par
 * défaut, et « /login » se lit mieux que « /login?next=%2Fdashboard ».
 */
export function withNextPath(
  page: "/login" | "/register" | "/forgot",
  next: unknown,
): string {
  const path = returnPath(next);
  return path && path !== DEFAULT_NEXT_PATH
    ? `${page}?next=${encodeURIComponent(path)}`
    : page;
}
