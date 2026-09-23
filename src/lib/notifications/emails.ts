import { APP_NAME } from "@/lib/app-config";
import type { EmailLogo } from "@/lib/notifications/logo";
import {
  droppedAccountRequestNotices,
  totalDroppedAccountRequests,
  type DroppedAccountRequests,
} from "@/lib/labels";
import {
  bouton,
  citation,
  COULEURS,
  encart,
  esc,
  escLignes,
  fiche,
  lien,
  p,
  pDiscret,
  POLICE,
  section,
} from "@/lib/notifications/theme";

interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface NotificationIdentity {
  associationName: string;
  schoolName?: string | null;
  rna?: string | null;
  /** Fourni par `getNotificationIdentity` ; absent, l'en-tête reste sans logo. */
  logo?: EmailLogo | null;
}

/**
 * La rangée du logo, au-dessus du bandeau.
 *
 * Sur blanc et non sur le bandeau bleu : un logo d'école est dessiné pour un
 * fond clair, et ses lettres foncées disparaîtraient sur le bleu. Aligné à
 * gauche, sur le même retrait que le nom de l'association et le titre.
 *
 * L'image elle-même suit ce qu'exigent les clients de messagerie :
 * - `width` et `height` en attributs, les seuls que lit le moteur de Word ;
 * - en style, la largeur, `max-width:100%` et `height:auto`, pour que les
 *   autres réduisent le logo en gardant ses proportions si la place manque ;
 * - `display:block` contre l'espace fantôme sous une image en ligne, `border`
 *   et `outline` à zéro contre le cadre de certains webmails ;
 * - un texte de remplacement écrit comme le nom du bandeau, en foncé sur le
 *   blanc : Outlook bloque les images par défaut, et c'est alors ce texte, et
 *   non une case vide, qui ouvre le message. Petit à dessein : il s'inscrit
 *   dans la largeur du logo, parfois 56 px pour un logo carré.
 */
function rangeeLogo(logo: EmailLogo, associationName: string): string {
  return `
        <tr>
          <td bgcolor="${COULEURS.carte}" style="padding:24px 28px 20px;background-color:${COULEURS.carte};border-radius:14px 14px 0 0;">
            <img src="${esc(logo.url)}" width="${logo.width}" height="${logo.height}" alt="${esc(associationName)}" style="display:block;width:${logo.width}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;font-family:${POLICE};font-size:14px;line-height:20px;font-weight:bold;letter-spacing:0.4px;color:${COULEURS.titre};" />
          </td>
        </tr>`;
}

/**
 * Le document complet : fond coloré, carte blanche de 600 px centrée, logo de
 * l'association s'il y en a un, bandeau d'en-tête à son nom, contenu, pied de
 * page. Sans logo, l'en-tête commence directement par le bandeau.
 *
 * La carte est fluide (`width:100%`) et plafonnée à 600 px : figée à 600 px,
 * elle débordait de l'écran d'un téléphone, qu'il fallait alors balayer
 * horizontalement pour lire une ligne. Outlook, qui ne comprend pas
 * `max-width`, reçoit sa largeur fixe par le commentaire conditionnel
 * `[if mso]` — c'est lui qui borne la carte là-bas.
 *
 * Le centrage passe par `align="center"` sur la cellule *et* `margin:0 auto` :
 * Outlook ne connaît que le premier, les webmails modernes que le second.
 *
 * `apercu` est le texte d'aperçu affiché dans la liste des messages, à côté de
 * l'objet. Sans lui, les clients y recopient le début du HTML — souvent le nom
 * de l'association, déjà dans l'expéditeur, donc une ligne perdue.
 */
function layout(
  titre: string,
  apercu: string,
  corps: string,
  identity?: NotificationIdentity,
): string {
  const associationName = identity?.associationName || APP_NAME;
  const details = [
    identity?.schoolName?.trim(),
    identity?.rna?.trim() ? `RNA ${identity.rna.trim()}` : null,
  ].filter((value): value is string => Boolean(value));
  const logo = identity?.logo;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<!--[if mso]><xml><o:OfficeDocumentSettings xmlns:o="urn:schemas-microsoft-com:office:office"><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<title>${esc(titre)}</title>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${COULEURS.page};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${COULEURS.page};">${esc(apercu)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COULEURS.page}" style="width:100%;background-color:${COULEURS.page};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COULEURS.carte}" style="width:100%;max-width:600px;margin:0 auto;background-color:${COULEURS.carte};border-radius:14px;">${logo ? rangeeLogo(logo, associationName) : ""}
        <tr>
          <td bgcolor="${COULEURS.bandeau}" style="padding:16px 28px;background-color:${COULEURS.bandeau};${logo ? "" : "border-radius:14px 14px 0 0;"}font-family:${POLICE};font-size:14px;line-height:20px;font-weight:bold;color:#ffffff;letter-spacing:0.4px;">${esc(associationName)}</td>
        </tr>
        <tr>
          <td style="padding:28px 28px 8px;">
            <h1 style="margin:0 0 18px;font-family:${POLICE};font-size:24px;line-height:31px;mso-line-height-rule:exactly;font-weight:bold;color:${COULEURS.titre};">${titre}</h1>
${corps}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 26px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
              <tr><td height="1" bgcolor="${COULEURS.bordure}" style="height:1px;background-color:${COULEURS.bordure};font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
            <p style="margin:16px 0 0;font-family:${POLICE};font-size:13px;line-height:19px;mso-line-height-rule:exactly;color:${COULEURS.discret};">${esc(associationName)} — message automatique${details.length ? `<br />${details.map(esc).join(" · ")}` : ""}</p>
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;
}

interface VolunteerCtx {
  name: string;
  eventTitle: string;
  eventDate: string;
  slotTitle: string;
  location?: string | null;
  cancelUrl: string;
  identity?: NotificationIdentity;
}

export function volunteerConfirmationEmail(ctx: VolunteerCtx): EmailContent {
  return {
    // « Inscription confirmée », lu seul dans une boîte mail trois jours plus
    // tard, se prend pour une confirmation de billet.
    subject: `Votre créneau du ${ctx.eventDate} — ${ctx.eventTitle}`,
    html: layout(
      "Merci pour votre coup de main !",
      `${ctx.slotTitle} — ${ctx.eventDate}`,
      `${p(`Bonjour ${esc(ctx.name)},`)}
       ${p("Votre créneau de bénévole est bien enregistré :")}
       ${fiche([
         { label: "Événement", valeur: esc(ctx.eventTitle) },
         { label: "Date", valeur: ctx.eventDate },
         { label: "Mission / créneau", valeur: esc(ctx.slotTitle) },
         { label: "Lieu", valeur: ctx.location ? esc(ctx.location) : null },
       ])}
       ${p("Si vous ne pouvez finalement pas venir, prévenez-nous en un clic :")}
       ${bouton(ctx.cancelUrl, "Me désinscrire")}`,
      ctx.identity,
    ),
    text: `Bonjour ${ctx.name},\n\nCréneau de bénévole confirmé :\n- Événement : ${ctx.eventTitle}\n- Date : ${ctx.eventDate}\n- Créneau : ${ctx.slotTitle}\n${ctx.location ? `- Lieu : ${ctx.location}\n` : ""}\nMe désinscrire : ${ctx.cancelUrl}`,
  };
}

