/**
 * Catalogue des voix intégrées, partagé entre le serveur qui les calcule et
 * l'écran qui les propose. Deux moteurs, tous deux open source et calculés sur
 * le processeur du serveur :
 *
 * - `supertonic` : Supertonic 3 (Supertone), des voix naturelles, à
 *   l'intonation vivante — le choix par défaut ;
 * - `piper` : les voix Piper, plus plates mais très légères (un modèle de 80 à
 *   90 Mo, une seconde par phrase), gardées pour les petits serveurs.
 *
 * La voix « tom » du catalogue Piper est écartée : son jeu de données est sous
 * AGPL, une licence qui ne convient pas à une voix intégrée à l'application.
 */

const SUPERTONIC_CREDIT = "Supertonic 3 (Supertone Inc.), licence OpenRAIL-M";
const UPMC_CREDIT = "UPMC (Université Pierre-et-Marie-Curie), CC-BY-SA 4.0";

export type SupertonicStyle = "F1" | "F3" | "M3" | "M4";

type SupertonicVoice = {
  label: string;
  engine: "supertonic";
  style: SupertonicStyle;
  credit: string;
};

type PiperVoice = {
  label: string;
  engine: "piper";
  model: "siwis" | "upmc";
  speaker: number;
  credit: string;
};

export const INTEGRATED_VOICES = {
  camille: {
    label: "Camille — voix féminine chaleureuse",
    engine: "supertonic",
    style: "F1",
    credit: SUPERTONIC_CREDIT,
  },
  claire: {
    label: "Claire — voix féminine posée",
    engine: "supertonic",
    style: "F3",
    credit: SUPERTONIC_CREDIT,
  },
  julien: {
    label: "Julien — voix masculine",
    engine: "supertonic",
    style: "M3",
    credit: SUPERTONIC_CREDIT,
  },
  thomas: {
    label: "Thomas — voix masculine grave",
    engine: "supertonic",
    style: "M4",
    credit: SUPERTONIC_CREDIT,
  },
  jessica: {
    label: "Jessica — voix féminine",
    engine: "piper",
    model: "upmc",
    speaker: 0,
    credit: UPMC_CREDIT,
  },
  pierre: {
    label: "Pierre — voix masculine",
    engine: "piper",
    model: "upmc",
    speaker: 1,
    credit: UPMC_CREDIT,
  },
  siwis: {
    label: "Siwis — voix féminine",
    engine: "piper",
    model: "siwis",
    speaker: 0,
    credit: "SIWIS French Speech Synthesis Database, CC-BY 4.0",
  },
} as const satisfies Record<string, SupertonicVoice | PiperVoice>;

export type IntegratedVoiceId = keyof typeof INTEGRATED_VOICES;

export type IntegratedEngine = (typeof INTEGRATED_VOICES)[IntegratedVoiceId]["engine"];

export const DEFAULT_INTEGRATED_VOICE: IntegratedVoiceId = "camille";

/** Libellés des groupes de voix, dans l'ordre où l'écran les présente. */
export const INTEGRATED_ENGINES: Record<IntegratedEngine, string> = {
  supertonic: "Voix naturelles",
  piper: "Voix légères",
};

export function isIntegratedVoice(value: string | null): value is IntegratedVoiceId {
  return value !== null && Object.hasOwn(INTEGRATED_VOICES, value);
}

/**
 * Identité de la voix de synthèse réglée (service et voix). Gardée avec chaque
 * voix générée : quand le bureau change de voix, l'écran sait lesquelles ont
 * été lues par l'ancienne et propose de les régénérer.
 */
export function ttsVoiceKey(provider: string, voice: string | null): string {
  return `${provider}:${voice ?? ""}`;
}
