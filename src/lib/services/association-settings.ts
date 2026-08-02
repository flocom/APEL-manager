import "server-only";

import { eq } from "drizzle-orm";

import { HttpError } from "@/lib/auth/guards";
import {
  APP_NAME,
  ASSOCIATION_RNA,
  CONTACT_EMAIL,
  SCHOOL_NAME,
} from "@/lib/app-config";
import { db } from "@/lib/db";
import { associationSettings } from "@/lib/db/schema";
import { checkTelegramBotToken } from "@/lib/notifications/telegram";
import { emptyToNull } from "@/lib/utils";
import { associationSettingsSchema } from "@/lib/validation";

import { recordAudit, type AuditActor } from "./audit";
import { decryptSecret, encryptSecret } from "./settings-secrets";

const SETTINGS_ID = "default";

/** Un token illisible (clé de chiffrement changée) doit être retraité comme absent. */
function safeDecrypt(encrypted: string): string | null {
  try {
    return decryptSecret(encrypted);
  } catch (error) {
    console.error("[telegram] impossible de déchiffrer le token", error);
    return null;
  }
}

function legacyReminderWindow(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 && value <= 30
    ? value
    : fallback;
}

export async function getAssociationSettingsRecord() {
  const settings = (
    await db
      .select()
      .from(associationSettings)
      .where(eq(associationSettings.id, SETTINGS_ID))
      .limit(1)
  ).at(0);
  return settings ?? null;
}

/**
 * Profil public et préférences métier. L'environnement n'est consulté que
 * pour migrer une ancienne installation qui n'a encore aucune ligne en base.
 */
export async function getAssociationSettings() {
  let settings: Awaited<ReturnType<typeof getAssociationSettingsRecord>> =
    null;
  try {
    settings = await getAssociationSettingsRecord();
  } catch (error) {
    // Permet un déploiement sans écran blanc pendant la courte fenêtre où la
    // nouvelle migration n'est pas encore appliquée.
    console.warn(
      "[settings] réglages dynamiques indisponibles, utilisation des valeurs par défaut",
      error,
    );
  }
  if (settings) {
    return {
      associationName: settings.associationName,
      schoolName: settings.schoolName,
      contactEmail: settings.contactEmail,
      rna: settings.rna,
      logoUrl: settings.logoUrl,
      taskReminderWindowDays: settings.taskReminderWindowDays,
      volunteerReminderWindowDays: settings.volunteerReminderWindowDays,
      telegramEnabled: settings.telegramEnabled,
      telegramTokenConfigured: Boolean(settings.encryptedTelegramBotToken),
      telegramTokenLastFour: settings.telegramTokenLastFour,
      telegramBotUsername: settings.telegramBotUsername,
      telegramTokenVerifiedAt: settings.telegramTokenVerifiedAt,
      /** Seul état qui autorise à proposer le canal aux membres. */
      telegramReady:
        settings.telegramEnabled &&
        Boolean(settings.encryptedTelegramBotToken) &&
        Boolean(settings.telegramTokenVerifiedAt),
      legacyEnvironment: false,
      updatedAt: settings.updatedAt,
    };
  }

  const legacyTelegramToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
  return {
    associationName: APP_NAME,
    schoolName: SCHOOL_NAME,
    contactEmail: CONTACT_EMAIL || null,
    rna: ASSOCIATION_RNA,
    logoUrl: null,
    taskReminderWindowDays: legacyReminderWindow("REMINDER_WINDOW_DAYS", 3),
    volunteerReminderWindowDays: 2,
    telegramEnabled: Boolean(legacyTelegramToken),
    telegramTokenConfigured: Boolean(legacyTelegramToken),
    telegramTokenLastFour: legacyTelegramToken?.slice(-4) ?? null,
    telegramBotUsername: null,
    telegramTokenVerifiedAt: null,
    // Installation d'avant les réglages en base : le token de l'environnement
    // n'a jamais pu être confirmé, le canal reste donc fermé aux membres tant
    // qu'un administrateur n'a pas enregistré les réglages une fois.
    telegramReady: false,
    legacyEnvironment: Boolean(
      process.env.NEXT_PUBLIC_ASSO_NAME ||
        process.env.NEXT_PUBLIC_SCHOOL_NAME ||
        process.env.NEXT_PUBLIC_CONTACT_EMAIL ||
        process.env.NEXT_PUBLIC_ASSOCIATION_RNA ||
        process.env.REMINDER_WINDOW_DAYS ||
        legacyTelegramToken,
    ),
    updatedAt: null,
  };
}