/**
 * Accusé de réception d'une présence annoncée à une réunion.
 *
 * Le lien de retrait est le pendant de la promesse faite sur la page : on peut
 * se décommander sans écrire à personne. « Peut-être » est repris tel quel dans
 * le corps du message — recevoir « Votre présence est confirmée » après avoir
 * coché « peut-être » ferait douter de ce qui a été enregistré.
 */
export function meetingAttendanceConfirmationEmail(ctx: {
  name: string;
  eventTitle: string;
  eventDate: string;
  location?: string | null;
  status: "yes" | "maybe" | "no";
  cancelUrl: string;
  identity?: NotificationIdentity;
}): EmailContent {
  const reponse = {
    yes: "vous serez là",
    maybe: "vous viendrez peut-être",
    no: "vous ne pourrez pas venir",
  }[ctx.status];
  const titre =
    ctx.status === "no" ? "Merci de nous avoir prévenus" : "À bientôt !";
  return {
    subject: `Votre réponse pour la réunion du ${ctx.eventDate}`,
    html: layout(
      titre,
      `Nous avons noté que ${reponse}.`,
      `${p(`Bonjour ${esc(ctx.name)},`)}
       ${p(`Nous avons noté que <strong>${reponse}</strong> :`)}
       ${fiche([
         { label: "Réunion", valeur: esc(ctx.eventTitle) },
         { label: "Date", valeur: ctx.eventDate },
         { label: "Lieu", valeur: ctx.location ? esc(ctx.location) : null },
       ])}
       ${p("Changement de programme ? Vous pouvez retirer votre réponse en un clic :")}
       ${bouton(ctx.cancelUrl, "Retirer ma réponse")}`,
      ctx.identity,
    ),
    text: `Bonjour ${ctx.name},\n\nNous avons noté que ${reponse} :\n- Réunion : ${ctx.eventTitle}\n- Date : ${ctx.eventDate}\n${ctx.location ? `- Lieu : ${ctx.location}\n` : ""}\nRetirer ma réponse : ${ctx.cancelUrl}`,
  };
}

/**
 * L'avis envoyé au bureau quand quelqu'un s'inscrit depuis le site.
 *
 * Jusqu'ici seul le bénévole recevait un e-mail : l'association n'apprenait
 * l'inscription qu'en ouvrant le tableau de bord, donc parfois jamais avant le
 * jour J. Un créneau qui se remplit est pourtant une nouvelle qu'on veut
 * connaître le jour même — c'est elle qui dit s'il faut encore relancer.
 *
 * Les coordonnées sont dans le corps du message et le `Reply-To` porte celle du
 * bénévole : répondre à l'avis écrit à la bonne personne, sans passer par
 * l'écran. Le nombre de places restantes évite d'avoir à vérifier.
 */
export function volunteerSignupNoticeEmail(ctx: {
  name: string;
  email: string | null;
  phone: string | null;
  eventTitle: string;
  eventDate: string;
  slotTitle: string;
  location?: string | null;
  /** Places encore libres sur ce créneau après cette inscription. */
  restantes: number;
  capacite: number;
  eventUrl: string;
  identity?: NotificationIdentity;
}): EmailContent {
  const reste =
    ctx.restantes === 0
      ? "Le créneau est complet."
      : `Il reste ${ctx.restantes} place${ctx.restantes > 1 ? "s" : ""} sur ${ctx.capacite}.`;
  return {
    // Le nom d'abord : c'est ce qu'on lit dans la liste des objets, sur un
    // téléphone, sans ouvrir.
    subject: `${ctx.name} s’inscrit — ${ctx.eventTitle}`,
    html: layout(
      "Une nouvelle inscription",
      `${ctx.name} — ${ctx.slotTitle}. ${reste}`,
      `${p(`<strong>${esc(ctx.name)}</strong> vient de prendre un créneau depuis le site.`)}
       ${fiche([
         { label: "Événement", valeur: esc(ctx.eventTitle) },
         { label: "Date", valeur: ctx.eventDate },
         { label: "Mission / créneau", valeur: esc(ctx.slotTitle) },
         { label: "Lieu", valeur: ctx.location ? esc(ctx.location) : null },
         {
           label: "Téléphone",
           valeur: ctx.phone
             ? lien(
                 `tel:${esc(ctx.phone.replace(/[^+0-9]/g, ""))}`,
                 esc(ctx.phone),
               )
             : null,
         },
         {
           label: "E-mail",
           valeur: ctx.email
             ? lien(`mailto:${esc(ctx.email)}`, esc(ctx.email))
             : null,
         },
       ])}
       ${encart(reste)}
       ${bouton(ctx.eventUrl, "Voir les inscrits")}`,
      ctx.identity,
    ),
    text: `${ctx.name} vient de prendre un créneau depuis le site.

- Événement : ${ctx.eventTitle}
- Date : ${ctx.eventDate}
- Créneau : ${ctx.slotTitle}${ctx.location ? `\n- Lieu : ${ctx.location}` : ""}${ctx.phone ? `\n- Téléphone : ${ctx.phone}` : ""}${ctx.email ? `\n- E-mail : ${ctx.email}` : ""}

${reste}

Voir les inscrits : ${ctx.eventUrl}`,
  };
}

/** Le même avis, pour une réponse de présence à une réunion. */
export function meetingAttendanceNoticeEmail(ctx: {
  name: string;
  email: string | null;
  phone: string | null;
  eventTitle: string;
  eventDate: string;
  location?: string | null;
  status: "yes" | "maybe" | "no";
  eventUrl: string;
  identity?: NotificationIdentity;
}): EmailContent {
  const reponse = {
    yes: "sera là",
    maybe: "viendra peut-être",
    no: "ne pourra pas venir",
  }[ctx.status];
  return {
    subject: `${ctx.name} ${reponse} — ${ctx.eventTitle}`,
    html: layout(
      "Une réponse de présence",
      `${ctx.name} ${reponse} — ${ctx.eventTitle}`,
      `${p(`<strong>${esc(ctx.name)}</strong> a répondu depuis le site : <strong>${reponse}</strong>.`)}
       ${fiche([
         { label: "Réunion", valeur: esc(ctx.eventTitle) },
         { label: "Date", valeur: ctx.eventDate },
         { label: "Lieu", valeur: ctx.location ? esc(ctx.location) : null },
         {
           label: "Téléphone",
           valeur: ctx.phone
             ? lien(
                 `tel:${esc(ctx.phone.replace(/[^+0-9]/g, ""))}`,
                 esc(ctx.phone),
               )
             : null,
         },
         {
           label: "E-mail",
           valeur: ctx.email
             ? lien(`mailto:${esc(ctx.email)}`, esc(ctx.email))
             : null,
         },
       ])}
       ${bouton(ctx.eventUrl, "Voir les réponses")}`,
      ctx.identity,
    ),
    text: `${ctx.name} a répondu depuis le site : ${reponse}.

- Réunion : ${ctx.eventTitle}
- Date : ${ctx.eventDate}${ctx.location ? `\n- Lieu : ${ctx.location}` : ""}${ctx.phone ? `\n- Téléphone : ${ctx.phone}` : ""}${ctx.email ? `\n- E-mail : ${ctx.email}` : ""}

Voir les réponses : ${ctx.eventUrl}`,
  };
}

