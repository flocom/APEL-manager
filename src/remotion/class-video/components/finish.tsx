import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { withAlpha } from "../colors";
import { seeded } from "./motion";

/**
 * Finitions « motion design » : profondeur (caméra qui avance, parallaxe),
 * lumière douce, reflet qui balaie les cartes, particules discrètes,
 * vignettage et grain. Uniquement des aplats, des dégradés linéaires, des
 * transformations et un canevas figé : compatibles avec le rendu web.
 */

/** Courbes maison : expo et quint, entrée-sortie. */
export const EXPO_IN_OUT = Easing.bezier(0.87, 0, 0.13, 1);
export const QUINT_OUT = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * Plan de profondeur : la « caméra » avance lentement pendant toute la
 * scène et dérive un peu ; un plan lointain (depth petit) bouge moins qu'un
 * plan proche. Point de fuite au centre de l'image.
 */
export const Camera: React.FC<{ depth: number; durationInFrames: number; children: React.ReactNode; drift?: number }> = ({
  depth,
  durationInFrames,
  children,
  drift = 1,
}) => {
  const frame = useCurrentFrame();
  const k = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = 1 + 0.045 * depth * k;
  const dx = -26 * depth * k * drift;
  return (
    <AbsoluteFill style={{ transformOrigin: "50% 55%", transform: `translateX(${dx.toFixed(2)}px) scale(${scale.toFixed(4)})` }}>
      {children}
    </AbsoluteFill>
  );
};

/**
 * Halo de lumière douce, fait de disques concentriques translucides (les
 * dégradés radiaux et le flou sur les formes ne passent pas au rendu web).
 */
export const Glow: React.FC<{ x: number; y: number; r: number; color: string; strength?: number; delay?: number }> = ({
  x,
  y,
  r,
  color,
  strength = 0.5,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: QUINT_OUT });
  const rings = 5;
  return (
    <>
      {Array.from({ length: rings }, (_, i) => {
        const rr = r * (1 - i / (rings + 1)) * (0.7 + 0.3 * p);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - rr,
              top: y - rr,
              width: rr * 2,
              height: rr * 2,
              borderRadius: "50%",
              background: withAlpha(color, (strength / rings) * p),
            }}
          />
        );
      })}
    </>
  );
};

/**
 * Reflet qui balaie une carte (le parent doit être en position relative et
 * `overflow: hidden`). Passe une fois à `at`, puis éventuellement à nouveau
 * toutes les `every` images.
 */
export const Sheen: React.FC<{ at: number; every?: number; width?: number; opacity?: number }> = ({ at, every, width = 160, opacity = 0.55 }) => {
  const frame = useCurrentFrame();
  const local = every && frame > at ? (frame - at) % every : frame - at;
  const p = interpolate(local, [0, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  if (local < 0 || p >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: "-40%",
        bottom: "-40%",
        left: `${-30 + p * 160}%`,
        width,
        transform: "rotate(18deg)",
        background: `linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,${opacity}) 50%, rgba(255,255,255,0) 100%)`,
        pointerEvents: "none",
      }}
    />
  );
};

/** Quelques particules fines (points et tirets) qui dérivent lentement vers le haut. */
export const Particles: React.FC<{ color: string; seed: number; count?: number; area?: { x: number; y: number; w: number; h: number } }> = ({
  color,
  seed,
  count = 14,
  area = { x: 0, y: 0, w: 1920, h: 1080 },
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rand = seeded(seed);
  const t = frame / fps;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const x0 = area.x + rand() * area.w;
        const y0 = area.y + rand() * area.h;
        const speed = 10 + rand() * 18;
        const size = 4 + rand() * 7;
        const dash = rand() < 0.35;
        const phase = rand() * 6.28;
        const y = area.y + ((((y0 - area.y - t * speed) % area.h) + area.h) % area.h);
        const x = x0 + Math.sin(t * 0.6 + phase) * 14;
        const fade = Math.min(1, frame / 12) * (0.35 + 0.35 * Math.sin(t * 1.3 + phase) ** 2);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: dash ? size * 3 : size,
              height: size * (dash ? 0.5 : 1),
              borderRadius: size,
              background: color,
              opacity: fade,
              transform: dash ? `rotate(${-30 + phase * 10}deg)` : undefined,
            }}
          />
        );
      })}
    </>
  );
};

/** Vignettage doux par dégradés linéaires sur les quatre bords. */
export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.2 }) => {
  const edge = (dir: string, size: string, pos: React.CSSProperties) => (
    <div
      style={{
        position: "absolute",
        ...pos,
        [dir === "to bottom" || dir === "to top" ? "height" : "width"]: size,
        background: `linear-gradient(${dir}, rgba(8, 12, 20, ${strength}), rgba(8, 12, 20, 0))`,
        pointerEvents: "none",
      }}
    />
  );
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {edge("to bottom", "22%", { left: 0, right: 0, top: 0 })}
      {edge("to top", "26%", { left: 0, right: 0, bottom: 0 })}
      {edge("to right", "14%", { top: 0, bottom: 0, left: 0 })}
      {edge("to left", "14%", { top: 0, bottom: 0, right: 0 })}
    </AbsoluteFill>
  );
};

/**
 * Grain de pellicule très léger : bruit pseudo-aléatoire (graine fixe) peint
 * une seule fois dans un canevas, puis simplement recomposé à chaque image.
 */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.05 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const img = ctx.createImageData(canvas.width, canvas.height);
    const rand = seeded(2024);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.round(rand() * 255);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, []);
  return (
    <canvas
      ref={ref}
      width={960}
      height={540}
      style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", opacity, pointerEvents: "none" }}
    />
  );
};
