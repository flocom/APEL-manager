import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import type { SceneTheme } from "../theme";
import type { ClassVideoProps, ClassVideoScene } from "../types";
import { FloatingShapes } from "./decor";

/** Props communes à toutes les scènes. */
export type SceneProps = {
  scene: ClassVideoScene;
  video: ClassVideoProps;
  /** Durée de la scène (images), transition de sortie comprise. */
  durationInFrames: number;
  /** Position de la scène dans la vidéo (sert de graine au décor). */
  index: number;
};

/** Fond dégradé + formes flottantes. */
export const SceneBackdrop: React.FC<{
  theme: SceneTheme;
  seed: number;
  shapeCount?: number;
  children?: React.ReactNode;
}> = ({ theme, seed, shapeCount = 14, children }) => (
  <AbsoluteFill style={{ background: theme.gradient, overflow: "hidden" }}>
    <FloatingShapes colors={theme.shapes} seed={seed} count={shapeCount} opacity={0.75} />
    {children}
  </AbsoluteFill>
);

/**
 * Bruitage ponctuel. Sans URL (bruitages désactivés), ne rend rien.
 * `at` est relatif à la scène.
 */
export const Sfx: React.FC<{ src: string | null | undefined; at: number; volume?: number }> = ({
  src,
  at,
  volume = 0.5,
}) => {
  const { fps } = useVideoConfig();
  if (!src) return null;
  return (
    <Sequence from={Math.max(0, Math.round(at))} durationInFrames={Math.round(fps * 1.6)} layout="none" name="Bruitage">
      <Audio src={src} volume={volume} />
    </Sequence>
  );
};

export type TransitionKind = "circle" | "slide" | "wipe" | "drop";
export const TRANSITION_ORDER: TransitionKind[] = ["circle", "slide", "drop", "wipe"];

/**
 * Enveloppe d'une scène : entrée par-dessus la scène précédente (cercle qui
 * s'ouvre, glissé avec un ruban coloré, chute rebondie, balayage oblique) et
 * léger recul pendant que la suivante arrive.
 */
export const SceneLayer: React.FC<{
  kind: TransitionKind | null;
  transitionFrames: number;
  durationInFrames: number;
  exits: boolean;
  bandColor: string;
  children: React.ReactNode;
}> = ({ kind, transitionFrames, durationInFrames, exits, bandColor, children }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = interpolate(frame, [0, transitionFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const exitT = exits
    ? interpolate(frame, [durationInFrames - transitionFrames, durationInFrames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.in(Easing.cubic),
      })
    : 0;
  const exitStyle: React.CSSProperties =
    exitT > 0 ? { transform: `scale(${1 - 0.08 * exitT})`, transformOrigin: "50% 50%" } : {};

  if (!kind || t >= 1) {
    return <AbsoluteFill style={exitStyle}>{children}</AbsoluteFill>;
  }

  if (kind === "circle") {
    const radius = Math.hypot(width, height) * 0.62 * t;
    return (
      <AbsoluteFill style={{ clipPath: `circle(${radius.toFixed(1)}px at ${width * 0.5}px ${height * 0.55}px)` }}>
        {children}
      </AbsoluteFill>
    );
  }

  if (kind === "slide") {
    // Le ruban coloré passe devant, la scène le suit.
    const band = interpolate(frame, [0, transitionFrames * 0.75], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ background: bandColor, transform: `translateX(${band * 100}%)` }} />
        <AbsoluteFill style={{ transform: `translateX(${(1 - t) * 100}%)` }}>{children}</AbsoluteFill>
      </AbsoluteFill>
    );
  }

  if (kind === "drop") {
    const s = spring({ frame, fps, durationInFrames: transitionFrames, config: { damping: 14, stiffness: 120 } });
    return <AbsoluteFill style={{ transform: `translateY(${(1 - s) * -100}%)` }}>{children}</AbsoluteFill>;
  }

  // Balayage oblique.
  const edge = -35 + t * 170;
  return (
    <AbsoluteFill
      style={{
        clipPath: `polygon(0% 0%, ${edge.toFixed(1)}% 0%, ${(edge - 35).toFixed(1)}% 100%, 0% 100%)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
