import "server-only";

import { fr } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import { and, asc, count, countDistinct, desc, eq, gte, inArray, isNotNull, isNull, lt } from "drizzle-orm";

import { HttpError } from "@/lib/auth/guards";
import { configuredBaseUrl } from "@/lib/base-url";
import {
  CLASS_VIDEO_KIND,
  parseClassVideoContent,
  type ClassVideoContent,
  type ClassVideoSource,
} from "@/lib/communication/class-video";
import {
  DEFAULT_INTEGRATED_VOICE,
  INTEGRATED_VOICES,
  integratedEnginesAvailable,
  isIntegratedVoice,
  prepareIntegratedVoice,
  synthesizeIntegrated,
  type IntegratedVoiceId,
} from "@/lib/communication/integrated-voice";
import { ttsVoiceKey, type IntegratedEngine } from "@/lib/communication/voices";
import { paletteFromLogo } from "@/lib/communication/logo-palette";
import { APP_TIMEZONE } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  associationMembers,
  communicationSettings,
  communicationSupports,
  events,
  users,
  volunteerSignups,
  volunteerSlots,
} from "@/lib/db/schema";
import { redactError } from "@/lib/errors";
import { readUpload, saveUpload, storedUploadIdFromUrl } from "@/lib/uploads";
import { MEMBERSHIP_FEE_BASIS_SUFFIX } from "@/lib/validation";

import { getAssociationSettings } from "./association-settings";
import { recordAudit, type AuditActor } from "./audit";
import { hitRateLimit, rateLimitError } from "./rate-limit";
import { decryptSecret, encryptSecret } from "./settings-secrets";

const SETTINGS_ID = "default";

// ---------------------------------------------------------------------------
// Ce que l'application sait déjà
// ---------------------------------------------------------------------------

/** Le fichier du logo, pour en tirer la palette ; null s'il est externe ou absent. */
async function logoBytes(logoUrl: string | null): Promise<Buffer | null> {
  if (!logoUrl) return null;
  const id = storedUploadIdFromUrl(logoUrl, "branding");
  if (!id) return null;
  try {
    const file = await readUpload(id, logoUrl.split("/").at(-1) ?? "");
    return file.data;
  } catch {
    return null;
  }
}

/**
 * La cotisation telle que la page « Nous rejoindre » l'annonce : « 23,00 € par
 * famille ». Non publiée, la vidéo n'en dit rien plutôt que d'afficher 0 €.
 */
function cotisationAffichee(settings: {
  membershipFeePublished: boolean;
  membershipFeeCents: number | null;
  membershipFeeBasis: keyof typeof MEMBERSHIP_FEE_BASIS_SUFFIX;
}): string | null {
  if (!settings.membershipFeePublished || settings.membershipFeeCents === null) {
    return null;
  }
  const montant = (settings.membershipFeeCents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    // « 23 € » se lit mieux que « 23,00 € » sur un écran ; les centimes
    // restent quand il y en a.
    minimumFractionDigits: settings.membershipFeeCents % 100 === 0 ? 0 : 2,
  });
  const suffixe = MEMBERSHIP_FEE_BASIS_SUFFIX[settings.membershipFeeBasis];
  return suffixe ? `${montant} ${suffixe}` : montant;
}

