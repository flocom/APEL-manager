import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { HttpError } from "@/lib/auth/guards";
import { getBaseUrl } from "@/lib/base-url";
import { formatDateTime } from "@/lib/dates";
import { db } from "@/lib/db";
import { events, meetingAttendance } from "@/lib/db/schema";
import { sendEmail } from "@/lib/notifications/email";
import {
  meetingAttendanceChangeEmail,
  meetingAttendanceConfirmationEmail,
  meetingAttendanceNoticeEmail,
} from "@/lib/notifications/emails";
import { getNotificationIdentity } from "@/lib/notifications/identity";
import {
  openPresenceChange,
  sealPresenceChange,
  type PresenceChange,
} from "@/lib/presence-token";
import { generateToken } from "@/lib/tokens";

import { getAssociationSettings } from "./association-settings";

type Statut = "yes" | "maybe" | "no";

interface Reunion {
  id: string;
  title: string;
  startAt: Date;
  location: string | null;
}

/**
 * Accusé de réception d'une réponse publique, avec le lien de retrait. Il ne
 * part qu'à l'adresse de la réponse : c'est le seul endroit où le lien de
 * retrait peut aller sans devenir un pouvoir donné à un tiers.
 */
export async function envoyerConfirmationPresence({
  email,
  nom,
  statut,
  reunion,
  cancelToken,
}: {
  email: string;
  nom: string;
  statut: Statut;
  reunion: Reunion;
  cancelToken: string;
}) {
  const [baseUrl, association] = await Promise.all([
    getBaseUrl(),
    getAssociationSettings(),
  ]);
  const mail = meetingAttendanceConfirmationEmail({
    name: nom,
    eventTitle: reunion.title,
    eventDate: formatDateTime(reunion.startAt),
    location: reunion.location,
    status: statut,
    cancelUrl: `${baseUrl}/annulation/${cancelToken}`,
    identity: await getNotificationIdentity(association),
  });
  await sendEmail({ to: email, ...mail });
}

/**
 * Avertit l'adresse de contact de l'association qu'une réponse vient
 * d'arriver.
 *
 * Silencieux en cas d'échec, et à dessein : la réponse est enregistrée, la
 * confirmation est partie, et rendre une erreur maintenant ferait croire au
 * parent que sa réponse n'a pas été prise. Sans adresse de contact publiée,
 * il n'y a personne à prévenir.
 */
export async function avertirLeBureauPresence({
  nom,
  email,
  phone,
  statut,
  reunion,
}: {
  nom: string;
  email: string | null;
  phone: string | null;
  statut: Statut;
  reunion: Reunion;
}) {
  try {
    const [baseUrl, association] = await Promise.all([
      getBaseUrl(),
      getAssociationSettings(),
    ]);
    // En mode « quotidien », le récapitulatif reprendra la réponse.
    if (association.signupNoticeMode !== "immediat") return;
    const destinataire = association.contactEmail?.trim();
    if (!destinataire) return;

    // Comme ailleurs : `sendEmail` rend `false` au lieu de lever.
    const parti = await sendEmail({
      to: destinataire,
      replyTo: email ?? undefined,
      ...meetingAttendanceNoticeEmail({
        name: nom,
        email,
        phone,
        eventTitle: reunion.title,
        eventDate: formatDateTime(reunion.startAt),
        location: reunion.location,
        status: statut,
        eventUrl: `${baseUrl}/dashboard/events/${reunion.id}/presences`,
        identity: await getNotificationIdentity(association),
      }),
    });
    if (!parti) {
      console.warn(
        `[presences] avis au bureau non remis à ${destinataire} pour la réponse de ${nom}.`,
      );
    }
  } catch (erreur) {
    console.error("[presences] avis au bureau non envoyé", erreur);
  }
}

/**
 * Une réponse publique arrive pour une adresse qui a déjà répondu.
 *
 * Rien n'est modifié. Si la nouvelle réponse dit exactement la même chose, on
 * renvoie simplement la confirmation — c'est le cas du parent qui recoche
 * parce qu'il a perdu l'e-mail, et qui veut retrouver son lien de retrait.
 * Sinon, un lien part à l'adresse pour confirmer le changement.
 *
 * Dans les deux cas l'e-mail va à l'adresse déjà enregistrée, jamais ailleurs,
 * et la réponse faite à l'écran est la même que pour une première réponse :
 * elle ne dit pas si l'adresse avait déjà répondu.
 */
export async function demanderConfirmationDuChangement({
  existant,
  reunion,
  email,
  propose,
}: {
  existant: {
    id: string;
    status: Statut;
    name: string | null;
    phone: string | null;
    cancelToken: string | null;
    updatedAt: Date;
  };
  reunion: Reunion;
  email: string;
  propose: { status: Statut; name: string; phone: string | null };
}) {
  const identique =
    existant.status === propose.status &&
    (existant.name ?? "") === propose.name &&
    (existant.phone ?? "") === (propose.phone ?? "");

  if (identique) {
    // Une ancienne réponse peut ne pas avoir de jeton de retrait : on lui en
    // donne un, sans rien toucher d'autre — `updatedAt` compris, qui sert de
    // témoin aux liens de confirmation en circulation.
    let cancelToken = existant.cancelToken;
    if (!cancelToken) {
      cancelToken = generateToken(18);
      await db
        .update(meetingAttendance)
        .set({ cancelToken })
        .where(
          and(
            eq(meetingAttendance.id, existant.id),
            isNull(meetingAttendance.cancelToken),
          ),
        );
    }
    await envoyerConfirmationPresence({
      email,
      nom: propose.name,
      statut: propose.status,
      reunion,
      cancelToken,
    });
    return;
  }

  const [baseUrl, association] = await Promise.all([
    getBaseUrl(),
    getAssociationSettings(),
  ]);
  const jeton = await sealPresenceChange({
    attendanceId: existant.id,
    eventId: reunion.id,
    status: propose.status,
    name: propose.name,
    phone: propose.phone,
    updatedAtMs: existant.updatedAt.getTime(),
  });
  const mail = meetingAttendanceChangeEmail({
    name: existant.name ?? propose.name,
    eventTitle: reunion.title,
    eventDate: formatDateTime(reunion.startAt),
    location: reunion.location,
    current: existant.status,
    proposed: propose,
    confirmUrl: `${baseUrl}/presence/${jeton}`,
    cancelUrl: existant.cancelToken
      ? `${baseUrl}/annulation/${existant.cancelToken}`
      : null,
    identity: await getNotificationIdentity(association),
  });
  await sendEmail({ to: email, ...mail });
}

