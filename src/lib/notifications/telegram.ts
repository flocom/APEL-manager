/**
 * Envoie un message Telegram à un chat donné. Si TELEGRAM_BOT_TOKEN n'est pas
 * configuré, l'envoi est ignoré silencieusement (retourne false).
 */
export async function sendTelegram(
  chatId: string,
  text: string,
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN absent — message non envoyé.");
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
