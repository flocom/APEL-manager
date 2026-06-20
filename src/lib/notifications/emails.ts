import { APP_NAME } from "@/lib/app-config";

interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function layout(title: string, bodyHtml: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;color:#0f172a;">
    <h2 style="color:#1f5be0;">${title}</h2>
    ${bodyHtml}
    <p style="color:#94a3b8;font-size:13px;margin-top:28px;">${APP_NAME} — message automatique</p>
  </div>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#1f5be0;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">${label}</a>`;
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
    ),
    text: `Bonjour ${ctx.name},\n\nRappel : bénévole pour ${ctx.eventTitle} (${ctx.eventDate}), créneau ${ctx.slotTitle}.\nMe désinscrire : ${ctx.cancelUrl}`,
  };
}

export function passwordResetEmail(ctx: {
  name: string;
  resetUrl: string;
}): EmailContent {
  return {
    subject: `Réinitialisation de votre mot de passe — ${APP_NAME}`,
    html: layout(
      "Réinitialisation du mot de passe",
      `<p>Bonjour ${ctx.name},</p>
       <p>Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable 1 heure :</p>
       <p>${button(ctx.resetUrl, "Choisir un nouveau mot de passe")}</p>
       <p style="color:#64748b;font-size:13px;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>`,
    ),
    text: `Bonjour ${ctx.name},\n\nRéinitialisez votre mot de passe (valable 1h) : ${ctx.resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
  };
}