/**
 * Le récapitulatif quotidien : tout ce qui est arrivé depuis la veille, en un
 * seul message.
 *
 * Il remplace les avis à l'unité quand l'association choisit ce mode. La raison
 * n'est pas que le confort : chaque inscription coûte déjà une confirmation au
 * bénévole, et le palier gratuit de Resend plafonne à 100 e-mails par jour —
 * une grosse opération peut l'épuiser en une soirée, et ce sont alors les
 * confirmations qui sautent.
 *
 * Groupé par rendez-vous, parce que c'est ainsi qu'on le lit : « où en est la
 * kermesse » plutôt que « qui s'est inscrit à 08h12 ».
 */
/** Une tâche d'événement telle qu'elle apparaît dans le récapitulatif. */
type DigestTache = {
  titre: string;
  /** L'événement auquel elle se rattache : une tâche nue ne dit pas pour quoi. */
  evenement: string;
  url: string;
  /** « 3 jours » : depuis quand elle est en retard, ou dans combien de temps. */
  delai: string;
  echeance: string;
  /** Vide = personne d'assigné, ce que le message dit explicitement. */
  responsables: string[];
};

/**
 * Le récapitulatif quotidien adressé au bureau.
 *
 * Deux natures de contenu s'y croisent, et elles ne se comptent pas pareil :
 * les inscriptions sont un *flux* (ce qui est arrivé depuis le dernier envoi,
 * annoncé une fois), les tâches sont un *état* (ce qui reste à traiter
 * aujourd'hui, redit chaque jour tant que ça traîne). C'est voulu : un retard
 * qu'on n'annonce qu'une fois est un retard qu'on oublie. Ne pas « corriger »
 * cette répétition en dédoublonnant les tâches déjà signalées.
 *
 * Les rappels individuels du cron visent les personnes assignées ; ce message
 * vise l'adresse de contact. Même tâche, deux destinataires, deux usages : la
 * vue d'ensemble du bureau d'un côté, le rappel personnel de l'autre.
 */
/**
 * Dit au bureau que le plafond des comptes en attente est atteint. Une seule
 * formule pour le récapitulatif et le rappel : les deux se relaient selon le
 * réglage des avis, et doivent alerter de la même façon.
 */
const FORMULAIRE_DE_DEMANDE_FERME =
  "Le plafond des comptes en attente est atteint : les nouvelles demandes de compte restent sans suite tant que ceux-ci n’ont pas été traités.";

