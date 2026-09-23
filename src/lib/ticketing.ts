/**
 * Lien de paiement en ligne d'un événement (HelloAsso le plus souvent) :
 * billetterie, mais aussi boutique, collecte, adhésion ou paiement libre.
 *
 * Module volontairement pur — aucun import serveur — pour que la même règle
 * serve au formulaire d'un organisateur, à la validation de l'API et aux pages
 * publiques. Sans ce partage, le message affiché finirait par ne plus décrire
 * la règle appliquée, et la fiche d'un événement par ne plus dire la même
 * chose que la carte de l'accueil.
 *
 * Le champ n'est pas réservé à HelloAsso : une APEL peut vendre ses places sur
 * Billetweb, sur le site de la mairie ou via un formulaire de l'OGEC. On n'est
 * sévère que là où l'on sait de quoi on parle — c'est-à-dire sur helloasso.com,
 * où l'on sait distinguer une billetterie d'un espace d'administration, et
 * une boutique d'une collecte.
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
    "Cette adresse n’est pas reconnue. Ouvrez votre page HelloAsso (billetterie, boutique…) dans le navigateur et copiez l’adresse complète depuis la barre du haut : elle commence par https:// et ressemble à https://www.helloasso.com/associations/…",
  protocole:
    "Le lien doit commencer par https:// et non http:// — les familles vont y saisir un moyen de paiement. Recopiez l’adresse depuis votre page HelloAsso (billetterie, boutique…) plutôt que de la retaper.",
  administration:
    "Ce lien mène à votre espace d’administration HelloAsso : les familles n’y verraient qu’une page de connexion. Ouvrez votre page HelloAsso (billetterie, boutique…) dans une fenêtre de navigation privée — l’adresse affichée est celle à coller ici.",
  accueil:
    "Ce lien pointe vers l’accueil de HelloAsso, pas vers votre page. Depuis votre espace HelloAsso, ouvrez la campagne concernée (billetterie, boutique, collecte…) et copiez l’adresse qui s’affiche alors.",
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
 * des événements d'une APEL n'ont rien à régler en ligne.
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

// ---------------------------------------------------------------------------
// Ce que la famille fait sur la page liée
// ---------------------------------------------------------------------------

/**
 * À quoi sert le lien, du point de vue d'une famille.
 *
 * La page publique disait « Je réserve ma place » quel que soit le lien. Or
 * une APEL y colle aussi bien sa boutique de sapins, une collecte ou ses
 * adhésions : « Réserver » devant une vente de chocolats laisse croire à une
 * entrée payante, et un parent renonce à une fête qui était gratuite.
 *
 * Valeurs en français, comme `membership_fee_basis` : elles ne sortent de
 * l'application que par le serveur MCP, où elles se lisent telles quelles.
 */
export const TICKETING_KINDS = [
  "billetterie",
  "boutique",
  "don",
  "adhesion",
  "paiement",
] as const;

export type TicketingKind = (typeof TICKETING_KINDS)[number];

/**
 * Premier segment après `/associations/<organisme>/` sur helloasso.com.
 *
 * Relevé sur des pages publiques d'APEL et dans la documentation développeurs
 * de HelloAsso, qui montre les formulaires de don en `/formulaires/<numéro>`
 * et les adhésions en `/adhesions/…`. Une collecte (financement participatif)
 * appelle un don, pas un achat.
 *
 * `checkout` manque exprès : c'est le paiement qu'un site partenaire intègre
 * chez lui, jamais une page qu'une association copie pour ses familles. Tout
 * segment inconnu — y compris un futur type HelloAsso — ne détecte rien, et le
 * lien reste présenté comme une billetterie, ce qu'il était jusqu'ici.
 *
 * Une Map et non un objet littéral : `types["constructor"]` rendrait une
 * fonction, et un lien forgé ferait planter la page publique.
 */
const TYPES_HELLOASSO = new Map<string, TicketingKind>([
  ["evenements", "billetterie"],
  ["boutiques", "boutique"],
  ["collectes", "don"],
  ["formulaires", "don"],
  ["adhesions", "adhesion"],
  ["paiements", "paiement"],
]);

/**
 * Devine l'usage d'un lien HelloAsso d'après son adresse ; `null` si l'on ne
 * sait pas — autre plateforme, page d'un organisme, adresse illisible.
 *
 * Les suffixes de widget (`/widget-bouton`, `/widget-vignette-horizontale`…),
 * la barre oblique finale, la requête et la casse ne changent rien : seul
 * compte le segment qui suit le nom de l'organisme.
 */
