import { eq } from "drizzle-orm";

import { HttpError } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { outboundMailSettings } from "@/lib/db/schema";
import { emptyToNull } from "@/lib/utils";
import { outboundMailSettingsSchema } from "@/lib/validation";

import { recordAudit, type AuditActor } from "./audit";
import { decryptSecret, encryptSecret } from "./settings-secrets";

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
      replyTo?: string;
    };

type SmtpEnvironment = {
  config: Extract<OutboundMailRuntimeConfig, { provider: "smtp" }> | null;
  error: string | null;
  host: string | null;
  port: number | null;
  secure: boolean;
  username: string | null;
  password: string | null;
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
 * Compatibilité avec les anciennes installations. La configuration en base
 * reste toujours prioritaire et l'environnement ne verrouille jamais l'UI.
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
    username: user,
    password,
    authConfigured: Boolean(user && password),
    from,
  };
}

function parseSender(value: string) {
  const match = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (!match) return { fromName: null, fromEmail: value.trim() || null };
  return {
    fromName: match[1]?.trim() || null,
    fromEmail: match[2]?.trim() || null,
  };
}

function formatSender(
  fromName: string | null | undefined,
  fromEmail: string | null | undefined,
  fallback: string,
) {
  if (!fromEmail) return fallback;
  return fromName ? `${fromName} <${fromEmail}>` : fromEmail;
}

export async function getOutboundMailSettings() {
  const settings = (
    await db
      .select()
      .from(outboundMailSettings)
      .where(eq(outboundMailSettings.id, SETTINGS_ID))
      .limit(1)
  ).at(0);
  return settings ?? null;
}

export async function getOutboundMailStatus() {
  let settings: Awaited<ReturnType<typeof getOutboundMailSettings>> = null;
  try {
    settings = await getOutboundMailSettings();
  } catch (error) {
    console.warn(
      "[email] état dynamique indisponible, utilisation du repli historique",
      error,
    );
  }
  if (settings) {
    const keyConfigured = Boolean(settings.encryptedApiKey);
    const smtpPasswordConfigured = Boolean(settings.encryptedSmtpPassword);
    let configurationError: string | null = null;

    if (!settings.fromEmail) {
      configurationError = "L’adresse d’expédition doit être renseignée.";
    } else if (settings.provider === "resend" && !keyConfigured) {
      configurationError = "La clé API Resend doit être renseignée.";
    } else if (settings.provider === "smtp" && !settings.smtpHost) {
      configurationError = "Le serveur SMTP doit être renseigné.";
    } else if (
      settings.provider === "smtp" &&
      (!settings.smtpPort ||
        settings.smtpPort < 1 ||
        settings.smtpPort > 65_535)
    ) {
      configurationError = "Le port SMTP doit être compris entre 1 et 65535.";
    } else if (
      settings.provider === "smtp" &&
      Boolean(settings.smtpUsername) !== smtpPasswordConfigured
    ) {
      configurationError =
        "L’identifiant et le mot de passe SMTP doivent être renseignés ensemble.";
    }

    return {
      provider: settings.provider,
      legacyEnvironment: false,
      enabled: settings.enabled,
      fromName: settings.fromName,
      fromEmail: settings.fromEmail,
      replyTo: settings.replyTo,
      domain: settings.domain,
      keyConfigured,
      keyLastFour: settings.keyLastFour,
      smtpHost: settings.smtpHost,
      smtpPort: settings.smtpPort,
      smtpSecure: settings.smtpSecure,
      smtpUsername: settings.smtpUsername,
      smtpPasswordConfigured,
      smtpAuthConfigured: Boolean(
        settings.smtpUsername && settings.encryptedSmtpPassword,
      ),
      configurationError,
      lastTestedAt: settings.lastTestedAt,
      lastTestStatus: settings.lastTestStatus,
      updatedAt: settings.updatedAt,
    };
  }

  // Repli transitoire pour une installation qui n'a encore jamais enregistré
  // ses réglages dans l'interface. Il n'empêche jamais leur modification.
  const smtp = getSmtpEnvironment();
  if (smtp) {
    const sender = parseSender(smtp.from);
    return {
      provider: "smtp" as const,
      legacyEnvironment: true,
      enabled: Boolean(smtp.config),
      fromName: sender.fromName,
      fromEmail: sender.fromEmail,
      replyTo: null,
      domain: null,
      keyConfigured: false,
      keyLastFour: null,
      smtpHost: smtp.host,
      smtpPort: smtp.port,
      smtpSecure: smtp.secure,
      smtpUsername: smtp.username,
      smtpPasswordConfigured: Boolean(smtp.password),
      smtpAuthConfigured: smtp.authConfigured,
      configurationError: smtp.error,
      lastTestedAt: null,
      lastTestStatus: "untested" as const,
      updatedAt: null,
    };
  }

  const legacyApiKey = process.env.RESEND_API_KEY?.trim();
  return {
    provider: "resend" as const,
    legacyEnvironment: Boolean(legacyApiKey),
    enabled: Boolean(legacyApiKey),
    fromName: legacyApiKey
      ? parseSender(process.env.EMAIL_FROM || DEFAULT_RESEND_FROM).fromName
      : null,
    fromEmail: legacyApiKey
      ? parseSender(process.env.EMAIL_FROM || DEFAULT_RESEND_FROM).fromEmail
      : null,
    replyTo: null,
    domain: null,
    keyConfigured: Boolean(legacyApiKey),
    keyLastFour: legacyApiKey?.slice(-4) ?? null,
    smtpHost: null,
    smtpPort: null,
    smtpSecure: false,
    smtpUsername: null,
    smtpPasswordConfigured: false,
    smtpAuthConfigured: false,
    configurationError: legacyApiKey
      ? null
      : "Renseignez l’adresse d’expédition et la clé API, puis enregistrez.",
    lastTestedAt: null,
    lastTestStatus: "untested" as const,
    updatedAt: null,
  };
}