export function dailyDigestEmail(ctx: {
  taches: { enRetard: DigestTache[]; aVenir: DigestTache[] };
  /**
   * Comptes qui attendent leur validation. Un *état*, comme les tâches : redit
   * chaque jour tant que personne n'a tranché, parce qu'une demande annoncée
   * une seule fois est une demande qu'on laisse en plan.
   */
  comptesEnAttente?: {
    nombre: number;
    url: string;
    /** Plafond atteint : les nouvelles demandes restent sans suite. */
    formulaireFerme?: boolean;
  };
  /**
   * Demandes de compte écartées par un plafond depuis le dernier récapitulatif,
   * motif par motif. Un formulaire saturé refuse aussi les parents : sans ces
   * lignes, personne au bureau ne le saurait. `url` mène à l'écran où l'on
   * traite les comptes en attente — le seul motif qui appelle un geste.
   */
  demandesDeCompteIgnorees?: { parMotif: DroppedAccountRequests; url: string };
  /** Un bloc par événement ou réunion ayant reçu des réponses. */
  rendezVous: {
    titre: string;
    date: string;
    url: string;
    /** Inscriptions de bénévoles arrivées dans la fenêtre. */
    inscriptions: {
      nom: string;
      creneau: string;
      phone: string | null;
      email: string | null;
    }[];
    /** Réponses de présence arrivées dans la fenêtre. */
    presences: {
      nom: string;
      statut: "yes" | "maybe" | "no";
      phone: string | null;
      email: string | null;
    }[];
  }[];
  depuis: string;
  identity?: NotificationIdentity;
}): EmailContent {
  const total = ctx.rendezVous.reduce(
    (n, r) => n + r.inscriptions.length + r.presences.length,
    0,
  );
  const nbRetard = ctx.taches.enRetard.length;
  const nbAVenir = ctx.taches.aVenir.length;
  const nbComptes = ctx.comptesEnAttente?.nombre ?? 0;
  const refus = ctx.demandesDeCompteIgnorees
    ? droppedAccountRequestNotices(ctx.demandesDeCompteIgnorees.parMotif)
    : [];
  const nbIgnorees = ctx.demandesDeCompteIgnorees
    ? totalDroppedAccountRequests(ctx.demandesDeCompteIgnorees.parMotif)
    : 0;
  const REPONSE = { yes: "sera là", maybe: "peut-être", no: "ne viendra pas" };
  const s = (n: number) => (n > 1 ? "s" : "");
  const libelleComptes = `${nbComptes} compte${s(nbComptes)} en attente de validation`;
  const TRAITER_LES_COMPTES = "Traiter les comptes en attente";

  const coord = (phone: string | null, email: string | null) => {
    const bouts = [
      phone
        ? lien(`tel:${esc(phone.replace(/[^+0-9]/g, ""))}`, esc(phone))
        : null,
      email ? lien(`mailto:${esc(email)}`, esc(email)) : null,
    ].filter(Boolean);
    return bouts.length ? ` · ${bouts.join(" · ")}` : "";
  };

  // Qui s'en occupe. L'absence de responsable est la vraie information : c'est
  // la tâche que personne ne réclamera d'elle-même.
  const qui = (noms: string[]) =>
    noms.length
      ? `<span style="color:${COULEURS.discret};">${noms.map(esc).join(", ")}</span>`
      : `<span style="color:${COULEURS.alerte};font-style:italic;">personne d’assigné</span>`;

  /**
   * Une tâche, en carte : filet coloré à gauche, fond teinté. Le filet dit
   * l'urgence même en noir et blanc, puisque sa largeur ne dépend d'aucune
   * couleur.
   */
  const carteTache = (t: DigestTache, retard: boolean) => {
    const couleur = retard ? COULEURS.alerte : COULEURS.bandeau;
    const fond = retard ? COULEURS.alerteFond : COULEURS.encadre;
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 10px;">
        <tr>
          <td width="4" bgcolor="${couleur}" style="width:4px;background-color:${couleur};font-size:0;line-height:0;">&nbsp;</td>
          <td bgcolor="${fond}" style="padding:13px 16px;background-color:${fond};font-family:${POLICE};font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:${COULEURS.texte};">
            <a href="${t.url}" style="color:${COULEURS.lien};font-weight:bold;text-decoration:none;">${esc(t.titre)}</a>
            <span style="color:${COULEURS.discret};"> — ${esc(t.evenement)}</span><br />
            <span style="color:${couleur};font-weight:bold;">${
              retard
                ? `en retard depuis ${t.delai}`
                : `à traiter dans ${t.delai}`
            }</span><span style="color:${COULEURS.discret};font-size:14px;"> · échéance ${t.echeance}</span><br />
            <span style="font-size:14px;">${qui(t.responsables)}</span>
          </td>
        </tr>
      </table>`;
  };

  const sectionTaches = (
    titre: string,
    couleur: string,
    liste: DigestTache[],
    retard: boolean,
  ) =>
    liste.length
      ? `${section(titre, couleur)}${liste.map((t) => carteTache(t, retard)).join("")}`
      : "";

  const blocsInscriptions = ctx.rendezVous
    .map(
      (r) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COULEURS.encadre}" style="width:100%;margin:0 0 12px;background-color:${COULEURS.encadre};border:1px solid ${COULEURS.bordure};border-radius:10px;">
        <tr>
          <td style="padding:16px 18px;font-family:${POLICE};font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:${COULEURS.texte};">
            <span style="font-size:16px;font-weight:bold;color:${COULEURS.titre};">${esc(r.titre)}</span><br />
            <span style="font-size:14px;color:${COULEURS.discret};">${r.date}</span>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:10px 0 0;">
              ${[
                ...r.inscriptions.map(
                  (i) =>
                    `<strong>${esc(i.nom)}</strong> — ${esc(i.creneau)}${coord(i.phone, i.email)}`,
                ),
                ...r.presences.map(
                  (pr) =>
                    `<strong>${esc(pr.nom)}</strong> — ${REPONSE[pr.statut]}${coord(pr.phone, pr.email)}`,
                ),
              ]
                .map(
                  (ligne) =>
                    `<tr><td style="padding:0 0 6px;font-family:${POLICE};font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:${COULEURS.texte};">${ligne}</td></tr>`,
                )
                .join("")}
            </table>
            <a href="${r.url}" style="display:inline-block;margin-top:6px;font-family:${POLICE};font-size:14px;font-weight:bold;color:${COULEURS.lien};text-decoration:underline;">Ouvrir le rendez-vous</a>
          </td>
        </tr>
      </table>`,
    )
    .join("");

  // En tête du message : c'est la seule rubrique où quelqu'un attend, bloqué,
  // une réponse du bureau — et la seule qui touche à qui entre dans l'espace.
  const blocComptes =
    nbComptes > 0 && ctx.comptesEnAttente
      ? `${encart(
          nbComptes > 1
            ? `${libelleComptes}. Tant qu’un administrateur ne les a pas validés, ces comptes ne voient rien.`
            : `${libelleComptes}. Tant qu’un administrateur ne l’a pas validé, ce compte ne voit rien.`,
        )}${
          ctx.comptesEnAttente.formulaireFerme
            ? encart(FORMULAIRE_DE_DEMANDE_FERME, "alerte")
            : ""
        }${bouton(ctx.comptesEnAttente.url, "Valider ou refuser")}`
      : "";

  // Juste après : ces refus parlent eux aussi de qui peut entrer. Une ligne
  // par motif, parce qu'ils ne demandent pas la même chose : la plupart
  // viennent d'un robot et n'appellent aucun geste — un encart d'alerte
  // crierait pour rien —, mais ceux dus aux comptes en attente disent que le
  // formulaire reste fermé tant que le bureau n'a pas fait le tri.
  const blocIgnorees = refus
    .map(
      (r) =>
        `${p(`<strong>${esc(r.nombre)}</strong> depuis ${ctx.depuis} : ${esc(r.motif)}.`, "margin-bottom:4px;")}${pDiscret(
          r.reason === "comptes_en_attente" && ctx.demandesDeCompteIgnorees
            ? `${esc(r.explication)} ${lien(ctx.demandesDeCompteIgnorees.url, TRAITER_LES_COMPTES)}.`
            : esc(r.explication),
        )}`,
    )
    .join("");

  const corps = [
    blocComptes,
    blocIgnorees,
    sectionTaches(
      `En retard — ${nbRetard} tâche${s(nbRetard)}`,
      COULEURS.alerte,
      ctx.taches.enRetard,
      true,
    ),
    sectionTaches(
      `À traiter bientôt — ${nbAVenir} tâche${s(nbAVenir)}`,
      COULEURS.bandeau,
      ctx.taches.aVenir,
      false,
    ),
    total > 0
      ? `${section(`Nouvelles réponses depuis ${ctx.depuis}`)}${blocsInscriptions}`
      : "",
  ]
    .filter(Boolean)
    .join("");

  // Le sujet dit ce qu'il y a dedans : c'est souvent tout ce qu'on lira du
  // message avant de décider d'y revenir ou non.
  const partTaches =
    nbRetard && nbAVenir
      ? `${nbRetard} tâche${s(nbRetard)} en retard · ${nbAVenir} à venir`
      : nbRetard
        ? `${nbRetard} tâche${s(nbRetard)} en retard`
        : nbAVenir
          ? `${nbAVenir} tâche${s(nbAVenir)} à venir`
          : null;
  const subject =
    [
      nbComptes ? libelleComptes : null,
      partTaches,
      nbIgnorees
        ? `${nbIgnorees} demande${s(nbIgnorees)} de compte écartée${s(nbIgnorees)}`
        : null,
      total ? `${total} nouvelle${s(total)} inscription${s(total)}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Rien à signaler";

  const texteTaches = (titre: string, liste: DigestTache[], retard: boolean) =>
    liste.length
      ? `${titre}\n${liste
          .map(
            (t) =>
              `  - ${t.titre} (${t.evenement}) — ${
                retard
                  ? `en retard depuis ${t.delai}`
                  : `à traiter dans ${t.delai}`
              }, échéance ${t.echeance}\n    ${
                t.responsables.length
                  ? t.responsables.join(", ")
                  : "personne d’assigné"
              }\n    ${t.url}`,
          )
          .join("\n")}`
      : null;

  const texteInscriptions = ctx.rendezVous
    .map((r) => {
      const lignes = [
        ...r.inscriptions.map(
          (i) =>
            `  - ${i.nom} — ${i.creneau}${i.phone ? ` — ${i.phone}` : ""}${i.email ? ` — ${i.email}` : ""}`,
        ),
        ...r.presences.map(
          (p) =>
            `  - ${p.nom} — ${REPONSE[p.statut]}${p.phone ? ` — ${p.phone}` : ""}${p.email ? ` — ${p.email}` : ""}`,
        ),
      ];
      return `${r.titre} (${r.date})\n${lignes.join("\n")}\n  ${r.url}`;
    })
    .join("\n\n");

  const texte = [
    nbComptes && ctx.comptesEnAttente
      ? `${libelleComptes.toUpperCase()}\n${
          ctx.comptesEnAttente.formulaireFerme
            ? `  ${FORMULAIRE_DE_DEMANDE_FERME}\n`
            : ""
        }  Valider ou refuser : ${ctx.comptesEnAttente.url}`
      : null,
    ...refus.map((r) =>
      [
        `${r.nombre.toUpperCase()} DEPUIS ${ctx.depuis} : ${r.motif}.`,
        `  ${r.explication}`,
        r.reason === "comptes_en_attente" && ctx.demandesDeCompteIgnorees
          ? `  ${TRAITER_LES_COMPTES} : ${ctx.demandesDeCompteIgnorees.url}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    texteTaches("EN RETARD", ctx.taches.enRetard, true),
    texteTaches("À TRAITER BIENTÔT", ctx.taches.aVenir, false),
    total
      ? `NOUVELLES RÉPONSES DEPUIS ${ctx.depuis}\n${texteInscriptions}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    subject,
    html: layout("Le point du jour", subject, corps, ctx.identity),
    text: texte,
  };
}

/**
 * L'annonce d'une annulation aux personnes inscrites.
 *
 * Le sujet dit « Annulé » en premier mot : c'est ce qu'on lit dans une liste
 * de messages, sur un téléphone, sans ouvrir — et c'est l'information qui
 * évite un déplacement pour rien.
 *
 * Le motif est facultatif parce qu'il l'est souvent en vrai : une annulation
 * se décide parfois vite, et attendre d'avoir la bonne formule retarderait le
 * message. Sans motif, le message reste franc plutôt que d'en inventer un.
 */
export function eventCancelledEmail(ctx: {
  eventTitle: string;
  eventDate: string;
  location?: string | null;
  /** Ce que l'équipe a bien voulu dire, s'il y a lieu. */
  raison?: string | null;
  /** Une réunion s'annule aussi, et ne se dit pas comme une fête. */
  isMeeting?: boolean;
  identity?: NotificationIdentity;
}): EmailContent {
  const mot = ctx.isMeeting ? "La réunion" : "L\u2019événement";
  const raison = ctx.raison?.trim();
  return {
    subject: `Annulé — ${ctx.eventTitle}`,
    html: layout(
      "C\u2019est annulé",
      `${ctx.eventTitle} du ${ctx.eventDate} n\u2019aura pas lieu.`,
      `${p(`${mot} <strong>${esc(ctx.eventTitle)}</strong> n\u2019aura pas lieu.`)}
       ${fiche([
         { label: ctx.isMeeting ? "Réunion" : "Événement", valeur: esc(ctx.eventTitle) },
         { label: "Date prévue", valeur: ctx.eventDate },
         { label: "Lieu", valeur: ctx.location ? esc(ctx.location) : null },
       ])}
       ${raison ? citation(escLignes(raison)) : ""}
       ${p("Vous n\u2019avez rien à faire : votre inscription est sans suite. Merci d\u2019y avoir répondu, et à une prochaine fois.")}`,
      ctx.identity,
    ),
    text: `${mot} ${ctx.eventTitle} n\u2019aura pas lieu.

Date prévue : ${ctx.eventDate}${ctx.location ? `\nLieu : ${ctx.location}` : ""}${raison ? `\n\n${raison}` : ""}

Vous n\u2019avez rien à faire : votre inscription est sans suite. Merci d\u2019y avoir répondu, et à une prochaine fois.`,
  };
}

export function volunteerReminderEmail(ctx: VolunteerCtx): EmailContent {
  return {
    subject: `Rappel — ${ctx.eventTitle}, c'est bientôt !`,
    html: layout(
      "C'est pour bientôt !",
      `${ctx.slotTitle} — ${ctx.eventDate}`,
      `${p(`Bonjour ${esc(ctx.name)},`)}
       ${p("Petit rappel : vous êtes inscrit·e comme bénévole.")}
       ${fiche([
         { label: "Événement", valeur: esc(ctx.eventTitle) },
         { label: "Date", valeur: ctx.eventDate },
         { label: "Mission / créneau", valeur: esc(ctx.slotTitle) },
         { label: "Lieu", valeur: ctx.location ? esc(ctx.location) : null },
       ])}
       ${p("Merci pour votre aide ! Empêchement de dernière minute ?")}
       ${bouton(ctx.cancelUrl, "Me désinscrire")}`,
      ctx.identity,
    ),
    text: `Bonjour ${ctx.name},\n\nRappel : bénévole pour ${ctx.eventTitle} (${ctx.eventDate}), créneau ${ctx.slotTitle}.\nMe désinscrire : ${ctx.cancelUrl}`,
  };
}

