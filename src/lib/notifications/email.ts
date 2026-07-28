import nodemailer from "nodemailer";
import { Resend } from "resend";

import { getOutboundMailRuntimeConfig } from "@/lib/services/mail-settings";

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Autorise uniquement les écrans de test à vérifier un transport désactivé. */
  allowDisabled?: boolean;
}

/** Envoie un e-mail via le transport SMTP ou Resend configuré. */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  allowDisabled = false,
}: EmailParams): Promise<boolean> {
  const config = await getOutboundMailRuntimeConfig(allowDisabled);
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
        ...(config.replyTo ? { replyTo: config.replyTo } : {}),
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

/** Limite de diffusion : au-delà, on ne cherche plus à joindre tout le monde. */
const MAX_RECIPIENTS = 500;

/**
 * Normalise une liste d'adresses : minuscules, sans doublon ni valeur vide,
 * plafonnée. Les mêmes destinataires arrivent de sources différentes
 * (inscriptions, adhérents, comptes) et se recoupent souvent.
 */
export function uniqueRecipients(
  values: Array<string | null | undefined>,
): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim().toLowerCase())
        .filter((value): value is string => Boolean(value)),
    ),
  ].slice(0, MAX_RECIPIENTS);
}

/**
 * Envoie le même message à plusieurs destinataires, par petits lots.
 *
 * Les fournisseurs limitent le débit : tout envoyer d'un coup fait rejeter une
 * partie des messages sans qu'on sache lesquels. Retourne le nombre d'envois
 * réussis, les échecs étant déjà journalisés par `sendEmail`.
 */
export async function sendBulkEmail(
  recipients: string[],
  mail: Omit<EmailParams, "to">,
  { batchSize = 5 }: { batchSize?: number } = {},
): Promise<number> {
  let sent = 0;
  for (let index = 0; index < recipients.length; index += batchSize) {
    const results = await Promise.all(
      recipients
        .slice(index, index + batchSize)
        .map((to) => sendEmail({ to, ...mail })),
    );
    sent += results.filter(Boolean).length;
  }
  return sent;
}
