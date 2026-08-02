import { getTelegramBotToken } from "@/lib/services/association-settings";

const VERIFY_TIMEOUT_MS = 8000;

export type TelegramTokenCheck =
  | { ok: true; username: string | null }
  | { ok: false; reason: "refused" | "unreachable"; detail: string };

/**
 * Demande à Telegram s'il reconnaît ce token, via `getMe`. Un token seulement
 * *présent* ne prouve rien : c'est cette réponse qui permet de n'ouvrir le
 * canal aux membres que lorsqu'il fonctionnera réellement.
 */
export async function checkTelegramBotToken(
  token: string,
): Promise<TelegramTokenCheck> {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    return {
      ok: false,
      reason: "unreachable",
      detail:
        error instanceof Error && error.name === "TimeoutError"
          ? "délai dépassé"
          : "réseau indisponible",
    };
  }

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    description?: string;
    result?: { username?: string };
  } | null;

  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      reason: "refused",
      detail: payload?.description ?? `réponse ${response.status}`,
    };
  }
  return { ok: true, username: payload.result?.username ?? null };
}

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
