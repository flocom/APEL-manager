import { isIP } from "node:net";
// Le nom `url` désigne plus bas l'adresse analysée ; le module garde le sien.
import * as analyseurHistorique from "node:url";

/**
 * Adresses d'abonnement Web Push acceptées.
 *
 * L'endpoint d'un abonnement est une URL fournie par le navigateur, que le
 * serveur appelle ensuite lui-même à chaque envoi. Accepter n'importe quelle
 * URL revenait à laisser un membre faire frapper le serveur à la porte de son
 * choix — la base sur 127.0.0.1:5432, une interface d'administration du réseau
 * interne — à chaque notification. Seuls les services de notification des
 * navigateurs ont une raison d'apparaître ici :
 *
 * - Chrome, Edge Android, Opera, Samsung Internet : Firebase Cloud Messaging ;
 * - Firefox : autopush de Mozilla ;
 * - Safari (macOS, iPhone et iPad installés sur l'écran d'accueil) : Apple ;
 * - Edge sous Windows : Windows Push Notification Services.
 *
 * Un nouveau navigateur qui passerait par un autre service verrait son
 * abonnement refusé avec un message clair : c'est ici qu'on l'ajoute.
 */

/** Hôtes exacts. */
const HOTES_EXACTS = new Set([
  "fcm.googleapis.com",
  // Relais de FCM observé sur certaines versions de Chrome : même service,
  // même propriétaire.
  "jmt17.google.com",
  "updates.push.services.mozilla.com",
]);

/**
 * Suffixes précédés d'un point : `web.push.apple.com` passe,
 * `evilpush.apple.com` ou `push.apple.com.exemple.fr` non.
 */
const SUFFIXES = [".push.apple.com", ".notify.windows.com"];

export type RefusEndpoint =
  | "url-invalide"
  | "https-requis"
  | "identifiants-interdits"
  | "port-interdit"
  | "adresse-ip-interdite"
  | "forme-non-canonique"
  | "service-inconnu";

/**
 * Nom d'hôte fait seulement de lettres, chiffres et tirets, en au moins deux
 * étiquettes : la forme de tous les hôtes de la liste. L'exiger avant de la
 * consulter écarte les caractères que `new URL` laisse dans l'hôte alors que
 * l'analyseur de web-push y arrête l'hôte — point-virgule, apostrophe,
 * guillemet, accent grave, accolades. `https://127.0.0.1;.push.apple.com/x`
 * finit bien par `.push.apple.com` pour le premier ; pour le second, il
 * désigne 127.0.0.1, et c'est là que l'envoi serait parti.
 */
const HOTE_SIMPLE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/**
 * Renvoie `null` quand l'endpoint est acceptable, le motif du refus sinon.
 *
 * L'URL doit être déjà écrite sous sa forme canonique : c'est toujours le cas
 * de celle que produit un navigateur, et la bibliothèque d'envoi la relit avec
 * un autre analyseur que celui-ci. Refuser toute écriture ambiguë — barre
 * oblique inverse, identifiants, port écrit en toutes lettres — évite que les
 * deux analyseurs ne voient pas le même hôte.
 */
export function refusEndpointPush(endpoint: string): RefusEndpoint | null {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return "url-invalide";
  }
  if (url.protocol !== "https:") return "https-requis";
  if (url.username || url.password) return "identifiants-interdits";
  // `new URL` efface le port 443, implicite en https : il reste donc vide pour
  // toute adresse légitime.
  if (url.port !== "") return "port-interdit";
  const hote = url.hostname;
  if (isIP(hote.replace(/^\[|\]$/g, "")) !== 0) return "adresse-ip-interdite";
  if (url.href !== endpoint) return "forme-non-canonique";
  if (!HOTE_SIMPLE.test(hote)) return "service-inconnu";
  // Seconde garde, indépendante de la précédente : l'hôte et le port que
  // l'envoi utilisera réellement sont ceux de `url.parse`, l'analyseur de
  // web-push (web-push-lib.js, `sendNotification`). Contrôler un hôte et en
  // appeler un autre est exactement la faille à fermer ; s'ils divergent un
  // jour pour une raison qu'on n'a pas prévue, l'adresse est refusée.
  let historique: analyseurHistorique.Url;
  try {
    historique = analyseurHistorique.parse(endpoint);
  } catch {
    return "url-invalide";
  }
  if (historique.hostname !== hote || (historique.port ?? "") !== "") {
    return "forme-non-canonique";
  }
  if (HOTES_EXACTS.has(hote)) return null;
  if (SUFFIXES.some((suffixe) => hote.endsWith(suffixe))) return null;
  return "service-inconnu";
}

export function endpointPushAutorise(endpoint: string): boolean {
  return refusEndpointPush(endpoint) === null;
}