/** « apel-ndf.fr » : l'adresse du site telle qu'on l'affiche. */
function siteLabel(): string {
  const base = configuredBaseUrl();
  if (!base) return "";
  return base.replace(/^https?:\/\//, "").replace(/^www\./, "");
}

/** « apel-ndf.fr/rejoindre » : l'adresse telle qu'on la lit à voix haute. */
function joinLabel(): string {
  const base = configuredBaseUrl();
  if (!base) return "";
  return `${base.replace(/^https?:\/\//, "").replace(/^www\./, "")}/rejoindre`;
}

/**
 * Bornes de l'année scolaire en cours, du 1er septembre au 31 août. La vidéo
 * est projetée surtout à la rentrée : ce qui compte alors, ce sont les
 * rendez-vous de l'année qui commence, pas seulement ceux déjà passés.
 */
function anneeScolaire(now: Date): { debut: Date; fin: Date } {
  const annee = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return { debut: new Date(annee, 8, 1), fin: new Date(annee + 1, 8, 1) };
}

/**
 * Un chiffre n'est montré aux enfants que s'il impressionne un peu : « 2
 * bénévoles », en début d'année quand les inscriptions commencent à peine,
 * desservirait l'association plus qu'il ne la présenterait.
 */
const CHIFFRE_MINIMUM = 5;

/**
 * Tout ce que la vidéo peut dire sans que le bureau écrive une ligne : les
 * noms, la palette du logo, les événements de l'année et quelques chiffres.
 */
export async function getClassVideoSource(now = new Date()): Promise<ClassVideoSource> {
  const settings = await getAssociationSettings();
  const { debut, fin } = anneeScolaire(now);

  const [palette, recent, eventCount, volunteerCount, lastYear, team] =
    await Promise.all([
      logoBytes(settings.logoUrl).then(paletteFromLogo),
      db
        .select({ title: events.title, startAt: events.startAt })
        .from(events)
        .where(
          and(
            eq(events.kind, "event"),
            eq(events.status, "published"),
            isNull(events.cancelledAt),
            gte(events.startAt, debut),
            lt(events.startAt, fin),
          ),
        )
        .orderBy(asc(events.startAt))
        .limit(40),
      db
        .select({ value: count() })
        .from(events)
        .where(
          and(
            eq(events.kind, "event"),
            inArray(events.status, ["published", "archived"]),
            isNull(events.cancelledAt),
            gte(events.startAt, debut),
            lt(events.startAt, fin),
          ),
        ),
      // Bénévoles distincts de l'année scolaire, comptés à leur adresse e-mail.
      db
        .select({
          value: countDistinct(volunteerSignups.email),
        })
        .from(volunteerSignups)
        .innerJoin(volunteerSlots, eq(volunteerSignups.slotId, volunteerSlots.id))
        .innerJoin(events, eq(volunteerSlots.eventId, events.id))
        .where(
          and(
            gte(events.startAt, debut),
            lt(events.startAt, fin),
            isNotNull(volunteerSignups.email),
          ),
        ),
      db
        .selectDistinct({ schoolYear: associationMembers.schoolYear })
        .from(associationMembers)
        .orderBy(desc(associationMembers.schoolYear))
        .limit(1),
      db
        .select({ name: users.name, role: users.role })
        .from(users)
        .where(and(inArray(users.role, ["admin", "manager"]), isNotNull(users.approvedAt)))
        .orderBy(users.createdAt)
        .limit(8),
    ]);

  const families = lastYear[0]
    ? (
        await db
          .select({ value: count() })
          .from(associationMembers)
          .where(
            and(
              eq(associationMembers.schoolYear, lastYear[0].schoolYear),
              eq(associationMembers.status, "active"),
            ),
          )
      )[0]?.value ?? 0
    : 0;

  // Un même intitulé revient chaque année (« Kermesse ») : il n'est cité qu'une fois.
  const recentEvents = [...new Set(recent.map((e) => e.title.trim()))].filter(Boolean);

  // Les rendez-vous à venir, le prochain en tête ; un intitulé qui revient
  // (deux ventes de gâteaux) n'est cité qu'une fois.
  const vus = new Set<string>();
  const aVenir = recent
    .filter((e) => e.startAt >= now)
    .filter((e) => {
      const cle = e.title.trim().toLowerCase();
      if (!cle || vus.has(cle)) return false;
      vus.add(cle);
      return true;
    })
    .map((e) => ({
      title: e.title.trim(),
      dateLabel: formatInTimeZone(e.startAt, APP_TIMEZONE, "EEEE d MMMM", { locale: fr }),
    }));

  return {
    associationName: settings.associationName,
    schoolName: settings.schoolName,
    logoUrl: settings.logoUrl,
    palette,
    joinLabel: joinLabel(),
    joinUrl: configuredBaseUrl() ? `${configuredBaseUrl()}/rejoindre` : "",
    membershipFee: cotisationAffichee(settings),
    recentEvents,
    agenda: {
      total: Number(eventCount[0]?.value ?? 0),
      next: aVenir[0] ?? null,
      upcoming: aVenir.slice(1, 5),
    },
    siteLabel: siteLabel(),
    figures: (
      [
        { key: "familles", value: Number(families), label: "familles adhérentes" },
        { key: "benevoles", value: Number(volunteerCount[0]?.value ?? 0), label: "bénévoles" },
        { key: "evenements", value: Number(eventCount[0]?.value ?? 0), label: "rendez-vous cette année" },
      ] as const
    ).filter((f) => f.value >= CHIFFRE_MINIMUM),
    // Le prénom seul : la vidéo s'adresse à des enfants, et le nom de famille
    // d'un parent n'a pas à s'afficher en grand devant une classe.
    suggestedMembers: team.map((u) => ({
      name: u.name.trim().split(/\s+/)[0] ?? u.name,
      role: "",
    })),
  };
}

// ---------------------------------------------------------------------------
// Contenu enregistré
// ---------------------------------------------------------------------------

export async function getClassVideo(): Promise<{
  content: ClassVideoContent;
  updatedAt: Date | null;
}> {
  const row = (
    await db
      .select()
      .from(communicationSupports)
      .where(eq(communicationSupports.kind, CLASS_VIDEO_KIND))
      .limit(1)
  ).at(0);
  return {
    content: parseClassVideoContent(row?.content),
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function saveClassVideo(
  content: ClassVideoContent,
  actor: AuditActor,
): Promise<{ updatedAt: Date }> {
  return db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .insert(communicationSupports)
      .values({
        kind: CLASS_VIDEO_KIND,
        content,
        updatedBy: actor.userId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: communicationSupports.kind,
        set: { content, updatedBy: actor.userId, updatedAt: now },
      });
    await recordAudit(
      actor,
      "communication.video.update",
      "communication_support",
      CLASS_VIDEO_KIND,
      {
        benefits: content.benefits.length,
        members: content.members.length,
        music: content.music.mode,
        photoConsent: content.photoConsent,
      },
      tx,
    );
    return { updatedAt: now };
  });
}

// ---------------------------------------------------------------------------
// Voix de synthèse
// ---------------------------------------------------------------------------

/**
 * `piper` : la voix intégrée, open source, calculée sur le serveur — le choix
 * par défaut, sans clé ni frais. Le nom est historique : il couvre aujourd'hui
 * les voix naturelles (Supertonic) comme les voix légères (Piper). `openai` et `elevenlabs` : des services en
 * ligne, plus expressifs, facturés à l'usage.
 */
export type TtsProvider = "piper" | "openai" | "elevenlabs";

const DEFAULT_PROVIDER: TtsProvider = "piper";

/** Voix par défaut d'OpenAI : chaleureuse, et la plus naturelle en français. */
export const DEFAULT_OPENAI_VOICE = "coral";

export const OPENAI_VOICES = [
  "coral",
  "nova",
  "shimmer",
  "sage",
  "alloy",
  "ash",
  "ballad",
  "echo",
  "fable",
  "onyx",
  "verse",
] as const;

export type TtsSettingsView = {
  provider: TtsProvider;
  keyConfigured: boolean;
  keyLastFour: string | null;
  voice: string | null;
  /** La voix intégrée peut-elle tourner sur ce serveur (module natif présent) ? */
  integratedAvailable: boolean;
  /** Le détail par moteur : un serveur peut faire tourner l'un sans l'autre. */
  integratedEngines: Record<IntegratedEngine, boolean>;
  /** Identité de la voix réglée, gardée avec chaque voix générée. */
  voiceKey: string;
  ready: boolean;
};

async function ttsRecord() {
  return (
    await db
      .select()
      .from(communicationSettings)
      .where(eq(communicationSettings.id, SETTINGS_ID))
      .limit(1)
  ).at(0);
}

export async function getTtsSettings(): Promise<TtsSettingsView> {
  const row = await ttsRecord();
  const provider = (row?.ttsProvider as TtsProvider | null) ?? DEFAULT_PROVIDER;
  const keyConfigured = Boolean(row?.encryptedTtsApiKey);
  const voice =
    provider === "piper"
      ? isIntegratedVoice(row?.ttsVoice ?? null)
        ? (row?.ttsVoice ?? DEFAULT_INTEGRATED_VOICE)
        : DEFAULT_INTEGRATED_VOICE
      : (row?.ttsVoice ?? null);
  const integratedEngines = await integratedEnginesAvailable();
  return {
    provider,
    keyConfigured,
    keyLastFour: row?.ttsApiKeyLastFour ?? null,
    voice,
    integratedAvailable: integratedEngines.supertonic || integratedEngines.piper,
    integratedEngines,
    voiceKey: ttsVoiceKey(provider, voice),
    // ElevenLabs n'a pas de voix française par défaut : il en faut une choisie.
    ready:
      provider === "piper"
        ? integratedEngines[INTEGRATED_VOICES[voice as IntegratedVoiceId].engine]
        : keyConfigured && (provider === "openai" || Boolean(voice)),
  };
}

export async function saveTtsSettings(
  input: {
    provider: TtsProvider;
    /** Nouvelle clé ; absente ou vide, la clé enregistrée est conservée. */
    apiKey?: string | null;
    clearKey?: boolean;
    voice: string | null;
  },
  actor: AuditActor,
): Promise<TtsSettingsView> {
  const current = await ttsRecord();
  let encrypted = current?.encryptedTtsApiKey ?? null;
  let lastFour = current?.ttsApiKeyLastFour ?? null;
  const nouvelleCle = input.apiKey?.trim();
  if (nouvelleCle) {
    encrypted = encryptSecret(nouvelleCle);
    lastFour = nouvelleCle.slice(-4);
  } else if (input.clearKey) {
    encrypted = null;
    lastFour = null;
  }
  // Une clé OpenAI ne vaut rien chez ElevenLabs : changer de service sans en
  // donner une nouvelle, c'est repartir sans clé.
  if (!nouvelleCle && current?.ttsProvider && input.provider !== current.ttsProvider) {
    encrypted = null;
    lastFour = null;
  }
  const voice = input.voice?.trim() || null;
  if (input.provider === "piper" && voice !== null && !isIntegratedVoice(voice)) {
    throw new HttpError(400, "Voix intégrée inconnue.");
  }
  const values = {
    ttsProvider: input.provider,
    encryptedTtsApiKey: encrypted,
    ttsApiKeyLastFour: lastFour,
    ttsVoice: voice,
    updatedBy: actor.userId,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(communicationSettings)
      .values({ id: SETTINGS_ID, ...values })
      .onConflictDoUpdate({ target: communicationSettings.id, set: values });
    await recordAudit(
      actor,
      "communication.tts.update",
      "communication_settings",
      SETTINGS_ID,
      {
        provider: input.provider,
        voice: values.ttsVoice,
        keyChanged: Boolean(nouvelleCle),
        keyCleared: encrypted === null && Boolean(current?.encryptedTtsApiKey),
      },
      tx,
    );
  });
  // Le modèle se télécharge dès maintenant, en arrière-plan : la première voix
  // générée n'aura pas à l'attendre.
  if (input.provider === "piper") {
    const chosen = isIntegratedVoice(voice) ? voice : DEFAULT_INTEGRATED_VOICE;
    void prepareIntegratedVoice(chosen).catch((error: unknown) =>
      console.error("[communication] préparation de la voix intégrée", redactError(error)),
    );
  }
  return getTtsSettings();
}

