import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import webpush from "web-push";

import { HttpError } from "@/lib/auth/guards";
import { getBaseUrl } from "@/lib/base-url";
import { db } from "@/lib/db";
import { endpointPushAutorise } from "@/lib/push-endpoints";
import {
  associationSettings,
  pushDeliveries,
  pushNotifications,
  pushSubscriptions,
  users,
} from "@/lib/db/schema";

import { recordAudit, type AuditActor } from "./audit";
import {
  getAssociationSettings,
  getAssociationSettingsRecord,
} from "./association-settings";
import { decryptSecret, encryptSecret } from "./settings-secrets";

/**
 * Notifications sur l'appareil des membres (Web Push).
 *
 * Les clés VAPID sont engendrées au premier abonnement et conservées
 * chiffrées : rien à créer chez un tiers, rien à recopier dans un fichier de
 * configuration. Sans elles, aucun envoi n'est possible — c'est la seule
 * identité que le service de notification du navigateur reconnaît.
 */

const SETTINGS_ID = "default";

/**
 * Délai d'un envoi. Sans lui, un service de notification qui ne répondait pas
 * tenait indéfiniment ouverte la requête de l'administrateur.
 */
const DELAI_ENVOI_MS = 10_000;
/** Assez pour qu'une diffusion à toute l'équipe parte en quelques secondes. */
const ENVOIS_SIMULTANES = 10;
/**
 * Appareils conservés par membre. Chaque abonnement est une adresse que le
 * serveur appelle à chaque diffusion, avec jusqu'à DELAI_ENVOI_MS d'attente :
 * sans plafond, un membre qui en déclarait des centaines, toutes muettes,
 * faisait durer d'autant chaque envoi de l'administrateur. Dix suffisent aux
 * téléphones, tablettes et ordinateurs d'une famille.
 */
const APPAREILS_PAR_MEMBRE = 10;

/**
 * L'option `timeout` de web-push est un délai d'inactivité de la socket : elle
 * finit par fermer une connexion muette, mais seulement après une vingtaine de
 * secondes mesurées, et jamais si le serveur distille un octet de temps en
 * temps. L'échéance ferme se pose donc ici ; la bibliothèque garde la sienne
 * pour libérer la socket ensuite.
 */
function avecEcheance<T>(promesse: Promise<T>, ms: number): Promise<T> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const echeance = new Promise<never>((_, rejeter) => {
    minuteur = setTimeout(
      () =>
        rejeter(
          new Error(
            `Le service de notification n’a pas répondu en ${ms / 1000} s`,
          ),
        ),
      ms,
    );
  });
  return Promise.race([promesse, echeance]).finally(() =>
    clearTimeout(minuteur),
  );
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * Contact exigé par la spécification VAPID, que les services de notification
 * utilisent pour joindre l'exploitant. Seuls `mailto:` et `https:` sont
 * acceptés : une adresse en http — le cas en développement — doit donc être
 * relevée en https plutôt que transmise telle quelle, sous peine de faire
 * échouer tous les envois.
 */
async function sujetVapid(contactEmail: string | null): Promise<string> {
  if (contactEmail?.trim()) return `mailto:${contactEmail.trim()}`;
  const base = await getBaseUrl();
  try {
    const url = new URL(base);
    return `https://${url.host}`;
  } catch {
    return "https://localhost";
  }
}

/**
 * Renvoie la paire de clés, en l'engendrant au besoin. L'écriture n'a lieu que
 * si la colonne est encore vide : deux abonnements simultanés sur une
 * installation neuve retiennent donc la même paire, et non chacun la sienne.
 */
export async function getOrCreateVapidKeys(): Promise<VapidKeys | null> {
  const settings = await getAssociationSettings();
  const subject = await sujetVapid(settings.contactEmail);
  const existant = await getAssociationSettingsRecord();

  if (existant?.pushVapidPublicKey && existant.encryptedPushVapidPrivateKey) {
    try {
      return {
        publicKey: existant.pushVapidPublicKey,
        privateKey: decryptSecret(existant.encryptedPushVapidPrivateKey),
        subject,
      };
    } catch {
      console.error("[push] clé privée VAPID illisible : régénération");
    }
  }

  const paire = webpush.generateVAPIDKeys();
  await db
    .insert(associationSettings)
    .values({
      id: SETTINGS_ID,
      associationName: settings.associationName,
      schoolName: settings.schoolName,
      contactEmail: settings.contactEmail,
      rna: settings.rna,
      pushVapidPublicKey: paire.publicKey,
      encryptedPushVapidPrivateKey: encryptSecret(paire.privateKey),
    })
    .onConflictDoUpdate({
      target: associationSettings.id,
      set: {
        pushVapidPublicKey: paire.publicKey,
        encryptedPushVapidPrivateKey: encryptSecret(paire.privateKey),
      },
      where: isNull(associationSettings.pushVapidPublicKey),
    });

  const apres = await getAssociationSettingsRecord();
  if (!apres?.pushVapidPublicKey || !apres.encryptedPushVapidPrivateKey) {
    return null;
  }
  return {
    publicKey: apres.pushVapidPublicKey,
    privateKey: decryptSecret(apres.encryptedPushVapidPrivateKey),
    subject,
  };
}

