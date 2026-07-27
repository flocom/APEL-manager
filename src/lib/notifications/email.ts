import nodemailer from "nodemailer";

import { getOutboundMailRuntimeConfig } from "@/lib/services/mail-settings";

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Envoie un e-mail via le transport SMTP ou Resend configuré. */
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
    if (config.provider === "smtp") {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        ...(config.auth ? { auth: config.auth } : {}),
      });
      await transporter.sendMail({
        from: config.from,
        to,
        subject,
        html,
        text,
      });
      return true;
    }

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
    const reason =
      error instanceof Error ? error.message : "erreur réseau inconnue";
    console.error(`[email] échec du transport ${config.provider} : ${reason}`);
    return false;
  }
}