/**
 * Le rappel d'une tâche à la personne qui en a la charge.
 *
 * Il était jusqu'ici mis en page à part, dans un `<div>` que le moteur de Word
 * rend mal, et restait le seul message sans l'en-tête de l'association.
 *
 * Le lien mène à la tâche elle-même, dans la check-list de son événement, et
 * non à la liste « Mes tâches » : le message parle d'une tâche précise, c'est
 * elle qu'on veut trouver en cliquant.
 */
export function taskDueEmail(ctx: {
  name: string;
  taskTitle: string;
  eventTitle: string;
  /** Date de traitement, déjà mise en forme. */
  due: string;
  kind: "reminder" | "overdue";
  taskUrl: string;
  identity?: NotificationIdentity;
}): EmailContent {
  const heading =
    ctx.kind === "overdue"
      ? `⏰ Tâche à traiter maintenant : ${ctx.taskTitle}`
      : `🔔 Tâche bientôt à traiter : ${ctx.taskTitle}`;
  const tache = esc(ctx.taskTitle);
  const evenement = esc(ctx.eventTitle);
  const htmlIntro =
    ctx.kind === "overdue"
      ? `La tâche « <strong>${tache}</strong> » pour l'événement « <strong>${evenement}</strong> » est à traiter <strong>à partir de maintenant</strong> (date de traitement : ${ctx.due}).`
      : `La tâche « <strong>${tache}</strong> » pour l'événement « <strong>${evenement}</strong> » pourra être traitée à partir du <strong>${ctx.due}</strong>.`;
  const textIntro =
    ctx.kind === "overdue"
      ? `La tâche « ${ctx.taskTitle} » pour l'événement « ${ctx.eventTitle} » est à traiter à partir de maintenant (date de traitement : ${ctx.due}).`
      : `La tâche « ${ctx.taskTitle} » pour l'événement « ${ctx.eventTitle} » pourra être traitée à partir du ${ctx.due}.`;
  return {
    subject: heading,
    html: layout(
      esc(heading),
      ctx.kind === "overdue"
        ? `${ctx.eventTitle} — à traiter dès maintenant.`
        : `${ctx.eventTitle} — à traiter à partir du ${ctx.due}.`,
      `${p(`Bonjour ${esc(ctx.name)},`)}
       ${p(htmlIntro)}
       ${bouton(ctx.taskUrl, "Voir la tâche")}`,
      ctx.identity,
    ),
    text: `${heading}\n\nBonjour ${ctx.name},\n${textIntro}\n\nVoir la tâche : ${ctx.taskUrl}`,
  };
}

