/**
 * Catalogue des voix intégrées (Piper, open source), partagé entre le serveur
 * qui les calcule et l'écran qui les propose.
 *
 * La voix « tom » du catalogue Piper est écartée : son jeu de données est sous
 * AGPL, une licence qui ne convient pas à une voix intégrée à l'application.
 */
export const INTEGRATED_VOICES = {
  jessica: {
    label: "Jessica — voix féminine",
    model: "upmc",
    speaker: 0,
    credit: "UPMC (Université Pierre-et-Marie-Curie), CC-BY-SA 4.0",
  },
  pierre: {
    label: "Pierre — voix masculine",
    model: "upmc",
    speaker: 1,
    credit: "UPMC (Université Pierre-et-Marie-Curie), CC-BY-SA 4.0",
  },
  siwis: {
    label: "Siwis — voix féminine",
    model: "siwis",
    speaker: 0,
    credit: "SIWIS French Speech Synthesis Database, CC-BY 4.0",
  },
} as const satisfies Record<
  string,
  { label: string; model: "siwis" | "upmc"; speaker: number; credit: string }
>;

export type IntegratedVoiceId = keyof typeof INTEGRATED_VOICES;

export const DEFAULT_INTEGRATED_VOICE: IntegratedVoiceId = "jessica";

export function isIntegratedVoice(value: string | null): value is IntegratedVoiceId {
  return value !== null && Object.hasOwn(INTEGRATED_VOICES, value);
}