export function detectTicketingKind(
  url: string | null | undefined,
): TicketingKind | null {
  const brut = (url ?? "").trim();
  if (!brut) return null;
  let adresse: URL;
  try {
    // Même tolérance que checkTicketingUrl : le formulaire détecte pendant la
    // frappe, avant que l'adresse ait reçu son https://.
    adresse = new URL(/^[a-z][a-z0-9+.-]*:/i.test(brut) ? brut : `https://${brut}`);
  } catch {
    return null;
  }
  if (!estHelloAsso(adresse.hostname)) return null;
  const segments = adresse.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
  if (segments[0] !== "associations" || segments.length < 3) return null;
  return TYPES_HELLOASSO.get(segments[2]) ?? null;
}

/**
 * L'usage retenu : le choix de l'organisateur s'il en a fait un, sinon ce que
 * dit l'adresse, sinon « billetterie » — le sens qu'avait le champ avant qu'on
 * sache distinguer, pour que rien ne change sur les événements existants.
 */
export function effectiveTicketingKind(
  url: string | null | undefined,
  choix: TicketingKind | null | undefined,
): TicketingKind {
  return choix ?? detectTicketingKind(url) ?? "billetterie";
}

/**
 * Tout ce qui se dit du lien, par usage, au même endroit.
 *
 * Les phrases se répondent d'un bloc à l'autre de la fiche publique : l'appel
 * aux bénévoles cite le titre du bandeau entre guillemets, le rappel de fin
 * reprend le bouton. Écrites chacune dans son composant, elles finiraient par
 * se contredire — « c'est « Je passe commande » » sous un titre « Je commande ».
 *
 * La billetterie garde mot pour mot ses phrases d'origine : c'est le cas de la
 * plupart des liens déjà saisis, et rien ne doit changer pour eux.
 */
interface TicketingKindWording {
  /** Badge d'une carte de l'accueil. */
  badgeCourt: string;
  /** Badge de la fiche publique, titre de la carte du tableau de bord. */
  badge: string;
  /** Badge de la fiche quand l'événement cherche aussi des bénévoles. */
  badgeAvecBenevoles: string;
  /** Surtitre du bandeau turquoise de la fiche. */
  surtitre: string;
  /** Titre du bandeau, cité ensuite entre guillemets par les autres blocs. */
  titre: string;
  /** Infinitif en tête du bouton et de la mise en garde : « Commander sur… ». */
  verbe: string;
  /** Début de l'explication, avant « sur {hôte} ». */
  seFait: string;
  /** Seconde phrase de l'explication. */
  detail: string;
  /** Hôte à nommer si l'adresse ne se lit pas (ne devrait jamais servir). */
  hoteParDefaut: string;
  /** Aperçu du lien partagé dans un groupe de classe, après la date. */
  apercu: string;
  /** Renvoi depuis l'appel aux bénévoles. */
  depuisBenevolat: string;
  /** Renvoi quand aucun créneau de bénévolat n'est ouvert. */
  sansCreneau: string;
  /** Phrase qui précède le lien, une fois un coup de main enregistré. */
  rappel: string;
  /** Texte de ce lien, avant « sur {hôte} ». */
  lienRappel: string;
  /** Choix proposé à l'organisateur sous « Ce lien sert à ». */
  choix: string;
  /** Ce que l'adresse a permis de reconnaître : « boutique » HelloAsso. */
  reconnu: string;
}

const cite = (titre: string) => `« ${titre} »`;

