import { Easing, interpolate, spring } from "remotion";

/**
 * Petites courbes d'animation partagées. Tout dépend uniquement de l'image
 * courante : la vidéo reste identique entre le Player et l'export.
 *
 * Ton posé (public adulte) : sorties en douceur (cubique, quintique) et
 * ressorts très amortis, sans rebond marqué.
 */

/** Entrée douce en ressort amorti (0 → 1, dépassement à peine perceptible). */
export function pop(frame: number, fps: number, delay = 0, stiffness = 120, damping = 18): number {
  return spring({ frame: frame - delay, fps, config: { stiffness, damping, mass: 1 } });
}

/** Entrée douce, sans rebond. */
export function ease(frame: number, fps: number, delay = 0, durationInFrames = 18): number {
  return spring({ frame: frame - delay, fps, durationInFrames, config: { damping: 200 } });
}

/** Interpolation bornée, ramenée à 0…1. */
export function progress(frame: number, start: number, end: number, easing = Easing.inOut(Easing.cubic)): number {
  return interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
}

/** Entrée « sortie en douceur » (cubique) sur `duration` images à partir de `delay`. */
export function enter(frame: number, delay: number, duration = 20): number {
  return progress(frame, delay, delay + duration, Easing.out(Easing.cubic));
}

/** Variante plus longue et plus feutrée (quintique), pour les grands éléments. */
export function glide(frame: number, delay: number, duration = 30): number {
  return progress(frame, delay, delay + duration, Easing.bezier(0.22, 1, 0.36, 1));
}

/** Oscillation continue (sinus), en unités de sortie. */
export function bob(frame: number, fps: number, amplitude: number, periodSeconds: number, phase = 0): number {
  return Math.sin(((frame / fps) * 2 * Math.PI) / periodSeconds + phase) * amplitude;
}

/** Générateur pseudo-aléatoire reproductible (mêmes formes à chaque rendu). */
export function seeded(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
