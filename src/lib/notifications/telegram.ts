import { getTelegramBotToken } from "@/lib/services/association-settings";

/**
 * Envoie un message Telegram à un chat donné. Le cron peut fournir le token
 * déjà chargé afin d'éviter une lecture des réglages pour chaque destinataire.
 */
export async function sendTelegram(
  chatId: string,
  text: string,
  configuredToken?: string | null,
): Promise<boolean> {
  const token =
    configuredToken === undefined
      ? await getTelegramBotToken()
      : configuredToken;

  if (!token) {
    console.warn(
      "[telegram] canal désactivé ou token absent — message non envoyé.",
    );
    return false;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      },
    );

    if (!res.ok) {
      console.error("[telegram] échec de l'envoi:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[telegram] erreur réseau:", error);
    return false;
  }
}
