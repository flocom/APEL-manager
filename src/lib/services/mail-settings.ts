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
const DEFAULT_RESEND_FROM =
  "APEL Notre Dame des Flots <onboarding@resend.dev>";
const DEFAULT_SMTP_FROM = "APEL Notre Dame des Flots <noreply@apel.local>";

export type OutboundMailRuntimeConfig =
  | {
      provider: "resend";
      apiKey: string;
      from: string;
      replyTo?: string;
    }
  | {
      provider: "smtp";
      host: string;
      port: number;
      secure: boolean;
      auth?: {
        user: string;
        pass: string;
      };
      from: string;
    };

type SmtpEnvironment = {
  selected: true;
  config: Extract<OutboundMailRuntimeConfig, { provider: "smtp" }> | null;
  error: string | null;
  host: string | null;
  port: number | null;
  secure: boolean;
  authConfigured: boolean;
  from: string;
};

function parseBooleanEnvironment(
  value: string | undefined,
): boolean | null {
  if (value === undefined || value.trim() === "") return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

/**
 * Lit le transport SMTP géré par l'environnement. Le mot de passe n'est
 * présent que dans la configuration d'exécution et ne doit jamais être
 * retourné par une API ou journalisé.
 */
function getSmtpEnvironment(): SmtpEnvironment | null {
  if (process.env.MAIL_PROVIDER?.trim().toLowerCase() !== "smtp") return null;

  const host = process.env.SMTP_HOST?.trim() || null;
  const portValue = process.env.SMTP_PORT?.trim() || "25";
  const port = /^\d+$/.test(portValue) ? Number(portValue) : null;
  const explicitSecure = parseBooleanEnvironment(process.env.SMTP_SECURE);
  const secure = explicitSecure ?? port === 465;
  const user = process.env.SMTP_USER?.trim() || null;
  const password = process.env.SMTP_PASSWORD || null;
  const from =
    process.env.SMTP_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    DEFAULT_SMTP_FROM;

  let error: string | null = null;
  if (!host) {
    error = "SMTP_HOST doit être configuré.";
  } else if (port === null || port < 1 || port > 65_535) {
    error = "SMTP_PORT doit être un port valide entre 1 et 65535.";
  } else if (process.env.SMTP_SECURE?.trim() && explicitSecure === null) {
    error = "SMTP_SECURE doit valoir true ou false.";
  } else if (Boolean(user) !== Boolean(password)) {
    error =
      "SMTP_USER et SMTP_PASSWORD doivent être configurés ensemble, ou tous les deux laissés vides.";
  }

  return {
    selected: true,
    config:
      !error && host && port
        ? {
            provider: "smtp",
            host,
            port,
            secure,
            ...(user && password ? { auth: { user, pass: password } } : {}),
            from,
          }
        : null,
    error,
    host,
    port,
    secure,
    authConfigured: Boolean(user && password),
    from,
  };
}

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
  const smtp = getSmtpEnvironment();
  if (smtp) {
    return {
      provider: "smtp" as const,
      environmentManaged: true,
      enabled: Boolean(smtp.config),
      fromName: null,
      fromEmail: null,
      replyTo: null,
      domain: null,
      keyConfigured: false,
      keyLastFour: null,
      smtpHost: smtp.host,
      smtpPort: smtp.port,
      smtpSecure: smtp.secure,
      smtpAuthConfigured: smtp.authConfigured,
      smtpFrom: smtp.from,
      configurationError: smtp.error,
      lastTestedAt: settings?.lastTestedAt ?? null,
      lastTestStatus: settings?.lastTestStatus ?? "untested",
      updatedAt: settings?.updatedAt ?? null,
    };
  }

  return {
    provider: "resend" as const,
    environmentManaged: false,
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
    smtpHost: null,
    smtpPort: null,
    smtpSecure: false,
    smtpAuthConfigured: false,
    smtpFrom: null,
    configurationError: null,
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

export async function getOutboundMailRuntimeConfig(): Promise<
  OutboundMailRuntimeConfig | null
> {
  const smtp = getSmtpEnvironment();
  if (smtp) {
    if (!smtp.config && smtp.error) {
      console.error(`[email] configuration SMTP invalide : ${smtp.error}`);
    }
    return smtp.config;
  }

  try {
    const settings = await getOutboundMailSettings();
    if (settings) {
      if (!settings.enabled) return null;
      const apiKey = settings.encryptedApiKey
        ? decryptSecret(settings.encryptedApiKey)
        : process.env.RESEND_API_KEY?.trim();
      if (!apiKey) return null;
      const envFrom = process.env.EMAIL_FROM || DEFAULT_RESEND_FROM;
      const from =
        settings.fromEmail && settings.fromName
          ? `${settings.fromName} <${settings.fromEmail}>`
          : settings.fromEmail || envFrom;
      return {
        provider: "resend",
        apiKey,
        from,
        replyTo: settings.replyTo ?? undefined,
      };
    }
  } catch (error) {
    // Compatibilité avant application de la migration : les variables
    // d'environnement historiques continuent de fonctionner.
    console.warn(
      "[email] réglages dynamiques indisponibles, repli sur l’environnement",
      error,
    );
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    provider: "resend",
    apiKey,
    from: process.env.EMAIL_FROM || DEFAULT_RESEND_FROM,
  };
}
