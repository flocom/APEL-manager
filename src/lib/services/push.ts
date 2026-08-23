import "server-only";

import { randomBytes } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import webpush from "web-push";

import { HttpError } from "@/lib/auth/guards";
import { getBaseUrl } from "@/lib/base-url";
import { db } from "@/lib/db";
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

export async function saveSubscription({
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
}) {
  // Un même appareil peut se réabonner : l'endpoint fait foi, et change de
  // propriétaire si deux membres partagent le navigateur.
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint, p256dh, auth, deviceLabel: deviceLabel ?? null })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh, auth, deviceLabel: deviceLabel ?? null },
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

  await Promise.all(
    envois.map(async ({ subscription, deliveryId, ackToken }) => {
      const charge = JSON.stringify({
        title,
        body,
        url: url ? new URL(url, base).toString() : base,
        icon: icone,
        ack: ackToken,
      });
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          charge,
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
        await db
          .update(pushDeliveries)
          .set({ status: "failed", error: raison })
          .where(eq(pushDeliveries.id, deliveryId));
        // 404 et 410 signifient que le navigateur a révoqué l'abonnement :
        // le garder ne ferait qu'échouer à chaque envoi.
        if (statut === 404 || statut === 410) perimes.push(subscription.id);
      }
    }),
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