export function broadcastEmail(ctx: {
  subject: string;
  message: string;
  senderName?: string;
  identity?: NotificationIdentity;
}): EmailContent {
  const paragraphes = ctx.message
    .split(/\n{2,}/)
    .map((bloc) => p(escLignes(bloc)))
    .join("");
  return {
    subject: ctx.subject,
    html: layout(
      esc(ctx.subject),
      ctx.message.slice(0, 120),
      `${paragraphes}${ctx.senderName ? pDiscret(`— ${esc(ctx.senderName)}`) : ""}`,
      ctx.identity,
    ),
    text: `${ctx.message}${ctx.senderName ? `\n\n— ${ctx.senderName}` : ""}`,
  };
}

/**
 * Le lien qui confirme une demande de compte, envoyé à l'adresse saisie.
 *
 * Il ne reprend pas le nom saisi : n'importe qui peut remplir le formulaire
 * avec l'adresse de n'importe qui, et ce message, parti de l'adresse de
 * l'association, ne doit pas porter un texte choisi par un inconnu. Il dit
 * aussi quoi faire quand on n'a rien demandé : rien.
 */
export function accountRequestEmail(ctx: {
  confirmUrl: string;
  validiteJours: number;
  identity?: NotificationIdentity;
}): EmailContent {
  const associationName = ctx.identity?.associationName || APP_NAME;
  const validite = `${ctx.validiteJours} jour${ctx.validiteJours > 1 ? "s" : ""}`;
  return {
    subject: `Confirmez votre demande de compte — ${associationName}`,
    html: layout(
      "Confirmez votre demande de compte",
      "Ouvrez le lien pour confirmer votre adresse et choisir votre mot de passe.",
      `${p("Bonjour,")}
       ${p(`Une demande de compte vient d’être faite avec cette adresse sur l’espace de gestion de l’association <strong>${esc(associationName)}</strong>. Pour la confirmer, ouvrez ce lien : vous y choisirez votre mot de passe. Il est valable <strong>${validite}</strong>.`)}
       ${bouton(ctx.confirmUrl, "Confirmer ma demande")}
       ${p("Un administrateur de l’association validera ensuite votre compte. Vous recevrez un e-mail à ce moment-là.")}
       ${pDiscret("Vous n’êtes pas à l’origine de cette demande ? Ignorez ce message : aucun compte n’est créé sans cette confirmation.")}`,
      ctx.identity,
    ),
    text: `Bonjour,

Une demande de compte vient d'être faite avec cette adresse sur l'espace de gestion de l'association ${associationName}. Pour la confirmer et choisir votre mot de passe, ouvrez ce lien (valable ${validite}) :
${ctx.confirmUrl}

Un administrateur de l'association validera ensuite votre compte. Vous recevrez un e-mail à ce moment-là.

Vous n'êtes pas à l'origine de cette demande ? Ignorez ce message : aucun compte n'est créé sans cette confirmation.`,
  };
}

/**
 * La réponse à une demande de compte faite avec une adresse qui en a déjà un.
 *
 * L'écran d'inscription répond la même chose dans les deux cas, pour ne pas
 * apprendre à un inconnu quelles adresses ont un compte. C'est ce message,
 * que seul le titulaire de l'adresse reçoit, qui lui dit la différence — et
 * comment rentrer s'il avait oublié son mot de passe.
 */
export function existingAccountEmail(ctx: {
  name: string;
  loginUrl: string;
  forgotUrl: string;
  identity?: NotificationIdentity;
}): EmailContent {
  const associationName = ctx.identity?.associationName || APP_NAME;
  return {
    subject: `Vous avez déjà un compte — ${associationName}`,
    html: layout(
      "Vous avez déjà un compte",
      "Aucun nouveau compte n’a été créé : connectez-vous avec celui-ci.",
      `${p(`Bonjour ${esc(ctx.name)},`)}
       ${p(`Une demande de compte vient d’être faite avec votre adresse, mais vous avez déjà un compte sur l’espace de gestion de l’association <strong>${esc(associationName)}</strong>. Aucun nouveau compte n’a été créé.`)}
       ${bouton(ctx.loginUrl, "Me connecter")}
       ${p(`Mot de passe oublié ? ${lien(ctx.forgotUrl, "Choisissez-en un nouveau")}.`)}
       ${pDiscret("Vous n’êtes pas à l’origine de cette demande ? Ignorez ce message : votre compte n’a pas changé.")}`,
      ctx.identity,
    ),
    text: `Bonjour ${ctx.name},

Une demande de compte vient d'être faite avec votre adresse, mais vous avez déjà un compte sur l'espace de gestion de l'association ${associationName}. Aucun nouveau compte n'a été créé.

Me connecter : ${ctx.loginUrl}
Mot de passe oublié : ${ctx.forgotUrl}

Vous n'êtes pas à l'origine de cette demande ? Ignorez ce message : votre compte n'a pas changé.`,
  };
}

/**
 * L'avis au bureau qu'un compte attend sa validation, quand l'association a
 * choisi d'être prévenue à chaque inscription.
 *
 * Il ne part qu'une fois l'adresse confirmée depuis sa boîte, et il le dit :
 * c'est l'adresse qu'il faut reconnaître, le nom n'étant que celui que la
 * personne a saisi. Le bouton mène à l'écran où l'on valide ; valider depuis
 * un lien d'e-mail ferait d'un message transféré par erreur une clé d'entrée.
 *
 * `enAttente` compte tous les comptes en attente, celui-ci compris. Les avis
 * se suspendent quand les demandes affluent : le suivant rattrape ainsi ceux
 * qui ne sont pas partis.
 */
export function pendingAccountNoticeEmail(ctx: {
  name: string;
  email: string;
  enAttente: number;
  reviewUrl: string;
  identity?: NotificationIdentity;
}): EmailContent {
  const autres =
    ctx.enAttente > 1
      ? `En tout, ${ctx.enAttente} comptes attendent une décision.`
      : null;
  return {
    subject: `Compte à valider — ${ctx.name}`,
    html: layout(
      "Un compte attend sa validation",
      `${ctx.name} demande à rejoindre l’espace de gestion.`,
      `${p(`<strong>${esc(ctx.name)}</strong> demande à rejoindre l’espace de gestion. Tant qu’un administrateur n’a pas validé ce compte, il ne voit rien.`)}
       ${fiche([
         { label: "Nom déclaré", valeur: esc(ctx.name) },
         {
           label: "Adresse confirmée",
           valeur: lien(`mailto:${esc(ctx.email)}`, esc(ctx.email)),
         },
       ])}
       ${autres ? encart(autres) : ""}
       ${pDiscret("L’adresse a été confirmée depuis sa boîte e-mail ; le nom est celui que la personne a saisi. Si vous ne reconnaissez pas l’adresse, refusez la demande : le compte sera supprimé.")}
       ${bouton(ctx.reviewUrl, "Valider ou refuser")}`,
      ctx.identity,
    ),
    text: [
      `${ctx.name} (${ctx.email}) demande à rejoindre l'espace de gestion. Tant qu'un administrateur n'a pas validé ce compte, il ne voit rien.`,
      autres,
      "L'adresse a été confirmée depuis sa boîte e-mail ; le nom est celui que la personne a saisi. Si vous ne reconnaissez pas l'adresse, refusez la demande : le compte sera supprimé.",
      `Valider ou refuser : ${ctx.reviewUrl}`,
    ]
      .filter((ligne): ligne is string => Boolean(ligne))
      .join("\n\n"),
  };
}

