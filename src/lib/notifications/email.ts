import nodemailer from "nodemailer";
import { Resend } from "resend";

import { redactError } from "@/lib/errors";
import {
  getOutboundMailRuntimeConfig,
  type OutboundMailRuntimeConfig,
} from "@/lib/services/mail-settings";
import { estRelaisLocal } from "@/lib/smtp-relay";

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /**
   * Adresse de réponse propre à ce message, prioritaire sur celle des
   * réglages : un message transmis au nom d'un tiers doit se répondre à lui.
   */
  replyTo?: string;
  /** Autorise uniquement les écrans de test à vérifier un transport désactivé. */
  allowDisabled?: boolean;
  /**
   * Transport déjà lu (`getOutboundMailRuntimeConfig`) ; `null` : aucun.
   * Fourni, l'envoi ne lit plus rien en base. C'est ce qui permet d'envoyer
   * depuis une transaction ouverte : la lecture des réglages passerait sinon
   * par une autre connexion du pool, et sur Vercel le pool n'en a qu'une, que
   * la transaction occupe — l'envoi attendrait sans fin.
   */
  transport?: OutboundMailRuntimeConfig | null;
}

/** Envoie un e-mail via le transport SMTP ou Resend configuré. */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
  allowDisabled = false,
  transport,
}: EmailParams): Promise<boolean> {
  const config =
    transport !== undefined
      ? transport
      : await getOutboundMailRuntimeConfig(allowDisabled);
  if (!config) {
    // Ni l'objet ni le destinataire au journal : l'objet d'une diffusion est
    // saisi librement et cite souvent un enfant, une famille, un événement.
    console.warn(
      "[email] fournisseur désactivé ou clé absente — e-mail non envoyé.",
    );
    return false;
  }

  try {
    if (config.provider === "smtp") {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        // Hors relais local, STARTTLS est exigé et non plus seulement tenté :
        // un serveur qui ne le propose pas — ou quelqu'un sur le chemin qui
        // retire l'annonce — recevait sinon identifiant, mot de passe et liens
        // de réinitialisation en clair. Le certificat est vérifié, comme par
        // défaut. Sans effet quand `secure` chiffre dès la connexion.
        requireTLS: !estRelaisLocal(config.host),
        ...(config.auth ? { auth: config.auth } : {}),
      });
      await transporter.sendMail({
        from: config.from,
        to,
        subject,
        html,
        text,
        ...(replyTo ?? config.replyTo
          ? { replyTo: replyTo ?? config.replyTo }
          : {}),
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
      ...(replyTo ?? config.replyTo
        ? { replyTo: replyTo ?? config.replyTo }
        : {}),
    });

    if (error) {
      // Le message de Resend cite volontiers l'adresse refusée : il passe par
      // `redactError`, qui masque les adresses, comme les erreurs SMTP.
      console.error(
        `[email] échec Resend (${error.statusCode ?? "sans statut"}, ${error.name}) : ${redactError(error.message)}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    // Le refus d'un serveur SMTP recopie l'adresse du destinataire
    // (« 550 <…@…> recipient rejected ») : jamais le message brut au journal.
    console.error(
      `[email] échec du transport ${config.provider} :`,
      redactError(error),
    );
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
