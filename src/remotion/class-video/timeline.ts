import type {
  ClassVideoPhoto,
  ClassVideoProps,
  ClassVideoScene,
  ClassVideoSceneId,
} from "./types";
import { DEFAULT_MUSIC_BPM } from "./audio-synth";

/**
 * Découpage temporel de la vidéo. Fonction pure et déterministe : l'éditeur,
 * le Player et l'export dans le navigateur doivent tomber sur exactement la
 * même durée pour les mêmes props.
 */

/**
 * Rythme enlevé : la vidéo doit accrocher les parents dès les premières
 * secondes. Les durées minimales ci-dessous cèdent la place à la voix off
 * quand elle est plus longue, et chaque changement de scène tombe sur un
 * temps de la musique générée (DEFAULT_MUSIC_BPM).
 */

/** Chevauchement entre deux scènes (un temps à 120 bpm) : la suivante entre par-dessus la précédente. */
export const CLASS_VIDEO_TRANSITION_SECONDS = 0.5;
/** La voix démarre un peu après le début de la scène, une fois la transition passée. */
export const CLASS_VIDEO_VOICE_OFFSET_SECONDS = 0.5;
/** Marge laissée après la voix avant la scène suivante. */
export const CLASS_VIDEO_VOICE_TAIL_SECONDS = 0.6;

/** Durée d'une photo de « bienfaits » (coupes franches, pas de fondu lent). */
export const BIENFAITS_ITEM_SECONDS = 2.2;
/** Le titre de « bienfaits » occupe l'écran seul avant le premier élément. */
export const BIENFAITS_INTRO_SECONDS = 1;
/** Les temps forts arrivent en cartes, une toutes les… */
export const BIENFAITS_CARD_STAGGER_SECONDS = 0.35;
/** …puis restent affichés ensemble le temps de les lire. */
export const BIENFAITS_CARDS_HOLD_SECONDS = 2.4;
const BIENFAITS_MIN_SECONDS = 4;
const BIENFAITS_MAX_SECONDS = 22;
/** En dessous de ce nombre de photos, les temps forts complètent la scène. */
export const BIENFAITS_MIN_PHOTOS = 3;
const BIENFAITS_MAX_PHOTOS = 7;
/** Nombre maximal de cartes illustrées (une rangée). */
export const BIENFAITS_MAX_CARDS = 4;

/** Nombre maximal de rendez-vous suivants montrés dans « agenda ». */
export const AGENDA_MAX_UPCOMING = 4;

/** Nombre maximal de chiffres et de membres réellement montrés. */
export const CHIFFRES_MAX = 3;
export const MEMBRES_MAX = 12;

export type ClassVideoTimelineEntry = {
  id: ClassVideoSceneId;
  from: number;
  durationInFrames: number;
};

export type ClassVideoTimeline = {
  scenes: ClassVideoTimelineEntry[];
  durationInFrames: number;
};

export type BienfaitsItem =
  | { kind: "photo"; photo: ClassVideoPhoto }
  | { kind: "highlight"; text: string };

/**
 * Éléments joués dans « bienfaits » : les photos d'abord (une par écran),
 * puis, s'il y a moins de trois photos, les temps forts (réunis en cartes
 * sur un même écran).
 */
export function getBienfaitsItems(props: Pick<ClassVideoProps, "benefits" | "highlights">): BienfaitsItem[] {
  const photos: BienfaitsItem[] = props.benefits
    .filter((photo) => photo.url)
    .slice(0, BIENFAITS_MAX_PHOTOS)
    .map((photo) => ({ kind: "photo", photo }));
  const highlights: BienfaitsItem[] =
    photos.length < BIENFAITS_MIN_PHOTOS
      ? props.highlights
          .map((text) => text.trim())
          .filter(Boolean)
          .slice(0, BIENFAITS_MAX_CARDS)
          .map((text) => ({ kind: "highlight", text }))
      : [];
  return [...photos, ...highlights];
}

/**
 * Découpage de « bienfaits » en secondes : début de chaque photo, puis de
 * l'écran des cartes (et l'écart entre deux cartes).
 */