/**
 * Consigne de jeu donnée à gpt-4o-mini-tts : c'est ce qui fait la différence
 * entre une lecture plate et une voix qui s'adresse vraiment à des parents.
 */
const OPENAI_INSTRUCTIONS =
  "Voix française de France, naturelle, chaleureuse et posée, comme un parent d'élève qui présente l'association des parents à d'autres parents lors d'une réunion de rentrée. Ton sincère et bienveillant, légèrement souriant, intonations naturelles et variées, débit calme, articulation claire, pauses naturelles aux virgules et aux points. Jamais robotique, jamais publicitaire, jamais infantilisant.";

/**
 * Au plus soixante voix par heure et par administrateur chez un service en
 * ligne, où chaque appel est facturé ; deux cents avec la voix intégrée, qui
 * ne coûte que du processeur mais en coûte.
 */
const VOICE_RATE_LIMIT = {
  bucket: "communication:voix",
  limit: 60,
  windowSeconds: 60 * 60,
};
const INTEGRATED_VOICE_RATE_LIMIT = {
  bucket: "communication:voix-integree",
  limit: 200,
  windowSeconds: 60 * 60,
};

async function synthesize(
  provider: Exclude<TtsProvider, "piper">,
  apiKey: string,
  voice: string | null,
  text: string,
): Promise<Buffer> {
  const signal = AbortSignal.timeout(60_000);
  const response =
    provider === "openai"
      ? await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini-tts",
            voice: voice || DEFAULT_OPENAI_VOICE,
            input: text,
            instructions: OPENAI_INSTRUCTIONS,
            response_format: "mp3",
          }),
          signal,
        })
      : await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice ?? "")}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              model_id: "eleven_multilingual_v2",
              voice_settings: {
                stability: 0.4,
                similarity_boost: 0.8,
                style: 0.35,
                use_speaker_boost: true,
              },
            }),
            signal,
          },
        );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      `[communication] voix de synthèse refusée (${provider}, ${response.status})`,
      detail.slice(0, 300),
    );
    if (response.status === 401 || response.status === 403) {
      throw new HttpError(
        502,
        "Le service de voix a refusé la clé d'API. Vérifiez-la dans « Voix off ».",
      );
    }
    if (response.status === 429) {
      throw new HttpError(
        502,
        "Le service de voix limite les appels ou le crédit est épuisé. Réessayez plus tard.",
      );
    }
    if (response.status === 404 || response.status === 422 || response.status === 400) {
      throw new HttpError(
        502,
        "Le service de voix n'a pas accepté la demande : vérifiez la voix choisie.",
      );
    }
    throw new HttpError(502, "Le service de voix n'a pas répondu correctement. Réessayez.");
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Fait lire une phrase par la voix de synthèse et range le fichier parmi les
 * médias. La durée est mesurée par le navigateur, qui sait décoder l'audio.
 */