const LIBELLES: Record<TicketingKind, TicketingKindWording> = {
  billetterie: {
    badgeCourt: "Billetterie",
    badge: "Billetterie en ligne",
    badgeAvecBenevoles: "Billetterie et bénévoles",
    surtitre: "Venir à l’événement",
    titre: "Je réserve ma place",
    verbe: "Réserver",
    seFait: "La réservation se fait",
    detail: "Vous y choisissez vos places et réglez en ligne s’il y a un tarif.",
    hoteParDefaut: "la billetterie en ligne",
    apercu: "réservez votre place ou donnez un coup de main.",
    depuisBenevolat: `Cela ne réserve pas votre place à l’événement — pour venir, c’est ${cite("Je réserve ma place")}.`,
    sansCreneau: `Votre réservation, elle, est déjà possible : c’est ${cite("Je réserve ma place")}.`,
    rappel: "Votre place à l’événement n’est pas réservée pour autant.",
    lienRappel: "Réserver ma place",
    choix: "Réserver sa place (billetterie)",
    reconnu: "billetterie",
  },
  // Pas de « pour autant » ailleurs que pour la billetterie : sans billet on
  // n'entre pas, alors que personne n'est tenu de commander, de donner ou
  // d'adhérer pour venir aider. Le renvoi informe, il ne met pas en garde.
  boutique: {
    badgeCourt: "Boutique",
    badge: "Boutique en ligne",
    badgeAvecBenevoles: "Boutique et bénévoles",
    surtitre: "Commander en ligne",
    titre: "Je passe commande",
    verbe: "Commander",
    seFait: "La commande se fait",
    detail: "Vous y choisissez vos articles et réglez en ligne.",
    hoteParDefaut: "la boutique en ligne",
    apercu: "commandez en ligne ou donnez un coup de main.",
    depuisBenevolat: `Pour commander, c’est à part : ${cite("Je passe commande")}.`,
    sansCreneau: `La boutique, elle, est déjà ouverte : c’est ${cite("Je passe commande")}.`,
    rappel: "Pour commander, c’est à part :",
    lienRappel: "Commander",
    choix: "Commander (boutique, vente)",
    reconnu: "boutique",
  },
  don: {
    badgeCourt: "Dons",
    badge: "Dons en ligne",
    badgeAvecBenevoles: "Dons et bénévoles",
    surtitre: "Soutenir l’association",
    titre: "Je fais un don",
    verbe: "Faire un don",
    seFait: "Le don se fait",
    detail: "Vous y choisissez le montant et réglez en ligne.",
    hoteParDefaut: "la page de don",
    // « faites un don ou donnez un coup de main » bégaierait.
    apercu: "faites un don ou proposez-vous comme bénévole.",
    depuisBenevolat: `Pour faire un don, c’est à part : ${cite("Je fais un don")}.`,
    sansCreneau: `Les dons, eux, sont déjà possibles : c’est ${cite("Je fais un don")}.`,
    rappel: "Pour faire un don, c’est à part :",
    lienRappel: "Faire un don",
    choix: "Faire un don (don, collecte)",
    reconnu: "page de don",
  },
  adhesion: {
    badgeCourt: "Adhésion",
    badge: "Adhésion en ligne",
    badgeAvecBenevoles: "Adhésion et bénévoles",
    surtitre: "Adhérer à l’association",
    titre: "J’adhère",
    verbe: "Adhérer",
    seFait: "L’adhésion se fait",
    detail:
      "Vous y remplissez le bulletin et réglez en ligne s’il y a une cotisation.",
    hoteParDefaut: "la page d’adhésion",
    apercu: "adhérez en ligne ou donnez un coup de main.",
    depuisBenevolat: `Pour adhérer, c’est à part : ${cite("J’adhère")}.`,
    sansCreneau: `L’adhésion, elle, est déjà possible : c’est ${cite("J’adhère")}.`,
    rappel: "Pour adhérer, c’est à part :",
    lienRappel: "Adhérer",
    choix: "Adhérer (adhésion, cotisation)",
    reconnu: "page d’adhésion",
  },
  paiement: {
    // « Paiement » seul, sur une carte de l'accueil, se lirait « payant ».
    badgeCourt: "Paiement en ligne",
    badge: "Paiement en ligne",
    badgeAvecBenevoles: "Paiement et bénévoles",
    surtitre: "Paiement en ligne",
    titre: "Je règle en ligne",
    verbe: "Payer",
    seFait: "Le paiement se fait",
    detail: "Vous y voyez ce qu’il y a à régler et payez en ligne.",
    hoteParDefaut: "la page de paiement",
    apercu: "réglez en ligne ou donnez un coup de main.",
    depuisBenevolat: `Pour régler en ligne, c’est à part : ${cite("Je règle en ligne")}.`,
    sansCreneau: `Le paiement, lui, est déjà possible : c’est ${cite("Je règle en ligne")}.`,
    rappel: "Pour régler en ligne, c’est à part :",
    lienRappel: "Payer",
    choix: "Payer (repas, sortie, participation…)",
    reconnu: "page de paiement",
  },
};

/**
 * Libellés d'un usage, l'hôte déjà placé dans les phrases qui le nomment.
 *
 * `hote` vient de `ticketingHostLabel` : « HelloAsso », ou le nom de domaine
 * d'une autre plateforme (« sur billetweb.fr »). À défaut, un nom propre à
 * l'usage — « Commander sur la billetterie en ligne » serait faux.
 */
export function ticketingWording(kind: TicketingKind, hote?: string | null) {
  const libelles = LIBELLES[kind];
  const sur = hote || libelles.hoteParDefaut;
  return {
    ...libelles,
    hote: sur,
    explication: `${libelles.seFait} sur ${sur}, la plateforme utilisée par l’association. ${libelles.detail}`,
    bouton: `${libelles.verbe} sur ${sur}`,
    independance: `${libelles.verbe} ne vous inscrit pas comme bénévole : ce sont deux démarches indépendantes.`,
    lienRappel: `${libelles.lienRappel} sur ${sur}`,
  };
}

/**
 * Intitulé du lien tant qu'aucun usage ne s'applique : section du formulaire,
 * carte du tableau de bord d'un événement qui n'a pas de lien.
 */
export const TICKETING_GENERIC_TITLE = "Billetterie, boutique ou paiement en ligne";
