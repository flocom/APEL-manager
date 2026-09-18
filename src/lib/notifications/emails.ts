import { APP_NAME } from "@/lib/app-config";

interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface NotificationIdentity {
  associationName: string;
  schoolName?: string | null;
  rna?: string | null;
}

function layout(
  title: string,
  bodyHtml: string,
  identity?: NotificationIdentity,
): string {
  const associationName = identity?.associationName || APP_NAME;
  const details = [
    identity?.schoolName?.trim(),
    identity?.rna?.trim() ? `RNA ${identity.rna.trim()}` : null,
  ].filter((value): value is string => Boolean(value));

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;color:#0f172a;">
    <h2 style="color:#075d8d;">${title}</h2>
    ${bodyHtml}
    <p style="color:#94a3b8;font-size:13px;margin-top:28px;">${esc(associationName)} — message automatique${details.length ? `<br>${details.map(esc).join(" · ")}` : ""}</p>
  </div>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#075d8d;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">${label}</a>`;
}

/** Échappe les valeurs non maîtrisées (nom, titres…) injectées dans le HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  const loc = ctx.location
    ? `<li>Lieu : <strong>${esc(ctx.location)}</strong></li>`
    : "";
  return {
    // « Inscription confirmée », lu seul dans une boîte mail trois jours plus
    // tard, se prend pour une confirmation de billet.
    subject: `Votre créneau du ${ctx.eventDate} — ${ctx.eventTitle}`,
    html: layout(
      "Merci pour votre coup de main ! 🎉",
      `<p>Bonjour ${esc(ctx.name)},</p>
       <p>Votre créneau de bénévole est bien enregistré :</p>
       <ul>
         <li>Événement : <strong>${esc(ctx.eventTitle)}</strong></li>
         <li>Date : <strong>${ctx.eventDate}</strong></li>
         <li>Mission / créneau : <strong>${esc(ctx.slotTitle)}</strong></li>
         ${loc}
       </ul>
       <p>Si vous ne pouvez finalement pas venir, vous pouvez vous désinscrire en un clic :</p>
       <p>${button(ctx.cancelUrl, "Me désinscrire")}</p>`,
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
  const titre = ctx.status === "no" ? "Merci de nous avoir prévenus" : "À bientôt !";
  const loc = ctx.location
    ? `<li>Lieu : <strong>${esc(ctx.location)}</strong></li>`
    : "";
  return {
    subject: `Votre réponse pour la réunion du ${ctx.eventDate}`,
    html: layout(
      titre,
      `<p>Bonjour ${esc(ctx.name)},</p>
       <p>Nous avons noté que <strong>${reponse}</strong> :</p>
       <ul>
         <li>Réunion : <strong>${esc(ctx.eventTitle)}</strong></li>
         <li>Date : <strong>${ctx.eventDate}</strong></li>
         ${loc}
       </ul>
       <p>Changement de programme ? Vous pouvez retirer votre réponse en un clic :</p>
       <p>${button(ctx.cancelUrl, "Retirer ma réponse")}</p>`,
      ctx.identity,
    ),
    text: `Bonjour ${ctx.name},\n\nNous avons noté que ${reponse} :\n- Réunion : ${ctx.eventTitle}\n- Date : ${ctx.eventDate}\n${ctx.location ? `- Lieu : ${ctx.location}\n` : ""}\nRetirer ma réponse : ${ctx.cancelUrl}`,
  };
}

export function volunteerReminderEmail(ctx: VolunteerCtx): EmailContent {
  return {
    subject: `Rappel — ${ctx.eventTitle}, c'est bientôt !`,
    html: layout(
      "🔔 C'est pour bientôt !",
      `<p>Bonjour ${esc(ctx.name)},</p>
       <p>Petit rappel : vous êtes inscrit·e comme bénévole pour <strong>${esc(ctx.eventTitle)}</strong>
       (<strong>${ctx.eventDate}</strong>) — créneau « <strong>${esc(ctx.slotTitle)}</strong> »${ctx.location ? `, ${esc(ctx.location)}` : ""}.</p>
       <p>Merci pour votre aide ! Empêchement de dernière minute ?</p>
       <p>${button(ctx.cancelUrl, "Me désinscrire")}</p>`,
      ctx.identity,
    ),
    text: `Bonjour ${ctx.name},\n\nRappel : bénévole pour ${ctx.eventTitle} (${ctx.eventDate}), créneau ${ctx.slotTitle}.\nMe désinscrire : ${ctx.cancelUrl}`,
  };
}

export function broadcastEmail(ctx: {
  subject: string;
  message: string;
  senderName?: string;
  identity?: NotificationIdentity;
}): EmailContent {
  const paragraphs = ctx.message
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return {
    subject: ctx.subject,
    html: layout(
      esc(ctx.subject),
      `${paragraphs}${ctx.senderName ? `<p style="color:#64748b;">— ${esc(ctx.senderName)}</p>` : ""}`,
      ctx.identity,
    ),
    text: `${ctx.message}${ctx.senderName ? `\n\n— ${ctx.senderName}` : ""}`,
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
      `<p>Bonjour ${ctx.name},</p>
       <p>Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable 1 heure :</p>
       <p>${button(ctx.resetUrl, "Choisir un nouveau mot de passe")}</p>
       <p style="color:#64748b;font-size:13px;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>`,
      ctx.identity,
    ),
    text: `Bonjour ${ctx.name},\n\nRéinitialisez votre mot de passe (valable 1h) : ${ctx.resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
  };
}

export function mailSettingsTestEmail(
  identity: NotificationIdentity,
): EmailContent {
  const associationName = identity.associationName.trim() || APP_NAME;
  const schoolLine = identity.schoolName?.trim()
    ? `<p>Établissement : <strong>${esc(identity.schoolName.trim())}</strong></p>`
    : "";
  const rnaLine = identity.rna?.trim()
    ? `<p style="color:#64748b;font-size:13px">RNA ${esc(identity.rna.trim())}</p>`
    : "";

  return {
    subject: `Test de messagerie — ${associationName}`,
    html: layout(
      "La messagerie fonctionne.",
      `<p>Ce message confirme que l’envoi sortant de <strong>${esc(associationName)}</strong> est correctement configuré.</p>${schoolLine}${rnaLine}`,
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
  const lignes = [
    `<li>Sujet : <strong>${esc(sujet)}</strong></li>`,
    `<li>Nom : <strong>${esc(ctx.name)}</strong></li>`,
    `<li>E-mail : <a href="mailto:${esc(ctx.email)}">${esc(ctx.email)}</a></li>`,
    ctx.phone?.trim()
      ? `<li>Téléphone : <strong>${esc(ctx.phone.trim())}</strong></li>`
      : "",
    ctx.schoolClass?.trim()
      ? `<li>Classe : <strong>${esc(ctx.schoolClass.trim())}</strong></li>`
      : "",
  ].join("");

  return {
    subject: `Une famille vous écrit — ${ctx.name}`,
    html: layout(
      "Une famille demande à être accompagnée",
      `<ul>${lignes}</ul>
       <p style="white-space:pre-wrap;border-left:3px solid #cbd5e1;padding-left:12px;">${esc(ctx.message)}</p>
       <p>${button(`mailto:${esc(ctx.email)}`, "Répondre à la famille")}</p>`,
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
  identity?: NotificationIdentity;
}): EmailContent {
  const association = ctx.identity?.associationName || APP_NAME;
  // L'intention porte jusqu'à l'objet du message : le bureau lit sa boîte sur
  // un téléphone, et une demande d'adhésion n'attend pas la même réponse
  // qu'une proposition de coup de main. Quand elle manque — vieux client, appel
  // direct de l'API — on le dit, plutôt que de ranger la demande au hasard.
  const intentions = {
    adherer: {
      objet: "Demande d’adhésion",
      titre: "Une famille souhaite adhérer",
      ligne:
        "Cette personne veut devenir membre de l’association. Indiquez-lui le montant de la cotisation de cette année et la marche à suivre pour régler.",
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
      ligne:
        "Cette personne veut devenir membre et propose aussi de l’aide. Indiquez-lui le montant de la cotisation de cette année, la marche à suivre pour régler, et les créneaux où il manque des bras.",
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
  const contact = [
    `<li>Nom : <strong>${esc(ctx.name)}</strong></li>`,
    `<li>E-mail : <a href="mailto:${esc(ctx.email)}">${esc(ctx.email)}</a></li>`,
    ctx.phone?.trim()
      ? `<li>Téléphone : <strong>${esc(ctx.phone.trim())}</strong></li>`
      : "",
  ].join("");

  return {
    subject: `${intention.objet} — ${ctx.name}`,
    html: layout(
      intention.titre,
      `<ul>${contact}</ul>
       ${intention.ligne ? `<p style="color:#0e6d68;font-weight:600;">${intention.ligne}</p>` : ""}
       <p style="white-space:pre-wrap;border-left:3px solid #cbd5e1;padding-left:12px;">${esc(ctx.message)}</p>
       <p>${button(`mailto:${esc(ctx.email)}`, "Répondre")}</p>`,
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
  contactEmail: string;
  identity?: NotificationIdentity;
}): EmailContent {
  const association = ctx.identity?.associationName || APP_NAME;
  const adhesion = ctx.intention === "adherer" || ctx.intention === "les_deux";
  const titre = adhesion
    ? "Votre demande d’adhésion est bien arrivée"
    : "Votre message est bien arrivé";
  const suite = adhesion
    ? `Un parent du bureau vous répondra par e-mail avec le montant de la cotisation pour cette année scolaire et la marche à suivre pour régler.`
    : `Un parent de l’équipe vous répondra par e-mail.`;

  return {
    subject: `${titre} — ${association}`,
    html: layout(
      titre,
      `<p>Bonjour ${esc(ctx.name)},</p>
       <p>Nous avons bien reçu ce que vous nous avez écrit sur le site de ${esc(association)}. ${suite} Comptez quelques jours ; sans nouvelles, écrivez-nous directement.</p>
       <p style="color:#64748b;font-size:14px;">Votre message :</p>
       <p style="white-space:pre-wrap;border-left:3px solid #cbd5e1;padding-left:12px;color:#475569;">${esc(ctx.message)}</p>
       <p>${button(`mailto:${esc(ctx.contactEmail)}`, "Nous écrire")}</p>`,
      ctx.identity,
    ),
    text: `Bonjour ${ctx.name},

Nous avons bien reçu ce que vous nous avez écrit sur le site de ${association}. ${suite} Comptez quelques jours ; sans nouvelles, écrivez-nous à ${ctx.contactEmail}.

Votre message :
${ctx.message}`,
  };
}