/**
 * Le rappel quotidien des comptes qui attendent leur validation, quand le
 * récapitulatif ne l'a pas déjà porté : en mode « immédiat » ou « aucun », ou
 * sans adresse de contact pour le recevoir.
 *
 * Il ne dépend pas du réglage des avis d'inscription, et le dit : ce réglage
 * dose les nouvelles d'inscription, pas le sort d'une personne bloquée à
 * l'entrée. En mode « aucun », rien d'autre ne l'aurait signalé hors de
 * l'application ; en mode « immédiat », les avis se taisent quand les comptes
 * affluent, et un avis lu une fois s'oublie.
 *
 * `formulaireFerme` : le plafond des comptes en attente est atteint, et les
 * nouvelles demandes restent sans suite tant que le bureau n'a pas fait le tri.
 */
export function pendingAccountsReminderEmail(ctx: {
  enAttente: number;
  formulaireFerme: boolean;
  reviewUrl: string;
  identity?: NotificationIdentity;
}): EmailContent {
  const associationName = ctx.identity?.associationName || APP_NAME;
  const plusieurs = ctx.enAttente > 1;
  const libelle = plusieurs
    ? `${ctx.enAttente} comptes en attente de validation`
    : "1 compte en attente de validation";
  const etat = plusieurs
    ? `${ctx.enAttente} comptes attendent qu’un administrateur les valide ou les refuse. D’ici là, ils ne voient rien de l’espace de gestion.`
    : "Un compte attend qu’un administrateur le valide ou le refuse. D’ici là, il ne voit rien de l’espace de gestion.";
  const ferme = FORMULAIRE_DE_DEMANDE_FERME;
  const pourquoi =
    "Ce rappel part chaque jour tant qu’un compte attend, quel que soit le réglage des avis d’inscription.";
  return {
    subject: `${libelle} — ${associationName}`,
    html: layout(
      plusieurs
        ? "Des comptes attendent leur validation"
        : "Un compte attend sa validation",
      libelle,
      `${p(etat)}
       ${ctx.formulaireFerme ? encart(ferme, "alerte") : ""}
       ${bouton(ctx.reviewUrl, "Valider ou refuser")}
       ${pDiscret(pourquoi)}`,
      ctx.identity,
    ),
    text: [
      etat,
      ctx.formulaireFerme ? ferme : null,
      `Valider ou refuser : ${ctx.reviewUrl}`,
      pourquoi,
    ]
      .filter((ligne): ligne is string => Boolean(ligne))
      .join("\n\n"),
  };
}

/**
 * La réponse à la personne dont le compte vient d'être validé. Sans elle, il
 * ne lui resterait qu'à revenir essayer de temps en temps.
 */
export function accountApprovedEmail(ctx: {
  name: string;
  loginUrl: string;
  identity?: NotificationIdentity;
}): EmailContent {
  const associationName = ctx.identity?.associationName || APP_NAME;
  return {
    subject: `Votre compte est validé — ${associationName}`,
    html: layout(
      "Votre compte est validé",
      "Vous pouvez vous connecter à l’espace de gestion.",
      `${p(`Bonjour ${esc(ctx.name)},`)}
       ${p(`Un administrateur de l’association <strong>${esc(associationName)}</strong> a validé votre compte. Connectez-vous avec l’adresse et le mot de passe choisis à l’inscription.`)}
       ${bouton(ctx.loginUrl, "Me connecter")}`,
      ctx.identity,
    ),
    text: `Bonjour ${ctx.name},

Un administrateur de l'association ${associationName} a validé votre compte. Connectez-vous avec l'adresse et le mot de passe choisis à l'inscription : ${ctx.loginUrl}`,
  };
}

