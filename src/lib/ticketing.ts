/**
 * Lien de billetterie d'un événement (HelloAsso le plus souvent).
 *
 * Module volontairement pur — aucun import serveur — pour que la même règle
 * serve au formulaire d'un organisateur et à la validation de l'API. Sans ce
 * partage, le message affiché finirait par ne plus décrire la règle appliquée.
 *
 * Le champ n'est pas réservé à HelloAsso : une APEL peut vendre ses places sur
 * Billetweb, sur le site de la mairie ou via un formulaire de l'OGEC. On n'est
 * sévère que là où l'on sait de quoi on parle — c'est-à-dire sur helloasso.com,
 * où l'on sait distinguer une billetterie d'un espace d'administration.
 */

export const TICKETING_URL_MAX = 2000;

export type TicketingUrlError =
  | "illisible"
  | "protocole"
  | "administration"
  | "accueil"
  | "longueur";

export const TICKETING_URL_MESSAGES: Record<TicketingUrlError, string> = {
  illisible:
    "Cette adresse n’est pas reconnue. Ouvrez votre billetterie dans le navigateur et copiez l’adresse complète depuis la barre du haut : elle commence par https:// et ressemble à https://www.helloasso.com/associations/…/evenements/…",
  protocole:
    "Le lien doit commencer par https:// et non http:// — les familles vont y saisir un moyen de paiement. Recopiez l’adresse depuis votre billetterie plutôt que de la retaper.",
  administration:
    "Ce lien mène à votre espace d’administration HelloAsso : les familles n’y verraient qu’une page de connexion. Ouvrez votre billetterie dans une fenêtre de navigation privée — l’adresse affichée est celle à coller ici.",
  accueil:
    "Ce lien pointe vers l’accueil de HelloAsso, pas vers votre billetterie. Depuis votre page HelloAsso, ouvrez la campagne concernée et copiez l’adresse qui s’affiche alors.",
  longueur:
    "Cette adresse est anormalement longue. Vérifiez que vous avez collé un lien et non un bloc de code d’intégration (une balise iframe, par exemple) ; dans ce cas, seule l’adresse entre guillemets est nécessaire.",
};

export type TicketingUrlCheck =
  | { ok: true; url: string | null }
  | { ok: false; raison: TicketingUrlError; message: string };

/** Sous-domaines HelloAsso qu'une famille ne peut pas utiliser. */
const SOUS_DOMAINES_INTERNES = ["admin", "auth", "api"];

/**
 * Un nom d'hôte plausible : au moins un point, et rien d'autre que des
 * étiquettes valides. Sans ce contrôle, `new URL()` accepte « pas une adresse »
 * en percent-encodant les espaces, et l'organisateur croit son lien enregistré.
 */
function hoteVraisemblable(hostname: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
    hostname,
  );
}

function estHelloAsso(hostname: string): boolean {
  // Comparaison stricte, jamais un `includes` : « helloasso.com.piege.fr »
  // contient la chaîne sans être HelloAsso.
  return hostname === "helloasso.com" || hostname.endsWith(".helloasso.com");
}

/**
 * Vérifie une saisie et rend l'adresse normalisée à stocker.
 *
 * Une chaîne vide n'est pas une erreur : le champ est facultatif, et la plupart
 * des événements d'une APEL n'ont pas de billetterie.
 */
export function checkTicketingUrl(saisie: string | null | undefined): TicketingUrlCheck {
  const brut = (saisie ?? "").trim();
  if (!brut) return { ok: true, url: null };
  if (brut.length > TICKETING_URL_MAX) {
    return { ok: false, raison: "longueur", message: TICKETING_URL_MESSAGES.longueur };
  }

  // La barre d'adresse de Chrome copie « www.helloasso.com/… » sans schéma :
  // le refuser pour cette seule raison serait absurde.
  const candidat = /^[a-z][a-z0-9+.-]*:/i.test(brut) ? brut : `https://${brut}`;

  let url: URL;
  try {
    url = new URL(candidat);
  } catch {
    return { ok: false, raison: "illisible", message: TICKETING_URL_MESSAGES.illisible };
  }

  if (!hoteVraisemblable(url.hostname)) {
    return { ok: false, raison: "illisible", message: TICKETING_URL_MESSAGES.illisible };
  }

  if (url.protocol !== "https:") {
    // http: comme javascript: tombent ici. On refuse au lieu de réécrire : une
    // adresse en http est le plus souvent une adresse retapée à la main.
    return { ok: false, raison: "protocole", message: TICKETING_URL_MESSAGES.protocole };
  }

  if (estHelloAsso(url.hostname)) {
    const sousDomaine = url.hostname.split(".")[0];
    if (SOUS_DOMAINES_INTERNES.includes(sousDomaine)) {
      return {
        ok: false,
        raison: "administration",
        message: TICKETING_URL_MESSAGES.administration,
      };
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) {
      return { ok: false, raison: "accueil", message: TICKETING_URL_MESSAGES.accueil };
    }
  }

  return { ok: true, url: url.toString() };
}

/**
 * Nom du service à annoncer aux familles : « sur HelloAsso » rassure, « sur
 * un autre site » inquiéterait. Rend null si l'adresse est illisible.
 */
export function ticketingHostLabel(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return estHelloAsso(hostname) ? "HelloAsso" : hostname;
  } catch {
    return null;
  }
}
