import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { enter, seeded, snap } from "./motion";

/**
 * Accents décoratifs : formes géométriques franches (bandes obliques,
 * disques, anneaux, trames de points) qui surgissent en rythme, et quelques
 * étincelles fines. Graphique et moderne, sans confettis.
 */

/** Étoile à quatre branches fines (points pour <polygon>, repère 100 × 100). */
const SPARK = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? 50 : 12;
    const a = (Math.PI * i) / 4 - Math.PI / 2;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
})();

/** Quelques étincelles qui apparaissent puis scintillent doucement dans une zone. */
export const Sparkles: React.FC<{
  color: string;
  seed: number;
  count?: number;
  delay?: number;
  box: { x: number; y: number; w: number; h: number };
  size?: number;
  opacity?: number;
}> = ({ color, seed, count = 5, delay = 0, box, size = 34, opacity = 0.9 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rand = seeded(seed);
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const x = box.x + rand() * box.w;
        const y = box.y + rand() * box.h;
        const s = size * (0.55 + rand() * 0.6);
        const d = delay + i * 5;
        const p = enter(frame, d, 18);
        const pulse = 0.85 + 0.15 * Math.sin(((frame - d) / fps) * 2.4 + i * 1.7);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - s / 2,
              top: y - s / 2,
              width: s,
              height: s,
              opacity: p * opacity,
              transform: `scale(${p * pulse}) rotate(${i * 11}deg)`,
            }}
          >
            <svg width={s} height={s} viewBox="0 0 100 100" style={{ position: "absolute", left: 0, top: 0 }}>
              <polygon points={SPARK} fill={color} />
            </svg>
          </div>
        );
      })}
    </>
  );
};

/** Pastille ronde pleine (ponctuation graphique). */
export const Dot: React.FC<{ x: number; y: number; r: number; color: string; delay?: number }> = ({ x, y, r, color, delay = 0 }) => {
  const frame = useCurrentFrame();
  const p = enter(frame, delay, 20);
  return (
    <div
      style={{
        position: "absolute",
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: "50%",
        background: color,
        transform: `scale(${p})`,
      }}
    />
  );
};

export type GeoShape =
  | { kind: "disc"; x: number; y: number; r: number; color: string; at?: number }
  | { kind: "ring"; x: number; y: number; r: number; width: number; color: string; at?: number }
  | { kind: "band"; x: number; y: number; w: number; h: number; angle: number; color: string; at?: number; from?: -1 | 1 }
  | { kind: "dots"; x: number; y: number; cols: number; rows: number; gap: number; r: number; color: string; at?: number };

/**
 * Formes géométriques d'accompagnement. Disques et anneaux claquent en
 * grossissant, les bandes obliques entrent en glissant sur leur axe, les
 * points apparaissent en cascade ; puis tout dérive très légèrement.
 */
export const GeoShapes: React.FC<{ shapes: GeoShape[]; delay?: number }> = ({ shapes, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <>
      {shapes.map((shape, i) => {
        const at = delay + (shape.at ?? i * 3);
        const drift = Math.sin(t * 0.9 + i * 1.3) * 8;
        if (shape.kind === "disc" || shape.kind === "ring") {
          const p = Math.max(0, snap(frame, fps, at, 220, 18));
          const ring = shape.kind === "ring";
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: shape.x - shape.r,
                top: shape.y - shape.r + drift,
                width: shape.r * 2,
                height: shape.r * 2,
                borderRadius: "50%",
                boxSizing: "border-box",
                background: ring ? undefined : shape.color,
                border: ring ? `${shape.width}px solid ${shape.color}` : undefined,
                transform: `scale(${p})`,
              }}
            />
          );
        }
        if (shape.kind === "band") {
          const p = interpolate(frame, [at, at + 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          });
          const dir = shape.from ?? 1;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: shape.x - shape.w / 2,
                top: shape.y - shape.h / 2,
                width: shape.w,
                height: shape.h,
                borderRadius: shape.h / 2,
                background: shape.color,
                transform: `rotate(${shape.angle}deg) translateX(${(1 - p) * dir * (shape.w + 400)}px) translateY(${drift * 0.5}px)`,
              }}
            />
          );
        }
        return (
          <React.Fragment key={i}>
            {Array.from({ length: shape.cols * shape.rows }, (_, k) => {
              const cx = shape.x + (k % shape.cols) * shape.gap;
              const cy = shape.y + Math.floor(k / shape.cols) * shape.gap;
              const p = Math.max(0, snap(frame, fps, at + k * 0.8, 260, 20));
              return (
                <div
                  key={k}
                  style={{
                    position: "absolute",
                    left: cx - shape.r,
                    top: cy - shape.r + drift * 0.6,
                    width: shape.r * 2,
                    height: shape.r * 2,
                    borderRadius: "50%",
                    background: shape.color,
                    transform: `scale(${p})`,
                  }}
                />
              );
            })}
          </React.Fragment>
        );
      })}
    </>
  );
};
