import { getOutboundMailRuntimeConfig } from "@/lib/services/mail-settings";

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Envoie un e-mail via l'API Resend. Les réglages enregistrés dans
 * Configuration > E-mail priment sur les variables d'environnement.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: EmailParams): Promise<boolean> {
  const config = await getOutboundMailRuntimeConfig();
  if (!config) {
    console.warn(
      `[email] fournisseur désactivé ou clé absente — e-mail non envoyé : "${subject}"`,
    );
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to,
        subject,
        html,
        text,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      console.error("[email] échec de l'envoi:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] erreur réseau:", error);
    return false;
  }
}
