/**
 * Lien d'invitation au groupe WhatsApp de l'association.
 *
 * Module pur — aucun import serveur — partagé par le formulaire de
 * configuration et par la validation de l'API, pour que le message affiché à
 * l'administrateur décrive bien la règle appliquée.
 *
 * Le lien est destiné à être publié : ce n'est pas un secret, il n'est ni
 * chiffré ni masqué. En revanche, il ouvre l'entrée du groupe à quiconque
 * trouve la page — l'aide du champ le dit explicitement.
 */

export const WHATSAPP_URL_MAX = 500;

export type WhatsappUrlError = "illisible" | "protocole" | "conversation" | "longueur";

export const WHATSAPP_URL_MESSAGES: Record<WhatsappUrlError, string> = {
  illisible:
    "Cette adresse n’est pas reconnue. Dans WhatsApp : Infos du groupe › Inviter via un lien › Copier le lien, puis collez-le ici — il ressemble à https://chat.whatsapp.com/…",
  protocole:
    "Le lien doit commencer par https:// — recopiez-le depuis WhatsApp plutôt que de le retaper.",
  conversation:
    "Ce lien ouvre une conversation avec une personne, pas un groupe. Utilisez le lien d’invitation du groupe : Infos du groupe › Inviter via un lien.",
  longueur:
    "Cette adresse est anormalement longue. Vérifiez que vous avez collé un lien et non un bloc de code.",
};

export type WhatsappUrlCheck =
  | { ok: true; url: string | null }
  | { ok: false; raison: WhatsappUrlError; message: string };

/** Adresses WhatsApp qui ouvrent une discussion individuelle, pas un groupe. */
const HOTES_CONVERSATION = ["wa.me", "api.whatsapp.com"];

function estHote(hostname: string, hote: string): boolean {
  return hostname === hote || hostname.endsWith(`.${hote}`);
}

/**
 * Vérifie une saisie et rend l'adresse normalisée à stocker.
 *
 * On n'est sévère que là où l'on sait de quoi on parle : une adresse WhatsApp
 * qui n'est manifestement pas celle d'un groupe est refusée, mais un lien
 * raccourci ou une redirection maison passe — l'association reste maîtresse de
 * ce qu'elle publie.
 */
export function checkWhatsappUrl(saisie: string | null | undefined): WhatsappUrlCheck {
  const brut = (saisie ?? "").trim();
  if (!brut) return { ok: true, url: null };
  if (brut.length > WHATSAPP_URL_MAX) {
    return { ok: false, raison: "longueur", message: WHATSAPP_URL_MESSAGES.longueur };
  }

  const candidat = /^[a-z][a-z0-9+.-]*:/i.test(brut) ? brut : `https://${brut}`;
  let url: URL;
  try {
    url = new URL(candidat);
  } catch {
    return { ok: false, raison: "illisible", message: WHATSAPP_URL_MESSAGES.illisible };
  }

  if (url.protocol !== "https:") {
    return { ok: false, raison: "protocole", message: WHATSAPP_URL_MESSAGES.protocole };
  }
  if (url.username || url.password) {
    return { ok: false, raison: "illisible", message: WHATSAPP_URL_MESSAGES.illisible };
  }
  if (HOTES_CONVERSATION.some((hote) => estHote(url.hostname, hote))) {
    return {
      ok: false,
      raison: "conversation",
      message: WHATSAPP_URL_MESSAGES.conversation,
    };
  }

  return { ok: true, url: url.toString() };
}

/** Vrai lien d'invitation de groupe : sert à prévenir sans bloquer. */
export function estInvitationGroupe(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname === "chat.whatsapp.com";
  } catch {
    return false;
  }
}