export async function saveOutboundMailSettings(
  input: unknown,
  actor: AuditActor,
) {
  const data = outboundMailSettingsSchema.parse(input);
  const current = await getOutboundMailSettings();
  const apiKey = data.apiKey?.trim() || null;
  const smtpPassword = data.smtpPassword || null;
  const smtpPort =
    typeof data.smtpPort === "number" ? data.smtpPort : null;

  let encryptedApiKey = current?.encryptedApiKey ?? null;
  let keyLastFour = current?.keyLastFour ?? null;
  if (data.clearApiKey) {
    encryptedApiKey = null;
    keyLastFour = null;
  } else if (apiKey) {
    encryptedApiKey = encryptSecret(apiKey);
    keyLastFour = apiKey.slice(-4);
  } else if (!current && process.env.RESEND_API_KEY?.trim()) {
    const legacyApiKey = process.env.RESEND_API_KEY.trim();
    encryptedApiKey = encryptSecret(legacyApiKey);
    keyLastFour = legacyApiKey.slice(-4);
  }

  let encryptedSmtpPassword = current?.encryptedSmtpPassword ?? null;
  if (data.clearSmtpPassword) {
    encryptedSmtpPassword = null;
  } else if (smtpPassword) {
    encryptedSmtpPassword = encryptSecret(smtpPassword);
  } else if (!current) {
    const legacySmtp = getSmtpEnvironment();
    if (legacySmtp?.password) {
      encryptedSmtpPassword = encryptSecret(legacySmtp.password);
    }
  }

  const fromEmail = emptyToNull(data.fromEmail);
  const smtpHost = emptyToNull(data.smtpHost);
  const smtpUsername = emptyToNull(data.smtpUsername);

  if (data.enabled && !fromEmail) {
    throw new HttpError(
      400,
      "Renseignez l’adresse d’expédition avant d’activer les e-mails.",
    );
  }
  if (data.enabled && data.provider === "resend" && !encryptedApiKey) {
    throw new HttpError(
      400,
      "Renseignez la clé API Resend avant d’activer les e-mails.",
    );
  }
  if (
    data.enabled &&
    data.provider === "smtp" &&
    (!smtpHost || !smtpPort)
  ) {
    throw new HttpError(
      400,
      "Renseignez le serveur et le port SMTP avant d’activer les e-mails.",
    );
  }
  if (
    data.provider === "smtp" &&
    Boolean(smtpUsername) !== Boolean(encryptedSmtpPassword)
  ) {
    throw new HttpError(
      400,
      "L’identifiant et le mot de passe SMTP doivent être renseignés ensemble.",
    );
  }

  const values = {
    provider: data.provider,
    enabled: data.enabled,
    fromName: emptyToNull(data.fromName),
    fromEmail,
    replyTo: emptyToNull(data.replyTo),
    domain: emptyToNull(data.domain),
    encryptedApiKey,
    keyLastFour,
    smtpHost,
    smtpPort,
    smtpSecure: data.smtpSecure,
    smtpUsername,
    encryptedSmtpPassword,
    lastTestedAt: null,
    lastTestStatus: "untested" as const,
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
    apiKeyCleared: data.clearApiKey,
    smtpPasswordChanged: Boolean(smtpPassword),
    smtpPasswordCleared: data.clearSmtpPassword,
  });
  return getOutboundMailStatus();
}