/** Clé publique seule, pour le navigateur qui s'abonne. */
export async function getPushPublicKey(): Promise<string | null> {
  const keys = await getOrCreateVapidKeys();
  return keys?.publicKey ?? null;
}

/**
 * Les clés d'un abonnement sont engendrées par le navigateur et ne circulent
 * qu'entre lui et ce serveur. Les présenter à l'identique prouve qu'on écrit
 * depuis ce navigateur-là, ce que l'endpoint seul ne prouve pas : il peut
 * traîner dans un journal, une capture, un rapport d'erreur.
 */
function memesCles(
  a: { p256dh: string; auth: string },
  b: { p256dh: string; auth: string },
) {
  const gauche = Buffer.from(`${a.p256dh}\n${a.auth}`);
  const droite = Buffer.from(`${b.p256dh}\n${b.auth}`);
  return gauche.length === droite.length && timingSafeEqual(gauche, droite);
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Enregistre un appareil sans que son titulaire dépasse le plafond. Au-delà,
 * c'est le plus ancien qui part — dernier envoi réussi, à défaut inscription,
 * le plus lointain — plutôt que le nouveau qui est refusé : le membre n'a
 * aucun écran pour retirer un vieil appareil, et un abonnement abandonné
 * (téléphone changé, navigateur réinstallé) ne disparaît qu'au premier envoi
 * qui échoue. Refuser laisserait sans notification celui qui vient de changer
 * de téléphone.
 *
 * Renvoie `null` si l'endpoint a été enregistré entre-temps par une autre
 * demande.
 */
async function insererAvecPlafond(
  tx: Transaction,
  valeurs: typeof pushSubscriptions.$inferInsert,
): Promise<string | null> {
  // Verrou sur le compte : deux abonnements simultanés du même membre
  // compteraient chacun sans voir l'autre et dépasseraient le plafond à deux.
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, valeurs.userId))
    .for("no key update");
  const [ligne] = await tx
    .insert(pushSubscriptions)
    .values(valeurs)
    .onConflictDoNothing({ target: pushSubscriptions.endpoint })
    .returning({ id: pushSubscriptions.id });
  if (!ligne) return null;
  const excedent = await tx
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, valeurs.userId),
        ne(pushSubscriptions.id, ligne.id),
      ),
    )
    .orderBy(
      desc(
        sql`coalesce(${pushSubscriptions.lastSuccessAt}, ${pushSubscriptions.createdAt})`,
      ),
      desc(pushSubscriptions.createdAt),
    )
    .offset(APPAREILS_PAR_MEMBRE - 1);
  if (excedent.length > 0) {
    await tx.delete(pushSubscriptions).where(
      inArray(
        pushSubscriptions.id,
        excedent.map((e) => e.id),
      ),
    );
  }
  return ligne.id;
}

export async function saveSubscription(
  {
    userId,
    endpoint,
    p256dh,
    auth,
    deviceLabel,
  }: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    deviceLabel?: string | null;
  },
  actor: AuditActor,
) {
  const valeurs = { userId, endpoint, p256dh, auth, deviceLabel: deviceLabel ?? null };
  const lire = async () =>
    (
      await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint))
        .limit(1)
    ).at(0);

  let existant = await lire();
  if (!existant) {
    const insere = await db.transaction((tx) => insererAvecPlafond(tx, valeurs));
    if (insere) return;
    // Deux demandes simultanées pour le même appareil : l'autre a gagné, on
    // reprend avec la ligne qu'elle vient d'écrire.
    existant = await lire();
    if (!existant) return;
  }

  // Un même appareil peut se réabonner : ses clés ont pu changer, l'endpoint
  // reste le sien.
  if (existant.userId === userId) {
    await db
      .update(pushSubscriptions)
      .set({ p256dh, auth, deviceLabel: deviceLabel ?? null })
      .where(eq(pushSubscriptions.id, existant.id));
    return;
  }

  // L'endpoint appartient à un autre membre. Le réattribuer sur la seule foi
  // de l'endpoint permettait de détourner ses notifications : il ne les
  // recevait plus, sans rien voir. On n'accepte le transfert que de qui prouve
  // tenir le même navigateur — deux membres d'une famille sur un ordinateur
  // partagé, le cas pour lequel ce transfert existe.
  const ancien = existant;
  if (!memesCles(ancien, { p256dh, auth })) {
    throw new HttpError(
      409,
      "Cet appareil est déjà enregistré pour un autre compte. Désactivez puis réactivez les notifications dans ce navigateur.",
    );
  }

  // Supprimer puis recréer plutôt que modifier : l'historique des envois de
  // l'ancien titulaire ne doit pas se rattacher à l'appareil du nouveau.
  const nouveauId = await db.transaction(async (tx) => {
    await tx
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.id, ancien.id));
    return insererAvecPlafond(tx, valeurs);
  });
  if (!nouveauId) return;
  // Sans le nom d'appareil : c'est un texte libre du membre, et le journal
  // est relu par l'assistant des administrateurs (list_audit_logs). Les
  // identifiants suffisent à retrouver de quoi il s'agit.
  await recordAudit(actor, "push.subscription_transfer", "push_subscription", nouveauId, {
    fromUserId: ancien.userId,
    toUserId: userId,
  });
}