export async function generateVoiceClip(
  text: string,
  actor: AuditActor,
): Promise<{ url: string; voiceKey: string }> {
  const settings = await ttsRecord();
  const provider = (settings?.ttsProvider as TtsProvider | null) ?? DEFAULT_PROVIDER;

  if (provider === "piper") {
    const verdict = await hitRateLimit(INTEGRATED_VOICE_RATE_LIMIT, actor.userId);
    if (!verdict.ok) {
      throw rateLimitError(verdict, "Trop de voix générées d'un coup. Réessayez dans un moment.");
    }
    const voice = isIntegratedVoice(settings?.ttsVoice ?? null)
      ? (settings?.ttsVoice as IntegratedVoiceId)
      : DEFAULT_INTEGRATED_VOICE;
    const audio = await synthesizeIntegrated(text, voice);
    const saved = await saveUpload(
      "media",
      new File([new Uint8Array(audio)], "voix-off.wav", { type: "audio/wav" }),
    );
    await recordAudit(actor, "communication.voice.generate", "stored_file", saved.id, {
      provider,
      voice,
      characters: text.length,
    });
    return { url: saved.url, voiceKey: ttsVoiceKey(provider, voice) };
  }

  if (!settings?.encryptedTtsApiKey) {
    throw new HttpError(409, "Configurez d'abord la voix off (service et clé d'API).");
  }
  if (provider === "elevenlabs" && !settings.ttsVoice) {
    throw new HttpError(409, "Choisissez une voix ElevenLabs avant de générer.");
  }
  let apiKey: string;
  try {
    apiKey = decryptSecret(settings.encryptedTtsApiKey);
  } catch (error) {
    console.error("[communication] clé de voix illisible", redactError(error));
    throw new HttpError(409, "La clé d'API enregistrée est illisible : saisissez-la à nouveau.");
  }

  const verdict = await hitRateLimit(VOICE_RATE_LIMIT, actor.userId);
  if (!verdict.ok) {
    throw rateLimitError(verdict, "Trop de voix générées d'un coup. Réessayez dans un moment.");
  }

  const audio = await synthesize(provider, apiKey, settings.ttsVoice, text);
  const saved = await saveUpload(
    "media",
    new File([new Uint8Array(audio)], "voix-off.mp3", { type: "audio/mpeg" }),
  );
  await recordAudit(actor, "communication.voice.generate", "stored_file", saved.id, {
    provider,
    characters: text.length,
  });
  return { url: saved.url, voiceKey: ttsVoiceKey(provider, settings.ttsVoice) };
}
