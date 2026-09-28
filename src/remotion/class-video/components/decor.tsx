import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { bob, pop, seeded } from "./motion";

/**
 * Décor : formes qui flottent, confettis, étincelles. Uniquement des <div>
 * (cercles, clip-path polygonaux) : c'est ce que le moteur de rendu web
 * dessine le plus vite et le plus fidèlement.
 */

/** Polygone d'étoile (en % pour clip-path). */
function starPolygon(points: number, inner: number): string {
  const coords: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 50 : 50 * inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    coords.push(`${(50 + r * Math.cos(a)).toFixed(2)}% ${(50 + r * Math.sin(a)).toFixed(2)}%`);
  }
  return `polygon(${coords.join(", ")})`;
}

export const STAR_5 = starPolygon(5, 0.48);
export const STAR_4 = starPolygon(4, 0.32);
const PLUS =
  "polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%)";
const TRIANGLE = "polygon(50% 4%, 97% 92%, 3% 92%)";

type ShapeKind = "dot" | "ring" | "star" | "plus" | "tri" | "pill" | "sparkle";
const KINDS: ShapeKind[] = ["dot", "ring", "star", "pill", "plus", "dot", "tri", "ring", "sparkle", "star"];

export const Shape: React.FC<{
  kind: ShapeKind;
  size: number;
  color: string;
  style?: React.CSSProperties;
}> = ({ kind, size, color, style }) => {
  const base: React.CSSProperties = { position: "absolute", width: size, height: size, ...style };
  switch (kind) {
    case "dot":
      return <div style={{ ...base, borderRadius: "50%", background: color }} />;
    case "ring":
      return (
        <div
          style={{ ...base, borderRadius: "50%", border: `${Math.max(6, size * 0.2)}px solid ${color}`, boxSizing: "border-box" }}
        />
      );
    case "star":
      return <div style={{ ...base, background: color, clipPath: STAR_5 }} />;
    case "sparkle":
      return <div style={{ ...base, background: color, clipPath: STAR_4 }} />;
    case "plus":
      return <div style={{ ...base, background: color, clipPath: PLUS }} />;
    case "tri":
      return <div style={{ ...base, background: color, clipPath: TRIANGLE }} />;
    case "pill":
      return <div style={{ ...base, height: size * 0.38, borderRadius: size, background: color }} />;
  }
};

/**
 * Formes colorées qui flottent autour de l'écran en laissant le centre
 * dégagé pour le texte. Placement tiré d'une graine : identique à chaque rendu.
 */