export async function saveAssociationSettings(
  input: unknown,
  actor: AuditActor,
) {
  const data = associationSettingsSchema.parse(input);
  const current = await getAssociationSettingsRecord();
  const telegramBotToken = data.telegramBotToken?.trim() || null;

  let encryptedTelegramBotToken =
    current?.encryptedTelegramBotToken ?? null;
  let telegramTokenLastFour = current?.telegramTokenLastFour ?? null;
  if (data.clearTelegramBotToken) {
    encryptedTelegramBotToken = null;
    telegramTokenLastFour = null;
  } else if (telegramBotToken) {
    encryptedTelegramBotToken = encryptSecret(telegramBotToken);
    telegramTokenLastFour = telegramBotToken.slice(-4);
  } else if (!current && process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    const legacyToken = process.env.TELEGRAM_BOT_TOKEN.trim();
    encryptedTelegramBotToken = encryptSecret(legacyToken);
    telegramTokenLastFour = legacyToken.slice(-4);
  }

  if (data.telegramEnabled && !encryptedTelegramBotToken) {
    throw new HttpError(
      400,
      "Renseignez le token du bot avant d’activer Telegram.",
    );
  }

  // Le canal n'est proposé aux membres que lorsque Telegram a confirmé le
  // token : un token seulement enregistré laisserait chacun saisir un chat ID
  // pour ne jamais rien recevoir. La vérification a lieu à chaque
  // enregistrement où Telegram est actif, ce qui détecte aussi un token
  // révoqué depuis.
  let telegramBotUsername = current?.telegramBotUsername ?? null;
  let telegramTokenVerifiedAt = current?.telegramTokenVerifiedAt ?? null;
  if (!encryptedTelegramBotToken) {
    telegramBotUsername = null;
    telegramTokenVerifiedAt = null;
  } else if (telegramBotToken || data.telegramEnabled) {
    const rawToken = telegramBotToken ?? safeDecrypt(encryptedTelegramBotToken);
    const check = rawToken
      ? await checkTelegramBotToken(rawToken)
      : ({ ok: false, reason: "refused", detail: "token illisible" } as const);

    if (check.ok) {
      telegramBotUsername = check.username;
      telegramTokenVerifiedAt = new Date();
    } else if (check.reason === "refused") {
      throw new HttpError(
        400,
        `Token refusé par Telegram (${check.detail}). Corrigez-le, ou décochez « Activer Telegram » pour enregistrer le reste.`,
      );
    } else if (telegramBotToken || !current?.telegramEnabled) {
      // Panne réseau alors que l'administrateur change justement le token ou
      // active le canal : mieux vaut refuser que d'annoncer un canal non
      // confirmé.
      throw new HttpError(
        502,
        `Telegram est injoignable (${check.detail}) : impossible de confirmer le token. Réessayez dans un instant.`,
      );
    }
    // Sinon : le canal était déjà actif et rien de Telegram ne change — une
    // panne réseau passagère ne doit pas bloquer les autres réglages.
  }

  const values = {
    associationName: data.associationName,
    schoolName: data.schoolName,
    contactEmail: emptyToNull(data.contactEmail),
    rna: data.rna,
    logoUrl: emptyToNull(data.logoUrl),
    taskReminderWindowDays: data.taskReminderWindowDays,
    volunteerReminderWindowDays: data.volunteerReminderWindowDays,
    telegramEnabled: data.telegramEnabled,
    encryptedTelegramBotToken,
    telegramTokenLastFour,
    telegramBotUsername,
    telegramTokenVerifiedAt,
    updatedBy: actor.userId,
    updatedAt: new Date(),
  };

  await db
    .insert(associationSettings)
    .values({ id: SETTINGS_ID, ...values })
    .onConflictDoUpdate({
      target: associationSettings.id,
      set: values,
    });

  await recordAudit(
    actor,
    "association.settings_update",
    "association_settings",
    SETTINGS_ID,
    {
      telegramEnabled: data.telegramEnabled,
      telegramTokenChanged: Boolean(telegramBotToken),
      telegramTokenCleared: data.clearTelegramBotToken,
      taskReminderWindowDays: data.taskReminderWindowDays,
      volunteerReminderWindowDays: data.volunteerReminderWindowDays,
    },
  );

  return getAssociationSettings();
}

export async function getTelegramBotToken() {
  let settings: Awaited<ReturnType<typeof getAssociationSettingsRecord>> =
    null;
  try {
    settings = await getAssociationSettingsRecord();
  } catch (error) {
    console.warn(
      "[telegram] réglages dynamiques indisponibles, repli sur l’environnement",
      error,
    );
  }

  if (settings) {
    if (!settings.telegramEnabled || !settings.encryptedTelegramBotToken) {
      return null;
    }
    return safeDecrypt(settings.encryptedTelegramBotToken);
  }

  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}
