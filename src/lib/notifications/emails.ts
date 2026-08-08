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
    subject: `Inscription confirmée — ${ctx.eventTitle}`,
    html: layout(
      "Merci pour votre inscription ! 🎉",
      `<p>Bonjour ${esc(ctx.name)},</p>
       <p>Votre inscription comme bénévole est bien enregistrée :</p>
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
    text: `Bonjour ${ctx.name},\n\nInscription confirmée :\n- Événement : ${ctx.eventTitle}\n- Date : ${ctx.eventDate}\n- Créneau : ${ctx.slotTitle}\n${ctx.location ? `- Lieu : ${ctx.location}\n` : ""}\nMe désinscrire : ${ctx.cancelUrl}`,
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
export function joinRequestEmail(ctx: {
  name: string;
  email: string;
  phone?: string | null;
  message: string;
  identity?: NotificationIdentity;
}): EmailContent {
  const association = ctx.identity?.associationName || APP_NAME;
  const contact = [
    `<li>Nom : <strong>${esc(ctx.name)}</strong></li>`,
    `<li>E-mail : <a href="mailto:${esc(ctx.email)}">${esc(ctx.email)}</a></li>`,
    ctx.phone?.trim()
      ? `<li>Téléphone : <strong>${esc(ctx.phone.trim())}</strong></li>`
      : "",
  ].join("");

  return {
    subject: `Nouveau contact depuis le site — ${ctx.name}`,
    html: layout(
      "Quelqu’un souhaite rejoindre l’association",
      `<ul>${contact}</ul>
       <p style="white-space:pre-wrap;border-left:3px solid #cbd5e1;padding-left:12px;">${esc(ctx.message)}</p>
       <p>${button(`mailto:${esc(ctx.email)}`, "Répondre")}</p>`,
      ctx.identity,
    ),
    text: `Nouveau contact depuis le site de ${association}.

Nom : ${ctx.name}
E-mail : ${ctx.email}${ctx.phone?.trim() ? `\nTéléphone : ${ctx.phone.trim()}` : ""}

${ctx.message}`,
  };
}
