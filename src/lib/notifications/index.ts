import { formatDateTime } from "@/lib/dates";

import { sendEmail } from "./email";
import type { NotificationIdentity } from "./emails";
import { sendTelegram } from "./telegram";

export type NotifyKind = "reminder" | "overdue";

interface TaskNotifContext {
  user: {
    name: string;
    email: string;
    telegramChatId: string | null;
  };
  taskTitle: string;
  eventTitle: string;
  dueAt: Date;
  kind: NotifyKind;
  appUrl: string;
  identity: NotificationIdentity;
  telegramBotToken: string | null;
}

/** Échappe les valeurs métier injectées dans le HTML des notifications. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Notifie un membre qu'une tâche approche de sa date de traitement ou peut
 * maintenant être commencée,
 * via tous les canaux disponibles (e-mail + Telegram).
 * Retourne true si au moins un canal a réussi.
 */
export async function notifyTaskDue(ctx: TaskNotifContext): Promise<boolean> {
  const {
    user,
    taskTitle,
    eventTitle,
    dueAt,
    kind,
    appUrl,
    identity,
    telegramBotToken,
  } = ctx;
  const due = formatDateTime(dueAt);
  const safeTaskTitle = esc(taskTitle);
  const safeEventTitle = esc(eventTitle);
  const safeUserName = esc(user.name);
  const safeAssociationName = esc(identity.associationName);
  const identityDetails = [
    identity.schoolName?.trim(),
    identity.rna?.trim() ? `RNA ${identity.rna.trim()}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .map(esc)
    .join(" · ");

  const heading =
    kind === "overdue"
      ? `⏰ Tâche à traiter maintenant : ${taskTitle}`
      : `🔔 Tâche bientôt à traiter : ${taskTitle}`;

  const htmlIntro =
    kind === "overdue"
      ? `La tâche « <strong>${safeTaskTitle}</strong> » pour l'événement « <strong>${safeEventTitle}</strong> » est à traiter <strong>à partir de maintenant</strong> (date de traitement : ${due}).`
      : `La tâche « <strong>${safeTaskTitle}</strong> » pour l'événement « <strong>${safeEventTitle}</strong> » pourra être traitée à partir du <strong>${due}</strong>.`;
  const textIntro =
    kind === "overdue"
      ? `La tâche « ${taskTitle} » pour l'événement « ${eventTitle} » est à traiter à partir de maintenant (date de traitement : ${due}).`
      : `La tâche « ${taskTitle} » pour l'événement « ${eventTitle} » pourra être traitée à partir du ${due}.`;

  const dashboardUrl = `${appUrl}/dashboard/tasks`;

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: auto;">
      <h2 style="color:#075d8d;">${esc(heading)}</h2>
      <p>Bonjour ${safeUserName},</p>
      <p>${htmlIntro}</p>
      <p>
        <a href="${dashboardUrl}"
           style="display:inline-block;background:#075d8d;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">
          Voir mes tâches
        </a>
      </p>
      <p style="color:#666;font-size:13px;margin-top:24px;">${safeAssociationName} — notification automatique${identityDetails ? `<br>${identityDetails}` : ""}</p>
    </div>`;

  const text = `${heading}\n\nBonjour ${user.name},\n${textIntro}\n\nMes tâches : ${dashboardUrl}`;

  const telegramText =
    `${esc(heading)}\n\n` +
    `Événement : ${safeEventTitle}\n` +
    `À traiter à partir du : ${due}\n\n` +
    `<a href="${dashboardUrl}">Voir mes tâches</a>`;

  const results: boolean[] = [];

  if (user.email) {
    results.push(
      await sendEmail({
        to: user.email,
        subject: heading,
        html,
        text,
      }),
    );
  }

  if (user.telegramChatId) {
    results.push(
      await sendTelegram(
        user.telegramChatId,
        telegramText,
        telegramBotToken,
      ),
    );
  }

  return results.some(Boolean);
}
