import type {
  ClassVideoPhoto,
  ClassVideoProps,
  ClassVideoScene,
  ClassVideoSceneId,
} from "./types";

/**
 * Découpage temporel de la vidéo. Fonction pure et déterministe : l'éditeur,
 * le Player et l'export dans le navigateur doivent tomber sur exactement la
 * même durée pour les mêmes props.
 */

/** Chevauchement entre deux scènes : la suivante entre par-dessus la précédente. */
export const CLASS_VIDEO_TRANSITION_SECONDS = 0.5;
/** La voix démarre un peu après le début de la scène, une fois la transition passée. */
export const CLASS_VIDEO_VOICE_OFFSET_SECONDS = 0.45;
/** Marge laissée après la voix avant la scène suivante. */
export const CLASS_VIDEO_VOICE_TAIL_SECONDS = 0.8;

/** Durée d'un élément de « bienfaits » (photo ou temps fort). */
export const BIENFAITS_ITEM_SECONDS = 2.8;
/** Le titre de « bienfaits » occupe l'écran seul avant la première photo. */
export const BIENFAITS_INTRO_SECONDS = 1.3;
const BIENFAITS_MIN_SECONDS = 5;
const BIENFAITS_MAX_SECONDS = 25;
/** En dessous de ce nombre de photos, les temps forts complètent la scène. */
export const BIENFAITS_MIN_PHOTOS = 3;

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
 * Éléments joués dans « bienfaits » : les photos d'abord, puis, s'il y a
 * moins de trois photos, les temps forts. La liste est tronquée pour tenir
 * dans la durée maximale de la scène.
 */
export function getBienfaitsItems(props: Pick<ClassVideoProps, "benefits" | "highlights">): BienfaitsItem[] {
  const photos: BienfaitsItem[] = props.benefits
    .filter((photo) => photo.url)
    .map((photo) => ({ kind: "photo", photo }));
  const highlights: BienfaitsItem[] =
    photos.length < BIENFAITS_MIN_PHOTOS
      ? props.highlights
          .map((text) => text.trim())
          .filter(Boolean)
          .map((text) => ({ kind: "highlight", text }))
      : [];
  const maxItems = Math.floor((BIENFAITS_MAX_SECONDS - BIENFAITS_INTRO_SECONDS) / BIENFAITS_ITEM_SECONDS);
  return [...photos, ...highlights].slice(0, maxItems);
}

/** Durée minimale (en secondes) d'une scène, avant prise en compte de la voix. */
export function sceneMinimumSeconds(id: ClassVideoSceneId, props: ClassVideoProps): number {
  switch (id) {
    case "intro":
      return 4.2;
    case "apel":
      return 5;
    case "vie":
    case "sourire":
    case "souvenirs":
    case "rassembler":
      return 3.6;
    case "bienfaits": {
      const count = getBienfaitsItems(props).length;
      const seconds = BIENFAITS_INTRO_SECONDS + count * BIENFAITS_ITEM_SECONDS + 0.4;
      return Math.min(BIENFAITS_MAX_SECONDS, Math.max(BIENFAITS_MIN_SECONDS, seconds));
    }
    case "chiffres":
      return 6;
    case "membres": {
      const count = Math.min(props.members.length, MEMBRES_MAX);
      return Math.min(10, Math.max(5, 3.4 + count * 0.55));
    }
    case "fin":
      return 6;
  }
}

export function sceneDurationInFrames(scene: ClassVideoScene, props: ClassVideoProps, fps: number): number {
  const voiceSeconds = scene.voice
    ? CLASS_VIDEO_VOICE_OFFSET_SECONDS + Math.max(0, scene.voice.durationInSeconds) + CLASS_VIDEO_VOICE_TAIL_SECONDS
    : 0;
  return Math.ceil(Math.max(sceneMinimumSeconds(scene.id, props), voiceSeconds) * fps);
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
