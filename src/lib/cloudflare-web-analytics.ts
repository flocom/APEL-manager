/**
 * Cloudflare Web Analytics, chargé par la page plutôt que glissé par
 * Cloudflare.
 *
 * Derrière Cloudflare, les statistiques de visite viennent d'un script que
 * Cloudflare ajoute lui-même au HTML de chaque page. Il cesse de le faire dès
 * que la page porte « Cache-Control: no-transform » — ce que le Caddyfile pose
 * sur toutes les pages pour qu'aucune ne soit plus réécrite (docker/Caddyfile,
 * docs/DEPLOIEMENT.md, « Derrière Cloudflare »). Pour garder ces statistiques,
 * on renseigne le jeton du site dans CLOUDFLARE_WEB_ANALYTICS_TOKEN : la page
 * charge alors le script elle-même (layout racine), et la CSP laisse partir
 * ses mesures (middleware).
 *
 * Sans jeton, rien n'est chargé et la CSP ne s'ouvre pas.
 */

/** Le script de mesure. */
export const SCRIPT_WEB_ANALYTICS = "https://static.cloudflareinsights.com/beacon.min.js";

/**
 * Où ce script envoie ses mesures quand la page le charge elle-même : injecté
 * par Cloudflare, il les envoyait au site ; installé à la main, il les envoie
 * là, et `connect-src` doit le permettre.
 */
export const ENVOI_WEB_ANALYTICS = "https://cloudflareinsights.com";

/**
 * Le jeton, ou `null`. Lu à chaque appel, pas à la construction : l'image
 * Docker est construite une fois, puis configurée au démarrage. Une valeur qui
 * n'a pas la forme d'un jeton — l'extrait HTML entier collé par erreur, par
 * exemple — est ignorée plutôt que glissée dans la page.
 */
export function jetonWebAnalytics(): string | null {
  const jeton = process.env.CLOUDFLARE_WEB_ANALYTICS_TOKEN?.trim();
  return jeton && /^[A-Za-z0-9_-]{16,128}$/.test(jeton) ? jeton : null;
}
