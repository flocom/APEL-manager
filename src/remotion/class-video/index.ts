/**
 * API publique de la vidéo présentée aux classes : composition Remotion,
 * découpage temporel, synthèse de la musique et des bruitages, couleurs.
 */
export { ClassVideo, calculateClassVideoMetadata } from "./ClassVideo";
export {
  computeClassVideoTimeline,
  getBienfaitsItems,
  sceneDurationInFrames,
  sceneMinimumSeconds,
  CLASS_VIDEO_TRANSITION_SECONDS,
  CLASS_VIDEO_VOICE_OFFSET_SECONDS,
  CLASS_VIDEO_VOICE_TAIL_SECONDS,
  type BienfaitsItem,
  type ClassVideoTimeline,
  type ClassVideoTimelineEntry,
} from "./timeline";
export { renderMusicWav, renderSfxWav, wavToBlobUrl, encodeWav, SYNTH_SAMPLE_RATE, type MusicOptions, type SfxKind } from "./audio-synth";
export { readableOn, contrastRatio, relativeLuminance, mix, lighten, darken, withAlpha } from "./colors";
export * from "./types";