export async function removeSubscription(endpoint: string, userId: string) {
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.userId, userId),
      ),
    );
}

export interface SendResult {
  notificationId: string;
  /** Membres visés qui avaient au moins un appareil abonné. */
  devices: number;
  recipients: number;
  failures: number;
  /** Membres écartés faute d'appareil abonné ou par choix personnel. */
  skipped: { userId: string; reason: "no-device" | "disabled" }[];
}

export async function sendPushNotification(
  {
    title,
    body,
    url,
    userIds,
  }: { title: string; body: string; url?: string | null; userIds: string[] },
  actor: AuditActor,
): Promise<SendResult> {
  if (userIds.length === 0) {
    throw new HttpError(400, "Choisissez au moins un destinataire.");
  }
  const keys = await getOrCreateVapidKeys();
  if (!keys) {
    throw new HttpError(
      503,
      "Les notifications ne sont pas disponibles : la clé du serveur n’a pas pu être créée.",
    );
  }

  const cibles = await db
    .select({ id: users.id, pushEnabled: users.pushEnabled })
    .from(users)
    .where(inArray(users.id, userIds));

  const abonnements = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));

  const [notification] = await db
    .insert(pushNotifications)
    .values({
      senderId: actor.userId,
      title,
      body,
      url: url ?? null,
    })
    .returning();

  const skipped: SendResult["skipped"] = [];
  const envois: {
    subscription: (typeof abonnements)[number];
    deliveryId: string;
    ackToken: string;
  }[] = [];

  for (const cible of cibles) {
    // Le choix du membre prime sur celui de l'expéditeur : un membre qui a
    // coupé les notifications n'en reçoit pas, même nommément visé.
    if (!cible.pushEnabled) {
      skipped.push({ userId: cible.id, reason: "disabled" });
      continue;
    }
    const siens = abonnements.filter((a) => a.userId === cible.id);
    if (siens.length === 0) {
      skipped.push({ userId: cible.id, reason: "no-device" });
      continue;
    }
    for (const abonnement of siens) {
      const ackToken = randomBytes(24).toString("base64url");
      const [ligne] = await db
        .insert(pushDeliveries)
        .values({
          notificationId: notification.id,
          userId: cible.id,
          subscriptionId: abonnement.id,
          ackToken,
        })
        .returning({ id: pushDeliveries.id });
      envois.push({ subscription: abonnement, deliveryId: ligne.id, ackToken });
    }
  }

  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  const base = await getBaseUrl();
  // Le logo de l'association sert d'icône : sans lui, le système affiche une
  // pastille générique où rien ne dit d'où vient le message.
  const identite = await getAssociationSettings();
  const icone = identite.logoUrl
    ? new URL(identite.logoUrl, base).toString()
    : null;
  let failures = 0;
  const perimes: string[] = [];

  const envoyer = async ({
    subscription,
    deliveryId,
    ackToken,
  }: (typeof envois)[number]) => {
    const charge = JSON.stringify({
      title,
      body,
      url: url ? new URL(url, base).toString() : base,
      icon: icone,
      ack: ackToken,
    });
    try {
      // Un abonnement enregistré avant le contrôle des adresses peut viser
      // n'importe quelle machine : on ne l'appelle pas, on l'écarte comme un
      // abonnement révoqué.
      if (!endpointPushAutorise(subscription.endpoint)) {
        throw Object.assign(
          new Error(
            "Adresse d’abonnement hors des services de notification reconnus",
          ),
          { statusCode: 410 },
        );
      }
      await avecEcheance(
        webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          charge,
          { timeout: DELAI_ENVOI_MS },
        ),
        DELAI_ENVOI_MS,
      );
      await db
        .update(pushDeliveries)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(pushDeliveries.id, deliveryId));
      await db
        .update(pushSubscriptions)
        .set({ lastSuccessAt: new Date() })
        .where(eq(pushSubscriptions.id, subscription.id));
    } catch (error) {
      failures += 1;
      const statut = (error as { statusCode?: number }).statusCode;
      const raison =
        error instanceof Error ? error.message.slice(0, 300) : "erreur inconnue";
      // 404 et 410 signifient que le navigateur a révoqué l'abonnement :
      // le garder ne ferait qu'échouer à chaque envoi.
      if (statut === 404 || statut === 410) perimes.push(subscription.id);
      await db
        .update(pushDeliveries)
        .set({ status: "failed", error: raison })
        .where(eq(pushDeliveries.id, deliveryId));
    }
  };

  // Dix envois à la fois, chacun borné par son échéance. Chaque file reprend
  // l'appareil suivant dès qu'elle est libre : un service de notification
  // muet n'immobilise que la sienne, le temps du délai, au lieu de retenir
  // toute une vague. Une erreur imprévue sur un appareil est consignée et
  // n'arrête pas la file.
  let prochain = 0;
  const file = async () => {
    while (prochain < envois.length) {
      const envoi = envois[prochain];
      prochain += 1;
      try {
        await envoyer(envoi);
      } catch (error) {
        console.error("[push] envoi non journalisé :", error);
      }
    }
  };
  await Promise.allSettled(
    Array.from(
      { length: Math.min(ENVOIS_SIMULTANES, envois.length) },
      file,
    ),
  );

  if (perimes.length > 0) {
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.id, perimes));
  }

  await recordAudit(
    actor,
    "push.send",
    "push_notification",
    notification.id,
    {
      title,
      recipients: cibles.length - skipped.length,
      devices: envois.length,
      failures,
      obsoleteSubscriptions: perimes.length,
    },
  );

  return {
    notificationId: notification.id,
    devices: envois.length,
    recipients: cibles.length - skipped.length,
    failures,
    skipped,
  };
}