export async function markOutboundMailTest(
  actor: AuditActor,
  success: boolean,
) {
  await db
    .update(outboundMailSettings)
    .set({
      lastTestedAt: new Date(),
      lastTestStatus: success ? "success" : "failed",
      updatedBy: actor.userId,
      updatedAt: new Date(),
    })
    .where(eq(outboundMailSettings.id, SETTINGS_ID));
  await recordAudit(actor, "mail.test", "mail_settings", SETTINGS_ID, {
    success,
  });
}

export async function getOutboundMailRuntimeConfig(
  allowDisabled = false,
): Promise<OutboundMailRuntimeConfig | null> {
  let settings: Awaited<ReturnType<typeof getOutboundMailSettings>> = null;
  try {
    settings = await getOutboundMailSettings();
  } catch (error) {
    // Compatibilité avant application de la migration : les variables
    // d'environnement historiques continuent de fonctionner.
    console.warn(
      "[email] réglages dynamiques indisponibles, repli sur l’environnement",
      error,
    );
  }

  if (settings) {
    if (!settings.enabled && !allowDisabled) return null;

    try {
      if (settings.provider === "smtp") {
        if (!settings.smtpHost || !settings.smtpPort || !settings.fromEmail) {
          return null;
        }
        const password = settings.encryptedSmtpPassword
          ? decryptSecret(settings.encryptedSmtpPassword)
          : null;
        if (Boolean(settings.smtpUsername) !== Boolean(password)) return null;
        return {
          provider: "smtp",
          host: settings.smtpHost,
          port: settings.smtpPort,
          secure: settings.smtpSecure,
          ...(settings.smtpUsername && password
            ? { auth: { user: settings.smtpUsername, pass: password } }
            : {}),
          from: formatSender(
            settings.fromName,
            settings.fromEmail,
            DEFAULT_SMTP_FROM,
          ),
          replyTo: settings.replyTo ?? undefined,
        };
      }

      if (!settings.encryptedApiKey || !settings.fromEmail) return null;
      return {
        provider: "resend",
        apiKey: decryptSecret(settings.encryptedApiKey),
        from: formatSender(
          settings.fromName,
          settings.fromEmail,
          DEFAULT_RESEND_FROM,
        ),
        replyTo: settings.replyTo ?? undefined,
      };
    } catch (error) {
      console.error(
        `[email] impossible de déchiffrer la configuration ${settings.provider}`,
        error,
      );
      return null;
    }
  }

  const smtp = getSmtpEnvironment();
  if (smtp) {
    if (!smtp.config && smtp.error) {
      console.error(`[email] configuration SMTP invalide : ${smtp.error}`);
    }
    return smtp.config;
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    provider: "resend",
    apiKey,
    from: process.env.EMAIL_FROM || DEFAULT_RESEND_FROM,
  };
}