export const FloatingShapes: React.FC<{
  colors: string[];
  seed: number;
  count?: number;
  opacity?: number;
  delay?: number;
}> = ({ colors, seed, count = 14, opacity = 0.85, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const rand = seeded(seed);
  const shapes = [];
  let guard = 0;
  while (shapes.length < count && guard++ < 400) {
    const x = rand();
    const y = rand();
    // On garde le centre (zone du texte) et le bandeau de titre en haut libres.
    const dx = (x - 0.5) / 0.42;
    const dy = (y - 0.5) / 0.38;
    const inTitleBand = y < 0.24 && Math.abs(x - 0.5) < 0.36;
    const size = 26 + rand() * 70;
    const kind = KINDS[Math.floor(rand() * KINDS.length)];
    const color = colors[Math.floor(rand() * colors.length)] ?? "#ffffff";
    const phase = rand() * Math.PI * 2;
    const spin = (rand() - 0.5) * 40;
    if (dx * dx + dy * dy < 1 || inTitleBand) continue;
    shapes.push({ x, y, size, kind, color, phase, spin, i: shapes.length });
  }
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {shapes.map((s) => {
        const enter = pop(frame, fps, delay + s.i * 1.5, 140, 12);
        const t = frame / fps;
        const tx = bob(frame, fps, 12, 3.4, s.phase);
        const ty = bob(frame, fps, 18, 2.6, s.phase * 1.3);
        return (
          <Shape
            key={s.i}
            kind={s.kind}
            size={s.size}
            color={s.color}
            style={{
              left: s.x * width - s.size / 2,
              top: s.y * height - s.size / 2,
              opacity: opacity * Math.min(1, enter),
              transform: `translate(${tx}px, ${ty}px) rotate(${s.spin * t + s.phase * 20}deg) scale(${enter})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/**
 * Explosion de confettis depuis un point : trajectoire balistique calculée
 * en forme close (vitesse initiale, frottement, gravité).
 */
export const ConfettiBurst: React.FC<{
  x: number;
  y: number;
  colors: string[];
  delay?: number;
  count?: number;
  seed?: number;
  power?: number;
  spread?: number;
}> = ({ x, y, colors, delay = 0, count = 46, seed = 7, power = 34, spread = 150 }) => {
  const frame = useCurrentFrame() - delay;
  if (frame < 0 || frame > 110) return null;
  const rand = seeded(seed);
  const drag = 0.93;
  const gravity = 0.9;
  const decay = (1 - drag ** frame) / (1 - drag);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: count }, (_, i) => {
        const angle = ((-90 + (rand() - 0.5) * spread) * Math.PI) / 180;
        const speed = power * (0.45 + rand() * 0.75);
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const px = x + vx * decay;
        const py = y + vy * decay + (gravity * (frame - decay)) / (1 - drag);
        const w = 14 + rand() * 12;
        const round = rand() < 0.3;
        const rot = rand() * 360 + frame * (rand() - 0.5) * 24;
        const flip = Math.cos(frame * (0.15 + rand() * 0.25) + i);
        const color = colors[i % colors.length];
        const fade = Math.min(1, (110 - frame) / 20);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: px,
              top: py,
              width: w,
              height: round ? w : w * 0.55,
              borderRadius: round ? "50%" : 3,
              background: color,
              opacity: fade,
              transform: `rotate(${rot}deg) scaleY(${round ? 1 : flip})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Pluie de confettis continue (scène de fin). */
export const ConfettiRain: React.FC<{ colors: string[]; count?: number; seed?: number; delay?: number }> = ({
  colors,
  count = 60,
  seed = 11,
  delay = 0,
}) => {
  const frame = useCurrentFrame() - delay;
  const { width, height } = useVideoConfig();
  if (frame < 0) return null;
  const rand = seeded(seed);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: count }, (_, i) => {
        const x0 = rand() * width;
        const speed = 5 + rand() * 6;
        const start = rand() * 70 * speed;
        const w = 14 + rand() * 12;
        const round = rand() < 0.3;
        const sway = Math.sin(frame * 0.05 + i) * 40;
        // Chaque confetti part du haut après un délai propre, puis retombe en boucle :
        // aucun n'apparaît au milieu de l'écran.
        const travelled = frame * speed - start;
        const rot = rand() * 360 + frame * 6 * (i % 2 ? 1 : -1);
        const flip = Math.cos(frame * 0.2 + i);
        if (travelled < 0) return null;
        const y = -60 + (travelled % (height + 120));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x0 + sway,
              top: y,
              width: w,
              height: round ? w : w * 0.55,
              borderRadius: round ? "50%" : 3,
              background: colors[i % colors.length],
              transform: `rotate(${rot}deg) scaleY(${round ? 1 : flip})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Étincelles à quatre branches qui scintillent autour d'une zone. */
export const Twinkles: React.FC<{
  color: string;
  seed?: number;
  count?: number;
  box: { x: number; y: number; w: number; h: number };
  delay?: number;
  size?: number;
}> = ({ color, seed = 3, count = 6, box, delay = 0, size = 46 }) => {
  const frame = useCurrentFrame() - delay;
  const { fps } = useVideoConfig();
  if (frame < 0) return null;
  const rand = seeded(seed);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: count }, (_, i) => {
        const x = box.x + rand() * box.w;
        const y = box.y + rand() * box.h;
        const s = size * (0.5 + rand() * 0.7);
        const period = 1.1 + rand() * 0.8;
        const phase = rand();
        const t = (frame / fps / period + phase) % 1;
        const k = Math.sin(t * Math.PI) ** 2;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - s / 2,
              top: y - s / 2,
              width: s,
              height: s,
              background: color,
              clipPath: STAR_4,
              opacity: k,
              transform: `scale(${0.3 + k * 0.8}) rotate(${t * 90}deg)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