export function passwordResetEmail(ctx: {
  name: string;
  resetUrl: string;
  identity?: NotificationIdentity;
}): EmailContent {
  const associationName = ctx.identity?.associationName || APP_NAME;
  return {
    subject: `Réinitialisation de votre mot de passe — ${associationName}`,
    html: layout(
      "Réinitialisation du mot de passe",
      "Votre lien est valable une heure.",
      `${p(`Bonjour ${esc(ctx.name)},`)}
       ${p("Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable <strong>1 heure</strong> :")}
       ${bouton(ctx.resetUrl, "Choisir un nouveau mot de passe")}
       ${pDiscret("Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : rien ne change tant que le lien n'est pas ouvert.")}`,
      ctx.identity,
    ),
    text: `Bonjour ${ctx.name},\n\nRéinitialisez votre mot de passe (valable 1h) : ${ctx.resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
  };
}

export function mailSettingsTestEmail(
  identity: NotificationIdentity,
): EmailContent {
  const associationName = identity.associationName.trim() || APP_NAME;
  return {
    subject: `Test de messagerie — ${associationName}`,
    html: layout(
      "La messagerie fonctionne",
      `L’envoi sortant de ${associationName} est correctement configuré.`,
      `${p(`Ce message confirme que l’envoi sortant de <strong>${esc(associationName)}</strong> est correctement configuré.`)}
       ${fiche([
         {
           label: "Établissement",
           valeur: identity.schoolName?.trim()
             ? esc(identity.schoolName.trim())
             : null,
         },
         {
           label: "RNA",
           valeur: identity.rna?.trim() ? esc(identity.rna.trim()) : null,
         },
       ])}`,
      identity,
    ),
    text: [
      `La messagerie de ${associationName} est correctement configurée.`,
      identity.schoolName?.trim()
        ? `Établissement : ${identity.schoolName.trim()}`
        : null,
      identity.rna?.trim() ? `RNA ${identity.rna.trim()}` : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join("\n"),
  };
}

/** Message envoyé à l'association depuis la page « Rejoindre l'APEL ». */
/** Intitulés lisibles des sujets, côté e-mail. */
const SUJET_LABELS: Record<string, string> = {
  enseignant: "Relation avec un enseignant",
  classe: "Vie de la classe",
  periscolaire: "Cantine, garderie, périscolaire",
  enfant: "Situation d’un enfant",
  autre: "Autre sujet",
};

/**
 * Message d'une famille en difficulté avec l'école. L'objet reste neutre : cet e-mail arrive dans une boîte
 * partagée, et son sujet ne doit pas exposer une situation d'enfant dans une
 * liste de messages.
 */
export function familyMessageEmail(ctx: {
  name: string;
  email: string;
  phone?: string | null;
  schoolClass?: string | null;
  topic: string;
  message: string;
  identity?: NotificationIdentity;
}): EmailContent {
  const association = ctx.identity?.associationName || APP_NAME;
  const sujet = SUJET_LABELS[ctx.topic] ?? SUJET_LABELS.autre;
  return {
    subject: `Une famille vous écrit — ${ctx.name}`,
    // L'aperçu reste neutre lui aussi : il s'affiche dans la liste des
    // messages, à côté de l'objet, et ne doit pas plus exposer la situation.
    html: layout(
      "Une famille demande à être accompagnée",
      `${ctx.name} vous écrit depuis le site.`,
      `${fiche([
         { label: "Sujet", valeur: esc(sujet) },
         { label: "Nom", valeur: esc(ctx.name) },
         {
           label: "E-mail",
           valeur: lien(`mailto:${esc(ctx.email)}`, esc(ctx.email)),
         },
         {
           label: "Téléphone",
           valeur: ctx.phone?.trim() ? esc(ctx.phone.trim()) : null,
         },
         {
           label: "Classe",
           valeur: ctx.schoolClass?.trim()
             ? esc(ctx.schoolClass.trim())
             : null,
         },
       ])}
       ${citation(escLignes(ctx.message))}
       ${bouton(`mailto:${esc(ctx.email)}`, "Répondre à la famille")}`,
      ctx.identity,
    ),
    text: `Une famille vous écrit depuis le site de ${association}.

Sujet : ${sujet}
Nom : ${ctx.name}
E-mail : ${ctx.email}${ctx.phone?.trim() ? `\nTéléphone : ${ctx.phone.trim()}` : ""}${ctx.schoolClass?.trim() ? `\nClasse : ${ctx.schoolClass.trim()}` : ""}

${ctx.message}`,
  };
}

export function joinRequestEmail(ctx: {
  name: string;
  email: string;
  phone?: string | null;
  message: string;
  intention?: "adherer" | "coup_de_main" | "les_deux" | "question";
  /** Le montant figure déjà sur la page publique : inutile de le redemander. */
  feePublished?: boolean;
  identity?: NotificationIdentity;
}): EmailContent {
  const association = ctx.identity?.associationName || APP_NAME;
  const aRepondreSurLaCotisation = ctx.feePublished
    ? "la marche à suivre pour régler"
    : "le montant de la cotisation de cette année et la marche à suivre pour régler";
  // L'intention porte jusqu'à l'objet du message : le bureau lit sa boîte sur
  // un téléphone, et une demande d'adhésion n'attend pas la même réponse
  // qu'une proposition de coup de main. Quand elle manque — vieux client, appel
  // direct de l'API — on le dit, plutôt que de ranger la demande au hasard.
  const intentions = {
    adherer: {
      objet: "Demande d’adhésion",
      titre: "Une famille souhaite adhérer",
      ligne: `Cette personne veut devenir membre de l’association. Indiquez-lui ${aRepondreSurLaCotisation}.`,
    },
    coup_de_main: {
      objet: "Proposition de coup de main",
      titre: "Quelqu’un propose un coup de main",
      ligne:
        "Cette personne propose de l’aide sur un rendez-vous. Elle n’a pas demandé à adhérer.",
    },
    les_deux: {
      objet: "Adhésion + coup de main",
      titre: "Une famille souhaite adhérer et donner un coup de main",
      ligne: `Cette personne veut devenir membre et propose aussi de l’aide. Indiquez-lui ${aRepondreSurLaCotisation}, et les créneaux où il manque des bras.`,
    },
    question: {
      objet: "Question depuis le site",
      titre: "Quelqu’un vous écrit depuis le site",
      ligne: "",
    },
    inconnue: {
      objet: "Message depuis le site",
      titre: "Quelqu’un vous écrit depuis le site",
      ligne:
        "Intention non précisée : lisez le message avant de répondre, il peut s’agir d’une demande d’adhésion.",
    },
  } as const;
  const intention = intentions[ctx.intention ?? "inconnue"];
  return {
    subject: `${intention.objet} — ${ctx.name}`,
    html: layout(
      intention.titre,
      `${ctx.name} — ${intention.objet.toLowerCase()}`,
      `${fiche([
         { label: "Nom", valeur: esc(ctx.name) },
         {
           label: "E-mail",
           valeur: lien(`mailto:${esc(ctx.email)}`, esc(ctx.email)),
         },
         {
           label: "Téléphone",
           valeur: ctx.phone?.trim() ? esc(ctx.phone.trim()) : null,
         },
       ])}
       ${intention.ligne ? encart(esc(intention.ligne)) : ""}
       ${citation(escLignes(ctx.message))}
       ${bouton(`mailto:${esc(ctx.email)}`, "Répondre")}`,
      ctx.identity,
    ),
    text: `${intention.objet} sur le site de ${association}.

Nom : ${ctx.name}
E-mail : ${ctx.email}${ctx.phone?.trim() ? `\nTéléphone : ${ctx.phone.trim()}` : ""}${intention.ligne ? `\n\n${intention.ligne}` : ""}

${ctx.message}`,
  };
}

/**
 * L'accusé de réception envoyé au parent qui vient d'écrire.
 *
 * `/api/join` n'écrit rien en base — c'est délibéré, il n'y a donc aucun
 * fichier de prospects à protéger. Mais cela laisse l'écran de confirmation
 * comme seule trace de la demande, et cet écran meurt à la fermeture de
 * l'onglet. Pour une démarche qui engage un paiement, c'est un trou : le parent
 * ne sait plus s'il a écrit, ni à qui. Une copie dans sa boîte le referme.
 *
 * Aucun montant, aucun circuit de règlement : ces choses varient d'une
 * association à l'autre, et c'est le bureau qui les dira dans sa réponse.
 */
export function joinRequestAckEmail(ctx: {
  name: string;
  message: string;
  intention?: "adherer" | "coup_de_main" | "les_deux" | "question";
  /** Le montant figure déjà sur la page publique : ne pas promettre de l'annoncer. */
  feePublished?: boolean;
  contactEmail: string;
  identity?: NotificationIdentity;
}): EmailContent {
  const association = ctx.identity?.associationName || APP_NAME;
  const adhesion = ctx.intention === "adherer" || ctx.intention === "les_deux";
  const titre = adhesion
    ? "Votre demande d’adhésion est bien arrivée"
    : "Votre message est bien arrivé";
  const suite = adhesion
    ? ctx.feePublished
      ? "Un parent du bureau vous répondra par e-mail avec la marche à suivre pour régler la cotisation."
      : "Un parent du bureau vous répondra par e-mail avec le montant de la cotisation pour cette année scolaire et la marche à suivre pour régler."
    : "Un parent de l’équipe vous répondra par e-mail.";

  return {
    subject: `${titre} — ${association}`,
    html: layout(
      titre,
      suite,
      `${p(`Bonjour ${esc(ctx.name)},`)}
       ${p(`Nous avons bien reçu ce que vous nous avez écrit sur le site de ${esc(association)}. ${esc(suite)} Comptez quelques jours ; sans nouvelles, écrivez-nous directement.`)}
       ${pDiscret("Votre message :")}
       ${citation(escLignes(ctx.message))}
       ${bouton(`mailto:${esc(ctx.contactEmail)}`, "Nous écrire")}`,
      ctx.identity,
    ),
    text: `Bonjour ${ctx.name},

Nous avons bien reçu ce que vous nous avez écrit sur le site de ${association}. ${suite} Comptez quelques jours ; sans nouvelles, écrivez-nous à ${ctx.contactEmail}.

Votre message :
${ctx.message}`,
  };
}