/** Ce que la page de confirmation montre avant qu'on clique. */
export type EtatChangement =
  | { etat: "invalide" }
  | { etat: "perime" }
  | { etat: "ferme"; titre: string }
  | {
      etat: "pret";
      change: PresenceChange;
      actuel: { status: Statut; name: string | null; phone: string | null };
      reunion: Reunion;
    };

/**
 * Lit un lien de confirmation sans rien modifier : la page l'affiche, et
 * n'applique le changement qu'au clic. Un lien ouvert par un antivirus de
 * messagerie, qui suit les liens pour les inspecter, ne doit rien confirmer à
 * la place du parent.
 */
export async function lireChangementDePresence(
  token: string,
): Promise<EtatChangement> {
  const change = await openPresenceChange(token);
  if (!change) return { etat: "invalide" };

  const ligne = await db.query.meetingAttendance.findFirst({
    where: and(
      eq(meetingAttendance.id, change.attendanceId),
      eq(meetingAttendance.eventId, change.eventId),
      isNull(meetingAttendance.userId),
    ),
    with: { event: true },
  });
  if (!ligne || ligne.updatedAt.getTime() !== change.updatedAtMs) {
    return { etat: "perime" };
  }
  const ev = ligne.event;
  if (ev.cancelledAt || ev.status !== "published" || ev.kind !== "meeting") {
    return { etat: "ferme", titre: ev.title };
  }
  return {
    etat: "pret",
    change,
    actuel: { status: ligne.status, name: ligne.name, phone: ligne.phone },
    reunion: {
      id: ev.id,
      title: ev.title,
      startAt: ev.startAt,
      location: ev.location,
    },
  };
}

/**
 * Applique le changement confirmé depuis le lien reçu par e-mail.
 *
 * Sous verrou de la ligne, et seulement si la réponse n'a pas bougé depuis la
 * demande : le lien sert une fois, et un lien plus ancien ne peut pas défaire
 * un changement plus récent.
 */
export async function confirmerChangementDePresence(token: string) {
  const change = await openPresenceChange(token);
  if (!change) {
    throw new HttpError(
      410,
      "Ce lien n'est plus valable : il a expiré ou il est incomplet. Répondez à nouveau depuis la page de la réunion.",
    );
  }

  const resultat = await db.transaction(async (tx) => {
    const [ligne] = await tx
      .select({
        id: meetingAttendance.id,
        email: meetingAttendance.email,
        cancelToken: meetingAttendance.cancelToken,
        updatedAt: meetingAttendance.updatedAt,
      })
      .from(meetingAttendance)
      .where(
        and(
          eq(meetingAttendance.id, change.attendanceId),
          eq(meetingAttendance.eventId, change.eventId),
          isNull(meetingAttendance.userId),
        ),
      )
      .for("update");
    if (!ligne || ligne.updatedAt.getTime() !== change.updatedAtMs) {
      throw new HttpError(
        409,
        "Ce lien a déjà servi, ou votre réponse a changé depuis. Rien n'a été modifié.",
      );
    }

    const [reunion] = await tx
      .select({
        id: events.id,
        title: events.title,
        startAt: events.startAt,
        location: events.location,
        status: events.status,
        kind: events.kind,
        cancelledAt: events.cancelledAt,
      })
      .from(events)
      .where(eq(events.id, change.eventId))
      .limit(1);
    if (!reunion || reunion.cancelledAt) {
      throw new HttpError(
        410,
        "Cette réunion a été annulée : les réponses sont closes.",
      );
    }
    if (reunion.status !== "published" || reunion.kind !== "meeting") {
      throw new HttpError(404, "Cette réunion n'accepte plus de réponses.");
    }

    const cancelToken = ligne.cancelToken ?? generateToken(18);
    await tx
      .update(meetingAttendance)
      .set({
        status: change.status,
        name: change.name,
        phone: change.phone,
        cancelToken,
        updatedAt: new Date(),
      })
      .where(eq(meetingAttendance.id, ligne.id));
    return { email: ligne.email, cancelToken, reunion };
  });

  if (resultat.email) {
    await envoyerConfirmationPresence({
      email: resultat.email,
      nom: change.name,
      statut: change.status,
      reunion: resultat.reunion,
      cancelToken: resultat.cancelToken,
    });
  }
  // Une réponse qui change est une nouvelle, pas un doublon : « ne pourra
  // finalement pas venir » est justement ce que le bureau veut apprendre.
  await avertirLeBureauPresence({
    nom: change.name,
    email: resultat.email,
    phone: change.phone,
    statut: change.status,
    reunion: resultat.reunion,
  });
  return { status: change.status, reunion: resultat.reunion };
}
