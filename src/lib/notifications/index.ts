import { formatDateTime } from "@/lib/dates";

import { sendEmail } from "./email";
import { taskDueEmail, type NotificationIdentity } from "./emails";
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
  /** Adresse absolue de la tâche, dans la check-list de son événement. */
  taskUrl: string;
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
    taskUrl,
    identity,
    telegramBotToken,
  } = ctx;
  const due = formatDateTime(dueAt);
  const mail = taskDueEmail({
    name: user.name,
    taskTitle,
    eventTitle,
    due,
    kind,
    taskUrl,
    identity,
  });

  const telegramText =
    `${esc(mail.subject)}\n\n` +
    `Événement : ${esc(eventTitle)}\n` +
    `À traiter à partir du : ${due}\n\n` +
    `<a href="${esc(taskUrl)}">Voir la tâche</a>`;

  const results: boolean[] = [];

  if (user.email) {
    results.push(
      await sendEmail({
        to: user.email,
        ...mail,
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
