import nodemailer from "nodemailer";
import { Resend } from "resend";

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

    const resend = new Resend(config.apiKey);
    const { error } = await resend.emails.send({
      from: config.from,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
      ...(config.replyTo ? { replyTo: config.replyTo } : {}),
    });

    if (error) {
      console.error(
        `[email] échec Resend (${error.statusCode ?? "sans statut"}, ${error.name}) : ${error.message}`,
      );
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