/**
 * Accusé renvoyé par le service worker. Le jeton identifie l'envoi : il n'y a
 * ni session à exiger ni identité à deviner.
 */
export async function acknowledgeDelivery(
  ackToken: string,
  event: "received" | "opened",
) {
  const maintenant = new Date();
  const champs =
    event === "opened"
      ? { status: "opened" as const, openedAt: maintenant }
      : { status: "received" as const, receivedAt: maintenant };

  await db
    .update(pushDeliveries)
    .set(
      event === "opened"
        ? champs
        : // Une ouverture déjà enregistrée ne doit pas être ramenée en arrière
          // par un accusé de réception arrivé plus tard.
          { ...champs, receivedAt: maintenant },
    )
    .where(
      and(
        eq(pushDeliveries.ackToken, ackToken),
        event === "opened"
          ? sql`true`
          : sql`${pushDeliveries.status} <> 'opened'`,
      ),
    );
}

/** Membres pouvant être notifiés, avec le nombre d'appareils activés. */
export async function listPushRecipients() {
  const lignes = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      pushEnabled: users.pushEnabled,
      devices: sql<number>`count(${pushSubscriptions.id})::int`,
    })
    .from(users)
    .leftJoin(pushSubscriptions, eq(pushSubscriptions.userId, users.id))
    // Un compte en attente ne peut pas s'abonner ; le proposer comme
    // destinataire ferait croire qu'il recevra quelque chose.
    .where(isNotNull(users.approvedAt))
    .groupBy(users.id)
    .orderBy(users.name);
  return lignes;
}

/** Historique des envois, avec le détail par destinataire. */
export async function listSentNotifications(limit = 20) {
  const envois = await db
    .select({
      id: pushNotifications.id,
      title: pushNotifications.title,
      body: pushNotifications.body,
      url: pushNotifications.url,
      createdAt: pushNotifications.createdAt,
      senderName: users.name,
    })
    .from(pushNotifications)
    .leftJoin(users, eq(users.id, pushNotifications.senderId))
    .orderBy(sql`${pushNotifications.createdAt} desc`)
    .limit(limit);

  if (envois.length === 0) return [];

  const destinataires = await db
    .select({
      notificationId: pushDeliveries.notificationId,
      userId: pushDeliveries.userId,
      name: users.name,
      status: pushDeliveries.status,
      error: pushDeliveries.error,
      receivedAt: pushDeliveries.receivedAt,
      openedAt: pushDeliveries.openedAt,
      deviceLabel: pushSubscriptions.deviceLabel,
    })
    .from(pushDeliveries)
    .innerJoin(users, eq(users.id, pushDeliveries.userId))
    .leftJoin(
      pushSubscriptions,
      eq(pushSubscriptions.id, pushDeliveries.subscriptionId),
    )
    .where(
      inArray(
        pushDeliveries.notificationId,
        envois.map((e) => e.id),
      ),
    );

  return envois.map((envoi) => ({
    ...envoi,
    deliveries: destinataires.filter((d) => d.notificationId === envoi.id),
  }));
}
