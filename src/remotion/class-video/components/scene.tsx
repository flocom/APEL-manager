import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import type { SceneTheme } from "../theme";
import type { ClassVideoProps, ClassVideoScene } from "../types";
import { glide } from "./motion";

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
 * Fond de scène : aplat, grande forme douce derrière l'illustration et sol
 * sous les personnages. Rien ne bouge beaucoup : la forme respire à peine.
 */
export const SceneBackdrop: React.FC<{
  theme: SceneTheme;
  /** Grande forme douce (cercle) : centre et rayon en px. */
  blob?: { x: number; y: number; r: number };
  /** Ordonnée (px) où commence le sol ; sans valeur, pas de sol. */
  floorY?: number;
  children?: React.ReactNode;
}> = ({ theme, blob, floorY, children }) => {
  const frame = useCurrentFrame();
  const blobIn = glide(frame, 0, 40);
  return (
    <AbsoluteFill style={{ background: theme.bg, overflow: "hidden" }}>
      {blob ? (
        <div
          style={{
            position: "absolute",
            left: blob.x - blob.r,
            top: blob.y - blob.r,
            width: blob.r * 2,
            height: blob.r * 2,
            borderRadius: "50%",
            background: theme.soft,
            transform: `scale(${0.85 + 0.15 * blobIn})`,
            opacity: blobIn,
          }}
        />
      ) : null}
      {floorY !== undefined ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: floorY, bottom: 0, background: theme.floor }} />
      ) : null}
      {children}
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

export type TransitionKind = "fade" | "wipe";
export const TRANSITION_ORDER: TransitionKind[] = ["fade", "wipe"];

/**
 * Enveloppe d'une scène : entrée par-dessus la précédente, en fondu enchaîné
 * (léger glissé) ou en volet net depuis la droite pour les scènes en couleur
 * pleine. La scène qui part glisse à peine vers la gauche.
 */
export const SceneLayer: React.FC<{
  kind: TransitionKind | null;
  transitionFrames: number;
  durationInFrames: number;
  exits: boolean;
  children: React.ReactNode;
}> = ({ kind, transitionFrames, durationInFrames, exits, children }) => {
  const frame = useCurrentFrame();
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
  const exitStyle: React.CSSProperties = exitT > 0 ? { transform: `translateX(${-40 * exitT}px)` } : {};

  if (!kind || t >= 1) {
    return <AbsoluteFill style={exitStyle}>{children}</AbsoluteFill>;
  }

  if (kind === "fade") {
    return (
      <AbsoluteFill style={{ opacity: t }}>
        <AbsoluteFill style={{ transform: `translateX(${(1 - t) * 50}px)` }}>{children}</AbsoluteFill>
      </AbsoluteFill>
    );
  }

  const edge = (1 - t) * 100;
  return (
    <AbsoluteFill style={{ clipPath: `polygon(${edge.toFixed(2)}% 0%, 100% 0%, 100% 100%, ${edge.toFixed(2)}% 100%)` }}>
      <AbsoluteFill style={{ transform: `translateX(${(1 - t) * 160}px)` }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};
