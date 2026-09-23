import { headers } from "next/headers";

/**
 * L'adresse publique du site, pour les liens qui partent par e-mail.
 *
 * Elle ne vient que de la configuration (APP_URL, ou NEXT_PUBLIC_APP_URL pour
 * les anciens déploiements), jamais de la requête. Déduite de l'en-tête
 * `Host`, elle appartenait à qui envoyait la requête : une demande de
 * réinitialisation envoyée avec `Host: site-piege.example` faisait partir,
 * depuis l'adresse de l'association, un lien vers ce site-là — et le jeton
 * qu'il portait donnait le compte à qui le recevait en premier. Même chose
 * pour la confirmation d'une demande de compte et les liens de désinscription.
 *
 * Sans adresse configurée, les liens porteurs d'un jeton ne partent pas du
 * tout (`secureLinkBaseUrl`), le journal le dit et l'écran Configuration
 * l'affiche aux administrateurs. Les autres liens (connexion, tableau de bord)
 * restent relatifs : inutilisables depuis une boîte de réception, mais
 * inoffensifs, et le message garde son contenu.
 */

function lireAdresseConfiguree(): string {
  return (
    process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || ""
  );
}

/**
 * L'URL configurée (sans slash final), ou une chaîne vide si elle manque ou
 * n'est pas une adresse http(s) valide.
 */
export function configuredBaseUrl(): string {
  const brute = lireAdresseConfiguree();
  if (!brute) return "";
  try {
    const url = new URL(brute);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (url.username || url.password || url.search || url.hash) return "";
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/**
 * Pourquoi l'adresse publique n'est pas utilisable, ou `null` si elle l'est.
 * Lu par l'avertissement de l'écran Configuration et le contrôle au démarrage.
 */
export function baseUrlProblem(): string | null {
  const brute = lireAdresseConfiguree();
  if (!brute) return "APP_URL n’est pas définie";
  if (!configuredBaseUrl()) {
    return "APP_URL n’est pas une adresse http(s) valide";
  }
  return null;
}

/**
 * Base des liens sans jeton des e-mails : l'adresse configurée, sinon une
 * chaîne vide (liens relatifs). Jamais l'en-tête `Host`.
 *
 * Asynchrone pour ses appelants historiques, qui l'attendent avec `await`.
 */
export async function getBaseUrl(): Promise<string> {
  return configuredBaseUrl();
}

/**
 * Base d'un lien porteur d'un jeton (réinitialisation, confirmation de compte,
 * désinscription), ou `null` : sans adresse configurée, ce lien ne doit pas
 * partir. Fermé par défaut plutôt que deviné — le journal dit pourquoi le
 * message manque, l'écran Configuration aussi.
 */
export function secureLinkBaseUrl(usage: string): string | null {
  const base = configuredBaseUrl();
  if (!base) {
    console.error(
      `[liens] ${usage} : envoi annulé, ${baseUrlProblem()}. Les liens porteurs d'un jeton ne partent que vers l'adresse publique configurée.`,
    );
    return null;
  }
  return base;
}

/**
 * Base d'une adresse *affichée* dans une page, pour la personne qui la
 * demande (le lien public d'inscription d'un événement, par exemple).
 *
 * Ici seulement, l'en-tête `Host` sert de repli quand rien n'est configuré :
 * la page est rendue pour qui a envoyé la requête, et un `Host` forgé ne
 * tromperait que son auteur. Rien de ce qui est construit ainsi ne doit partir
 * par e-mail ni être mis en cache pour d'autres.
 */
export async function displayBaseUrl(): Promise<string> {
  const configured = configuredBaseUrl();
  if (configured) return configured;
  try {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") === "http" ? "http" : "https";
    return host ? `${proto}://${host}` : "";
  } catch {
    return "";
  }
}
