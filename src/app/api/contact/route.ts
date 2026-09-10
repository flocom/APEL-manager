import { NextResponse } from "next/server";

import { handleApiError, HttpError } from "@/lib/auth/guards";
import { sendEmail } from "@/lib/notifications/email";
import { familyMessageEmail } from "@/lib/notifications/emails";
import {
  getAssociationSettings,
  getRecaptchaRuntimeConfig,
} from "@/lib/services/association-settings";
import { verifyRecaptcha } from "@/lib/services/recaptcha";
import { familyMessageSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Message d'une famille qui rencontre une difficulté avec l'école.
 *
 * Le message part vers l'adresse de contact configurée et n'est écrit nulle
 * part : une difficulté avec un enseignant n'a rien à faire dans une base de
 * données que des membres peuvent consulter. C'est aussi ce que la page
 * promet aux familles, et cette promesse tient au fait qu'il n'y a ici aucun
 * `insert`.
 */
export async function POST(req: Request) {
  try {
    const data = familyMessageSchema.parse(await req.json());

    // Robot repéré au champ caché : on répond comme si tout allait bien.
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
      ...familyMessageEmail({
        name: data.name,
        email: data.email,
        phone: data.phone,
        schoolClass: data.schoolClass,
        topic: data.topic,
        message: data.message,
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
