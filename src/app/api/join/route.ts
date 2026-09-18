import { NextResponse } from "next/server";

import { handleApiError, HttpError } from "@/lib/auth/guards";
import { sendEmail } from "@/lib/notifications/email";
import {
  joinRequestAckEmail,
  joinRequestEmail,
} from "@/lib/notifications/emails";
import {
  getAssociationSettings,
  getRecaptchaRuntimeConfig,
} from "@/lib/services/association-settings";
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

    const recaptcha = await getRecaptchaRuntimeConfig();
    if (recaptcha) {
      await verifyRecaptcha({
        secret: recaptcha.secret,
        token: data.recaptchaToken,
        action: "contact",
        minScore: recaptcha.minScore,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
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
        identity: {
          associationName: settings.associationName,
          schoolName: settings.schoolName,
          rna: settings.rna,
        },
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
    try {
      await sendEmail({
        to: data.email,
        replyTo: destination,
        ...joinRequestAckEmail({
          name: data.name,
          message: data.message,
          intention: data.intention,
          feePublished: settings.membershipFeePublished,
          contactEmail: destination,
          identity: {
            associationName: settings.associationName,
            schoolName: settings.schoolName,
            rna: settings.rna,
          },
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
