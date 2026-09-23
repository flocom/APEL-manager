import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, HttpError } from "@/lib/auth/guards";
import { isApproved } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getBaseUrl, secureLinkBaseUrl } from "@/lib/base-url";
import { clientIpAddress } from "@/lib/client-ip";
import { formatDateTime } from "@/lib/dates";
import { db } from "@/lib/db";
import { events, volunteerSignups } from "@/lib/db/schema";
import { redactError } from "@/lib/errors";
import { sendEmail } from "@/lib/notifications/email";
import {
  volunteerConfirmationEmail,
  volunteerSignupNoticeEmail,
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
import { generateToken } from "@/lib/tokens";
import { emptyToNull } from "@/lib/utils";
import { signupSchema } from "@/lib/validation";

// Les deux coordonnées sont exigées par `signupSchema` lui-même : il n'y a plus
// de règle « au moins l'un des deux » à poser ici.
const publicSignupSchema = signupSchema.extend({
  token: z.string().min(8, "Lien invalide"),
  // Honeypot anti-bot : champ caché qui doit rester vide.
  website: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const data = publicSignupSchema.parse(await req.json());

    // Bot détecté (honeypot rempli) : on répond OK sans rien enregistrer.
    if (data.website && data.website.trim().length > 0) {
      return NextResponse.json({ ok: true });
    }

    // Une même connexion ne remplit pas à elle seule les créneaux d'un
    // événement : chaque inscription prend une place que personne d'autre ne
    // pourra prendre, et fait partir un e-mail. Ce refus-là ne dépend pas de
    // l'adresse saisie : il peut se dire.
    const ip = clientIpAddress(req);
    const parConnexion = await hitRateLimits([
      [PLAFONDS.inscriptionIpHeure, ipKey(ip)],
      [PLAFONDS.inscriptionIpJour, ipKey(ip)],
    ]);
    if (!parConnexion.ok) {
      throw rateLimitError(
        parConnexion,
        `Trop d’inscriptions depuis cette connexion : réessayez ${delaiLisible(parConnexion.retryAfterSeconds)}, ou écrivez à l’association.`,
      );
    }

    const recaptcha = await getRecaptchaRuntimeConfig();
    if (recaptcha) {
      await verifyRecaptcha({
        secret: recaptcha.secret,
        token: data.recaptchaToken,
        action: "inscription",
        minScore: recaptcha.minScore,
        ip,
      });
    }

    const event = await db.query.events.findFirst({
      where: eq(events.shareToken, data.token),
      with: { volunteerSlots: true },
    });
    if (event?.cancelledAt) {
      throw new HttpError(
        410,
        "Ce rendez-vous a été annulé : les inscriptions sont closes.",
      );
    }
    if (!event || event.status !== "published") {
      throw new HttpError(404, "Cet événement n'accepte pas d'inscriptions.");
    }

    const slot = event.volunteerSlots.find((s) => s.id === data.slotId);
    if (!slot) throw new HttpError(400, "Créneau introuvable pour cet événement.");

    const email = emptyToNull(data.email ?? null);
    const phone = emptyToNull(data.phone ?? null);

    // Anti-doublon : même créneau + même e-mail.
    if (email) {
      const [dup] = await db
        .select({ id: volunteerSignups.id })
        .from(volunteerSignups)
        .where(
          and(
            eq(volunteerSignups.slotId, slot.id),
            sql`lower(${volunteerSignups.email}) = ${email}`,
          ),
        )
        .limit(1);
      if (dup) {
        throw new HttpError(409, "Vous êtes déjà inscrit·e à ce créneau.");
      }
    }

    // Un compte en attente s'inscrit comme n'importe quel visiteur : rattacher
    // l'inscription à un compte que personne n'a validé le ferait passer pour
    // un membre de l'équipe dans la liste des bénévoles.
    const sessionUser = await getCurrentUser();
    const currentUser = isApproved(sessionUser) ? sessionUser : null;
    const cancelToken = generateToken(18);

    // Insertion atomique : on n'insère que si le créneau n'est pas déjà complet.
    // L'index unique partiel (slot_id, lower(email)) sécurise l'anti-doublon en
    // cas de course (deux soumissions simultanées) → erreur Postgres 23505.
    let inserted;
    try {
      inserted = await db.execute(sql`
        INSERT INTO volunteer_signups (slot_id, user_id, name, email, phone, cancel_token)
        SELECT
          ${slot.id}::uuid,
          ${currentUser?.id ?? null}::uuid,
          ${data.name},
          ${email},
          ${phone},
          ${cancelToken}
        WHERE (
          SELECT count(*) FROM volunteer_signups WHERE slot_id = ${slot.id}::uuid
        ) < ${slot.capacity}
        RETURNING id
      `);
    } catch (e) {
      if ((e as { code?: string })?.code === "23505") {
        throw new HttpError(409, "Vous êtes déjà inscrit·e à ce créneau.");
      }
      throw e;
    }

    if (inserted.length === 0) {
      throw new HttpError(409, "Ce créneau est complet.");
    }

    const [baseUrl, association] = await Promise.all([
      getBaseUrl(),
      getAssociationSettings(),
    ]);
    const identity = await getNotificationIdentity(association);

    // Confirmation par e-mail (avec lien de désinscription), si un e-mail est
    // fourni. Il l'est désormais toujours, mais la garde ne coûte rien. Le
    // lien de retrait porte un jeton : sans adresse publique configurée, il ne
    // part pas (lib/base-url.ts) — l'inscription, elle, est prise.
    //
    // Chaque confirmation part vers l'adresse saisie, que n'importe qui peut
    // taper : au-delà de quelques-unes dans la journée, seul l'e-mail cesse de
    // partir. L'inscription reste prise, comme pour les réponses aux
    // réunions. Refuser l'inscription elle-même laissait huit envois
    // anonymes suffire à empêcher un parent de prendre le moindre créneau
    // jusqu'au lendemain, et arrêtait le membre du bureau qui se met sur neuf
    // créneaux de la kermesse. Compté ici, après l'insertion : un doublon ou
    // un créneau complet ne rapprochent pas du plafond, et chaque envoi lit
    // son propre numéro — deux inscriptions simultanées ne passent pas
    // ensemble sous le plafond.
    const baseDesLiens = email
      ? secureLinkBaseUrl("Confirmation d'inscription bénévole")
      : null;
    let confirmation = false;
    if (email && baseDesLiens) {
      const parAdresse = await hitRateLimit(
        PLAFONDS.confirmationAdresseJour,
        emailKey(email),
      );
      if (parAdresse.ok) {
        const mail = volunteerConfirmationEmail({
          name: data.name,
          eventTitle: event.title,
          eventDate: formatDateTime(event.startAt),
          slotTitle: slot.title,
          location: event.location,
          cancelUrl: `${baseDesLiens}/annulation/${cancelToken}`,
          identity,
        });
        // `sendEmail` rend `false` au lieu de lever : le formulaire dira
        // alors, lui aussi, que la confirmation n'est pas partie.
        confirmation = await sendEmail({ to: email, ...mail });
      }
    }

    // Avis au bureau. Envoyé après coup et dans un try/catch : le créneau est
    // déjà pris, et faire échouer une inscription réussie parce que le serveur
    // de courrier tousse serait absurde — le bénévole reverrait le formulaire
    // et croirait devoir recommencer.
    // « quotidien » laisse le récapitulatif du lendemain s'en charger, « aucun »
    // ne prévient personne. La confirmation au bénévole, elle, part toujours.
    const destinataire =
      association.signupNoticeMode === "immediat"
        ? association.contactEmail?.trim()
        : undefined;
    if (destinataire) {
      try {
        const [{ pris }] = await db
          .select({ pris: sql<number>`count(*)::int` })
          .from(volunteerSignups)
          .where(eq(volunteerSignups.slotId, slot.id));
        // `sendEmail` ne lève pas : il rend `false`. Sans ce contrôle, le
        // bureau cesserait d'être prévenu sans que rien ne le signale.
        const parti = await sendEmail({
          to: destinataire,
          // Répondre à l'avis écrit au bénévole, pas à la boîte de
          // l'association.
          replyTo: email ?? undefined,
          ...volunteerSignupNoticeEmail({
            name: data.name,
            email,
            phone,
            eventTitle: event.title,
            eventDate: formatDateTime(event.startAt),
            slotTitle: slot.title,
            location: event.location,
            restantes: Math.max(0, slot.capacity - Number(pris)),
            capacite: slot.capacity,
            eventUrl: `${baseUrl}/dashboard/events/${event.id}/benevoles`,
            identity,
          }),
        });
        if (!parti) {
          console.warn(
            `[signup] avis au bureau non remis à ${destinataire} pour l'inscription de ${data.name}.`,
          );
        }
      } catch (erreur) {
        console.error("[signup] avis au bureau non envoyé", redactError(erreur));
      }
    }

    // `confirmation: false` : l'inscription est prise, mais le bénévole n'a
    // pas reçu de lien de retrait — le formulaire le lui dit, plutôt que de
    // le laisser guetter un e-mail qui ne viendra pas.
    return NextResponse.json({ ok: true, confirmation });
  } catch (error) {
    return handleApiError(error);
  }
}