export function bienfaitsSchedule(items: BienfaitsItem[]): {
  photoStarts: number[];
  cardsStart: number | null;
  cardCount: number;
  end: number;
} {
  const photoStarts: number[] = [];
  let cursor = BIENFAITS_INTRO_SECONDS;
  for (const item of items) {
    if (item.kind !== "photo") continue;
    photoStarts.push(cursor);
    cursor += BIENFAITS_ITEM_SECONDS;
  }
  const cardCount = items.filter((item) => item.kind === "highlight").length;
  const cardsStart = cardCount > 0 ? cursor : null;
  if (cardCount > 0) cursor += 0.3 + cardCount * BIENFAITS_CARD_STAGGER_SECONDS + BIENFAITS_CARDS_HOLD_SECONDS;
  return { photoStarts, cardsStart, cardCount, end: cursor + 0.2 };
}

/** Durée minimale (en secondes) d'une scène, avant prise en compte de la voix. */
export function sceneMinimumSeconds(id: ClassVideoSceneId, props: ClassVideoProps): number {
  switch (id) {
    case "intro":
      return 4.8;
    case "apel":
      return 3.4;
    case "agenda":
      return 4.4 + Math.min(props.agenda.upcoming.length, AGENDA_MAX_UPCOMING) * 0.25;
    case "site":
      return 4.4;
    case "benevolat":
      return 4;
    case "bienfaits": {
      const { end } = bienfaitsSchedule(getBienfaitsItems(props));
      return Math.min(BIENFAITS_MAX_SECONDS, Math.max(BIENFAITS_MIN_SECONDS, end));
    }
    case "lien":
      return 4.2;
    case "membre":
      return 4.2;
    case "chiffres":
      return 3.6 + Math.min(props.figures.length, CHIFFRES_MAX) * 0.3;
    case "membres": {
      const count = Math.min(props.members.length, MEMBRES_MAX);
      return Math.min(8, Math.max(3.6, 2.8 + count * 0.35));
    }
    case "fin":
      return 8;
  }
}

/** Nombre d'images d'un temps de la musique générée. */
export const beatFrames = (fps: number) => Math.max(1, Math.round((60 / DEFAULT_MUSIC_BPM) * fps));

export function sceneDurationInFrames(scene: ClassVideoScene, props: ClassVideoProps, fps: number): number {
  const voiceSeconds = scene.voice
    ? CLASS_VIDEO_VOICE_OFFSET_SECONDS + Math.max(0, scene.voice.durationInSeconds) + CLASS_VIDEO_VOICE_TAIL_SECONDS
    : 0;
  const raw = Math.ceil(Math.max(sceneMinimumSeconds(scene.id, props), voiceSeconds) * fps);
  // Arrondi au temps supérieur : la scène suivante démarre (from + durée −
  // chevauchement) pile sur un temps. On n'arrondit jamais vers le bas, la
  // voix garde toujours la place dont elle a besoin.
  const overlap = transitionFrames(fps);
  const beat = beatFrames(fps);
  return Math.ceil(Math.max(1, raw - overlap) / beat) * beat + overlap;
}

export const transitionFrames = (fps: number) => Math.round(CLASS_VIDEO_TRANSITION_SECONDS * fps);
export const voiceOffsetFrames = (fps: number) => Math.round(CLASS_VIDEO_VOICE_OFFSET_SECONDS * fps);

export function computeClassVideoTimeline(props: ClassVideoProps, fps: number): ClassVideoTimeline {
  const overlap = transitionFrames(fps);
  const scenes: ClassVideoTimelineEntry[] = [];
  let cursor = 0;
  for (const scene of props.scenes) {
    const durationInFrames = sceneDurationInFrames(scene, props, fps);
    // Chaque scène (sauf la première) commence pendant la fin de la précédente.
    const from = scenes.length === 0 ? 0 : Math.max(0, cursor - overlap);
    scenes.push({ id: scene.id, from, durationInFrames });
    cursor = from + durationInFrames;
  }
  // Une composition Remotion doit durer au moins une image.
  return { scenes, durationInFrames: Math.max(1, cursor) };
}
