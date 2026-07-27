import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { eq } from "drizzle-orm";

import { HttpError } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { outboundMailSettings } from "@/lib/db/schema";
import { emptyToNull } from "@/lib/utils";
import { outboundMailSettingsSchema } from "@/lib/validation";

import { recordAudit, type AuditActor } from "./audit";

const SETTINGS_ID = "default";

function encryptionKey(): Buffer {
  const source =
    process.env.SETTINGS_ENCRYPTION_KEY?.trim() ||
    process.env.AUTH_SECRET?.trim();
  if (!source || source.length < 32) {
    throw new HttpError(
      500,
      "SETTINGS_ENCRYPTION_KEY doit contenir au moins 32 caractères.",
    );
  }
  return createHash("sha256").update(source).digest();
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, encrypted]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decryptSecret(payload: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Format de secret chiffré invalide.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function getOutboundMailSettings() {
  const [settings] = await db
    .select()
    .from(outboundMailSettings)
    .where(eq(outboundMailSettings.id, SETTINGS_ID))
    .limit(1);
  return settings ?? null;
}

export async function getOutboundMailStatus() {
  const settings = await getOutboundMailSettings();
  return {
    provider: settings?.provider ?? "resend",
    enabled: settings?.enabled ?? Boolean(process.env.RESEND_API_KEY),
    fromName: settings?.fromName ?? null,
    fromEmail: settings?.fromEmail ?? null,
    replyTo: settings?.replyTo ?? null,
    domain: settings?.domain ?? null,
    keyConfigured: Boolean(
      settings?.encryptedApiKey || process.env.RESEND_API_KEY,
    ),
    keyLastFour:
      settings?.keyLastFour ??
      (process.env.RESEND_API_KEY
        ? process.env.RESEND_API_KEY.slice(-4)
        : null),
    lastTestedAt: settings?.lastTestedAt ?? null,
    lastTestStatus: settings?.lastTestStatus ?? "untested",
    updatedAt: settings?.updatedAt ?? null,
  };
}

export async function saveOutboundMailSettings(
  input: unknown,
  actor: AuditActor,
) {
  const data = outboundMailSettingsSchema.parse(input);
  const apiKey = data.apiKey?.trim() || null;
  const values = {
    provider: data.provider,
    enabled: data.enabled,
    fromName: emptyToNull(data.fromName),
    fromEmail: emptyToNull(data.fromEmail),
    replyTo: emptyToNull(data.replyTo),
    domain: emptyToNull(data.domain),
    ...(apiKey
      ? {
          encryptedApiKey: encryptSecret(apiKey),
          keyLastFour: apiKey.slice(-4),
        }
      : {}),
    updatedBy: actor.userId,
    updatedAt: new Date(),
  };

  const [saved] = await db
    .insert(outboundMailSettings)
    .values({ id: SETTINGS_ID, ...values })
    .onConflictDoUpdate({
      target: outboundMailSettings.id,
      set: values,
    })
    .returning();
  await recordAudit(actor, "mail.settings_update", "mail_settings", SETTINGS_ID, {
    enabled: saved.enabled,
    provider: saved.provider,
    apiKeyChanged: Boolean(apiKey),
  });
  return getOutboundMailStatus();
}

export async function markOutboundMailTest(
  actor: AuditActor,
  success: boolean,
) {
  await db
    .insert(outboundMailSettings)
    .values({
      id: SETTINGS_ID,
      enabled: success,
      updatedBy: actor.userId,
      lastTestedAt: new Date(),
      lastTestStatus: success ? "success" : "failed",
    })
    .onConflictDoUpdate({
      target: outboundMailSettings.id,
      set: {
        lastTestedAt: new Date(),
        lastTestStatus: success ? "success" : "failed",
        updatedBy: actor.userId,
        updatedAt: new Date(),
      },
    });
  await recordAudit(actor, "mail.test", "mail_settings", SETTINGS_ID, {
    success,
  });
}

export async function getOutboundMailRuntimeConfig(): Promise<{
  apiKey: string;
  from: string;
  replyTo?: string;
} | null> {
  try {
    const settings = await getOutboundMailSettings();
    if (settings) {
      if (!settings.enabled) return null;
      const apiKey = settings.encryptedApiKey
        ? decryptSecret(settings.encryptedApiKey)
        : process.env.RESEND_API_KEY?.trim();
      if (!apiKey) return null;
      const envFrom =
        process.env.EMAIL_FROM ||
        "APEL Notre Dame des Flots <onboarding@resend.dev>";
      const from =
        settings.fromEmail && settings.fromName
          ? `${settings.fromName} <${settings.fromEmail}>`
          : settings.fromEmail || envFrom;
      return {
        apiKey,
        from,
        replyTo: settings.replyTo ?? undefined,
      };
    }
  } catch (error) {
    // Compatibilité avant application de la migration : les variables
    // d'environnement historiques continuent de fonctionner.
    console.warn("[email] réglages dynamiques indisponibles, repli sur l’environnement", error);
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    from:
      process.env.EMAIL_FROM ||
      "APEL Notre Dame des Flots <onboarding@resend.dev>",
  };
}
