import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import type { SceneTheme } from "../theme";
import type { ClassVideoProps, ClassVideoScene } from "../types";
import { Camera, EXPO_IN_OUT, Glow, Particles, QUINT_OUT, Vignette } from "./finish";
import { snap } from "./motion";

/** Props communes à toutes les scènes. */
export type SceneProps = {
  scene: ClassVideoScene;
  video: ClassVideoProps;
  /** Durée de la scène (images), transition de sortie comprise. */
  durationInFrames: number;
  /** Position de la scène dans la vidéo. */
  index: number;
};

/**
 * Fond de scène : dégradé étalonné (plus clair en haut à gauche, plus dense
 * en bas à droite), halo de lumière douce derrière l'illustration, sol sous
 * les personnages et quelques particules. Le fond est un plan lointain :
 * la caméra y avance moins vite que sur l'illustration.
 */
export const SceneBackdrop: React.FC<{
  theme: SceneTheme;
  /** Halo doux derrière l'illustration : centre et rayon en px. */
  blob?: { x: number; y: number; r: number };
  /** Ordonnée (px) où commence le sol ; sans valeur, pas de sol. */
  floorY?: number;
  /** Durée de la scène (images), pour le mouvement de caméra du fond. */
  durationInFrames?: number;
  children?: React.ReactNode;
}> = ({ theme, blob, floorY, durationInFrames = 150, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ringIn = Math.max(0, snap(frame, fps, 4, 160, 22));
  return (
    <AbsoluteFill style={{ background: theme.gradient, overflow: "hidden" }}>
      <Camera depth={0.4} durationInFrames={durationInFrames}>
        {blob ? (
          <>
            <Glow x={blob.x} y={blob.y} r={blob.r * 1.35} color={theme.glow} strength={theme.bold ? 0.5 : 0.7} />
            <div
              style={{
                position: "absolute",
                left: blob.x - blob.r,
                top: blob.y - blob.r,
                width: blob.r * 2,
                height: blob.r * 2,
                borderRadius: "50%",
                border: `2px solid ${theme.line}`,
                boxSizing: "border-box",
                transform: `scale(${ringIn})`,
              }}
            />
          </>
        ) : null}
        {floorY !== undefined ? (
          <div
            style={{
              position: "absolute",
              left: -80,
              right: -80,
              top: floorY,
              bottom: -80,
              background: `linear-gradient(180deg, ${theme.floor} 0%, ${theme.floorDeep} 100%)`,
            }}
          />
        ) : null}
        <Particles color={theme.particle} seed={Math.round(theme.bg.length * 7 + (floorY ?? 3))} count={9} />
      </Camera>
      {children}
      <Vignette strength={theme.bold ? 0.16 : 0.045} />
    </AbsoluteFill>
  );
};

/**
 * Bruitage ponctuel. Sans URL (bruitages désactivés), ne rend rien.
 * `at` est relatif à la scène.
 */
export const Sfx: React.FC<{ src: string | null | undefined; at: number; volume?: number }> = ({ src, at, volume = 0.3 }) => {
  const { fps } = useVideoConfig();
  if (!src) return null;
  return (
    <Sequence from={Math.max(0, Math.round(at))} durationInFrames={Math.round(fps * 2)} layout="none" name="Bruitage">
      <Audio src={src} volume={volume} />
    </Sequence>
  );
};

export type TransitionKind = "panel" | "slide" | "zoom" | "circle";
/** Enchaînement des transitions, dans l'ordre des scènes. */
export const TRANSITION_ORDER: TransitionKind[] = ["panel", "circle", "slide", "panel", "zoom", "slide", "circle", "panel", "zoom"];

/**
 * Enveloppe d'une scène : entrée soignée par-dessus la précédente — trois
 * bandes de couleur décalées qui balaient l'écran en diagonale, poussée
 * latérale, zoom « à travers » ou cercle qui s'ouvre avec un liseré — et
 * sortie assortie à l'entrée de la scène suivante. Courbes expo / quint.
 */
export const SceneLayer: React.FC<{
  kind: TransitionKind | null;
  nextKind: TransitionKind | null;
  transitionFrames: number;
  durationInFrames: number;
  /** Couleurs des bandes du balayage « panel » (de la première à la dernière). */
  panelColors: string[];
  children: React.ReactNode;
}> = ({ kind, nextKind, transitionFrames, durationInFrames, panelColors, children }) => {
  const frame = useCurrentFrame();
  const T = transitionFrames;
  const ease = (from: number, to: number, curve = EXPO_IN_OUT) =>
    interpolate(frame, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: curve });
  const exitT = nextKind
    ? interpolate(frame, [durationInFrames - T, durationInFrames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.in(Easing.cubic),
      })
    : 0;
  const exitTransform =
    exitT <= 0
      ? undefined
      : nextKind === "slide"
        ? `translateX(${-35 * exitT}%)`
        : nextKind === "zoom"
          ? `scale(${1 + 0.35 * exitT})`
          : nextKind === "panel"
            ? `translateX(${-8 * exitT}%)`
            : `scale(${1 - 0.08 * exitT})`;
  const body = <AbsoluteFill style={exitTransform ? { transform: exitTransform } : undefined}>{children}</AbsoluteFill>;

  if (!kind || frame >= T) return body;
  const f = (v: number) => v.toFixed(2);

  if (kind === "panel") {
    const skew = 14;
    const band = 36;
    const bands = panelColors.slice(0, 3).map((color, i) => {
      const p = ease(i * 1.5, T - (2 - i) * 1.5);
      const lead = 118 - 190 * p;
      return { color, lead, trail: lead + band };
    });
    const last = bands[bands.length - 1];
    const edge = last ? last.trail : -100;
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ clipPath: `polygon(${f(edge + skew)}% 0%, 100% 0%, 100% 100%, ${f(edge)}% 100%)` }}>{body}</AbsoluteFill>
        {bands
          .slice()
          .reverse()
          .map((b, i) => (
            <AbsoluteFill
              key={i}
              style={{ background: b.color, clipPath: `polygon(${f(b.lead + skew)}% 0%, ${f(b.trail + skew)}% 0%, ${f(b.trail)}% 100%, ${f(b.lead)}% 100%)` }}
            />
          ))}
      </AbsoluteFill>
    );
  }

  if (kind === "slide") {
    const q = ease(0, T);
    return <AbsoluteFill style={{ transform: `translateX(${f((1 - q) * 100)}%)` }}>{body}</AbsoluteFill>;
  }

  if (kind === "zoom") {
    const q = ease(0, T, QUINT_OUT);
    return <AbsoluteFill style={{ opacity: Math.min(1, q * 2.4), transform: `scale(${1.3 - 0.3 * q})` }}>{body}</AbsoluteFill>;
  }

  // Cercle qui s'ouvre depuis la droite de l'image, précédé d'un liseré de couleur.
  const q = ease(0, T);
  const radius = 2300 * q;
  const ring = panelColors[0] ?? "#ffffff";
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `circle(${f(radius)}px at 70% 50%)` }}>
        <AbsoluteFill style={{ transform: `scale(${1.12 - 0.12 * q})` }}>{body}</AbsoluteFill>
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 1344 - radius - 14,
          top: 540 - radius - 14,
          width: (radius + 14) * 2,
          height: (radius + 14) * 2,
          borderRadius: "50%",
          border: `28px solid ${ring}`,
          boxSizing: "border-box",
          opacity: radius < 40 ? 0 : 1 - q * 0.6,
        }}
      />
    </AbsoluteFill>
  );
};
