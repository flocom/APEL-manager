import { NextResponse } from "next/server";

import { handleApiError, HttpError } from "@/lib/auth/guards";
import { clientIpAddress } from "@/lib/client-ip";
import { sendEmail } from "@/lib/notifications/email";
import {
  joinRequestAckEmail,
  joinRequestEmail,
} from "@/lib/notifications/emails";
import { getNotificationIdentity } from "@/lib/notifications/identity";
import {
  getAssociationSettings,
  getRecaptchaRuntimeConfig,
} from "@/lib/services/association-settings";
import {
  delaiLisible,
  emailKey,
  hitRateLimit,
  hitRateLimits,
  ipKey,
  PLAFONDS,
  rateLimitError,
} from "@/lib/services/rate-limit";
import { verifyRecaptcha } from "@/lib/services/recaptcha";
import { joinRequestSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Formulaire public de la page « Rejoindre l'association ». Le message part
 * vers l'adresse de contact configurée : rien n'est stocké en base, il n'y a
 * donc pas de fichier de prospects à protéger.
 */
export async function POST(req: Request) {
  try {
    const data = joinRequestSchema.parse(await req.json());

    // Robot repéré au champ caché : on répond comme si tout allait bien, sans
    // rien envoyer.
    if (data.website && data.website.trim().length > 0) {
      return NextResponse.json({ ok: true });
    }

    // Chaque envoi part dans la boîte du bureau : une même connexion n'en
    // envoie que quelques-uns par heure. Ce refus ne dépend pas de l'adresse
    // saisie, il peut donc se dire.
    const ip = clientIpAddress(req);
    const parConnexion = await hitRateLimits([
      [PLAFONDS.messageIpHeure, ipKey(ip)],
      [PLAFONDS.messageIpJour, ipKey(ip)],
    ]);
    if (!parConnexion.ok) {
      throw rateLimitError(
        parConnexion,
        `Trop de messages envoyés depuis cette connexion : réessayez ${delaiLisible(parConnexion.retryAfterSeconds)}. Vous pouvez aussi écrire directement à l’association.`,
      );
    }

    const recaptcha = await getRecaptchaRuntimeConfig();
    if (recaptcha) {
      await verifyRecaptcha({
        secret: recaptcha.secret,
        token: data.recaptchaToken,
        action: "contact",
        minScore: recaptcha.minScore,
        ip,
      });
    }

    const settings = await getAssociationSettings();
    const destination = settings.contactEmail?.trim();
    if (!destination) {
      throw new HttpError(
        503,
        "Le formulaire n’est pas disponible : l’association n’a pas encore renseigné son adresse de contact.",
      );
    }

    const identity = await getNotificationIdentity(settings);
    const sent = await sendEmail({
      to: destination,
      replyTo: data.email,
      ...joinRequestEmail({
        name: data.name,
        email: data.email,
        phone: data.phone,
        message: data.message,
        intention: data.intention,
        feePublished: settings.membershipFeePublished,
        identity,
      }),
    });

    if (!sent) {
      throw new HttpError(
        502,
        `L’envoi a échoué. Écrivez directement à ${destination}, votre message sera lu.`,
      );
    }

    // Copie au parent : sans écriture en base, l'écran de confirmation est la
    // seule trace de sa démarche, et il meurt avec l'onglet. L'échec de cet
    // envoi-là ne doit jamais faire échouer la demande : le bureau a déjà reçu
    // le message, c'est ce qui compte.
    //
    // Cette copie part vers une adresse que n'importe qui peut saisir : au-delà
    // de quelques-unes par jour vers la même boîte, elle ne part plus, sans
    // rien dire — le bureau reçoit toujours le message, et le refus apprendrait
    // que l'adresse a déjà servi.
    try {
      const parAdresse = await hitRateLimit(
        PLAFONDS.accuseAdresseJour,
        emailKey(data.email),
      );
      if (!parAdresse.ok) return NextResponse.json({ ok: true });
      await sendEmail({
        to: data.email,
        replyTo: destination,
        ...joinRequestAckEmail({
          name: data.name,
          message: data.message,
          intention: data.intention,
          feePublished: settings.membershipFeePublished,
          contactEmail: destination,
          identity,
        }),
      });
    } catch {
      // Silence volontaire : voir ci-dessus.
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
