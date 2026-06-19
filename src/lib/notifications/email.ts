interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Envoie un e-mail via l'API Resend. Si RESEND_API_KEY n'est pas configuré,
 * l'envoi est ignoré silencieusement (retourne false).
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: EmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "APEL Manager <onboarding@resend.dev>";

  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY absent — e-mail non envoyé : "${subject}"`);
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html, text }),
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
