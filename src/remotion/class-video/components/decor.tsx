import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

import { enter, seeded } from "./motion";

/**
 * Accents décoratifs, volontairement discrets : quelques étincelles fines
 * et des pastilles. Plus de confettis ni d'arc-en-ciel : la vidéo s'adresse
 * aux parents.
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
