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
  const coordonnees = [
    ctx.phone
      ? `<li>Téléphone : <a href="tel:${esc(ctx.phone.replace(/[^+0-9]/g, ""))}"><strong>${esc(ctx.phone)}</strong></a></li>`
      : "",
    ctx.email
      ? `<li>E-mail : <a href="mailto:${esc(ctx.email)}">${esc(ctx.email)}</a></li>`
      : "",
  ].join("");
  const loc = ctx.location
    ? `<li>Lieu : <strong>${esc(ctx.location)}</strong></li>`
    : "";

  return {
    // Le nom d'abord : c'est ce qu'on lit dans la liste des objets, sur un
    // téléphone, sans ouvrir.
    subject: `${ctx.name} s’inscrit — ${ctx.eventTitle}`,
    html: layout(
      "Une nouvelle inscription",
      `<p><strong>${esc(ctx.name)}</strong> vient de prendre un créneau depuis le site.</p>
       <ul>
         <li>Événement : <strong>${esc(ctx.eventTitle)}</strong></li>
         <li>Date : <strong>${ctx.eventDate}</strong></li>
         <li>Mission / créneau : <strong>${esc(ctx.slotTitle)}</strong></li>
         ${loc}
         ${coordonnees}
       </ul>
       <p style="color:#0e6d68;font-weight:600;">${reste}</p>
       <p>${button(ctx.eventUrl, "Voir les inscrits")}</p>`,
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
  const coordonnees = [
    ctx.phone
      ? `<li>Téléphone : <a href="tel:${esc(ctx.phone.replace(/[^+0-9]/g, ""))}"><strong>${esc(ctx.phone)}</strong></a></li>`
      : "",
    ctx.email
      ? `<li>E-mail : <a href="mailto:${esc(ctx.email)}">${esc(ctx.email)}</a></li>`
      : "",
  ].join("");
  const loc = ctx.location
    ? `<li>Lieu : <strong>${esc(ctx.location)}</strong></li>`
    : "";

  return {
    subject: `${ctx.name} ${reponse} — ${ctx.eventTitle}`,
    html: layout(
      "Une réponse de présence",
      `<p><strong>${esc(ctx.name)}</strong> a répondu depuis le site : <strong>${reponse}</strong>.</p>
       <ul>
         <li>Réunion : <strong>${esc(ctx.eventTitle)}</strong></li>
         <li>Date : <strong>${ctx.eventDate}</strong></li>
         ${loc}
         ${coordonnees}
       </ul>
       <p>${button(ctx.eventUrl, "Voir les réponses")}</p>`,
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
export function dailyDigestEmail(ctx: {
  taches: { enRetard: DigestTache[]; aVenir: DigestTache[] };
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
  const REPONSE = { yes: "sera là", maybe: "peut-être", no: "ne viendra pas" };
  const s = (n: number) => (n > 1 ? "s" : "");

  const coord = (phone: string | null, email: string | null) => {
    const bouts = [
      phone
        ? `<a href="tel:${esc(phone.replace(/[^+0-9]/g, ""))}">${esc(phone)}</a>`
        : null,
      email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : null,
    ].filter(Boolean);
    return bouts.length ? ` — ${bouts.join(" · ")}` : "";
  };

  // Qui s'en occupe. L'absence de responsable est la vraie information : c'est
  // la tâche que personne ne réclamera d'elle-même.
  const qui = (noms: string[], couleur: string) =>
    noms.length
      ? `<span style="color:${couleur};">${noms.map(esc).join(", ")}</span>`
      : `<span style="color:#914457;font-style:italic;">personne d’assigné</span>`;

  const ligneTache = (t: DigestTache, retard: boolean) => `
        <li style="margin:0 0 10px;">
          <a href="${t.url}" style="color:#075d8d;font-weight:bold;">${esc(t.titre)}</a>
          <span style="color:#64748b;"> — ${esc(t.evenement)}</span><br />
          <span style="color:${retard ? "#783746" : "#475569"};font-weight:${retard ? "bold" : "normal"};">${
            retard
              ? `en retard depuis ${t.delai}`
              : `à traiter dans ${t.delai}`
          }</span>
          <span style="color:#64748b;font-size:14px;"> · échéance ${t.echeance}</span><br />
          <span style="font-size:14px;">${qui(t.responsables, "#475569")}</span>
        </li>`;

  const sectionTaches = (
    titre: string,
    couleur: string,
    liste: DigestTache[],
    retard: boolean,
  ) =>
    liste.length
      ? `
      <h3 style="margin:24px 0 8px;font-size:18px;color:${couleur};">${titre}</h3>
      <ul style="padding-left:20px;margin:0;">${liste
        .map((t) => ligneTache(t, retard))
        .join("")}</ul>`
      : "";

  const blocsTaches =
    nbRetard + nbAVenir > 0
      ? `${sectionTaches(
          `En retard — ${nbRetard} tâche${s(nbRetard)}`,
          "#783746",
          ctx.taches.enRetard,
          true,
        )}${sectionTaches(
          `À traiter bientôt — ${nbAVenir} tâche${s(nbAVenir)}`,
          "#075d8d",
          ctx.taches.aVenir,
          false,
        )}`
      : "";

  const blocsInscriptions = ctx.rendezVous
    .map(
      (r) => `
      <p style="margin:18px 0 2px;font-weight:bold;font-size:16px;color:#075d8d;">${esc(r.titre)}</p>
      <p style="margin:0 0 8px;color:#64748b;font-size:14px;">${r.date}</p>
      <ul>
        ${r.inscriptions
          .map(
            (i) =>
              `<li><strong>${esc(i.nom)}</strong> — ${esc(i.creneau)}${coord(i.phone, i.email)}</li>`,
          )
          .join("")}
        ${r.presences
          .map(
            (p) =>
              `<li><strong>${esc(p.nom)}</strong> — ${REPONSE[p.statut]}${coord(p.phone, p.email)}</li>`,
          )
          .join("")}
      </ul>
      <p>${button(r.url, "Ouvrir le rendez-vous")}</p>`,
    )
    .join("");

  const corps = [
    blocsTaches,
    total > 0
      ? `<h3 style="margin:28px 0 8px;font-size:18px;color:#0f172a;">Nouvelles réponses depuis ${ctx.depuis}</h3>${blocsInscriptions}`
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
      partTaches,
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
    html: layout("Le point du jour", corps, ctx.identity),
    text: texte,
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
