import { formatDateTime } from "@/lib/dates";

import { sendEmail } from "./email";
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
}

/**
 * Notifie un membre qu'une tâche approche de sa date de traitement ou peut
 * maintenant être commencée,
 * via tous les canaux disponibles (e-mail + Telegram).
 * Retourne true si au moins un canal a réussi.
 */
export async function notifyTaskDue(ctx: TaskNotifContext): Promise<boolean> {
  const { user, taskTitle, eventTitle, dueAt, kind, appUrl } = ctx;
  const due = formatDateTime(dueAt);

  const heading =
    kind === "overdue"
      ? `⏰ Tâche à traiter maintenant : ${taskTitle}`
      : `🔔 Tâche bientôt à traiter : ${taskTitle}`;

  const intro =
    kind === "overdue"
      ? `La tâche « <strong>${taskTitle}</strong> » pour l'événement « <strong>${eventTitle}</strong> » est à traiter <strong>à partir de maintenant</strong> (date de traitement : ${due}).`
      : `La tâche « <strong>${taskTitle}</strong> » pour l'événement « <strong>${eventTitle}</strong> » pourra être traitée à partir du <strong>${due}</strong>.`;

  const dashboardUrl = `${appUrl}/dashboard/tasks`;

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: auto;">
      <h2 style="color:#075d8d;">${heading}</h2>
      <p>Bonjour ${user.name},</p>
      <p>${intro}</p>
      <p>
        <a href="${dashboardUrl}"
           style="display:inline-block;background:#075d8d;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">
          Voir mes tâches
        </a>
      </p>
      <p style="color:#666;font-size:13px;margin-top:24px;">APEL Manager — notification automatique</p>
    </div>`;

  const text = `${heading}\n\nBonjour ${user.name},\n${intro.replace(/<[^>]+>/g, "")}\n\nMes tâches : ${dashboardUrl}`;

  const telegramText =
    `${heading}\n\n` +
    `Événement : ${eventTitle}\n` +
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
    results.push(await sendTelegram(user.telegramChatId, telegramText));
  }

  return results.some(Boolean);
}
