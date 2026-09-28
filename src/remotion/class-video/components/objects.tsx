import React from "react";

import { darken, lighten, mix, withAlpha, WHITE } from "../colors";
import type { IlluColors } from "../theme";

/**
 * Objets illustrés (SVG figés, style à plat avec modelé léger) pour les
 * scènes « bienfaits », « membre », « intro » et « fin » : briques géantes,
 * baby-foot, appareil photo et tirages, ampoule d'idée, calendrier de
 * réunions, silhouette « à compléter », pictogrammes des deux appels.
 */

type Sized = { size: number; c: IlluColors };

/** Briques de construction géantes empilées (les « legos » de la cour). */
export const Blocks: React.FC<Sized> = ({ size, c }) => {
  const brick = (x: number, y: number, w: number, color: string, studs: number) => (
    <g key={`${x}-${y}`}>
      {Array.from({ length: studs }, (_, i) => {
        const sx = x + (w / studs) * (i + 0.5);
        return (
          <g key={i}>
            <rect x={sx - 13} y={y - 12} width={26} height={16} rx={4} fill={darken(color, 0.12)} />
            <ellipse cx={sx} cy={y - 12} rx={13} ry={5} fill={lighten(color, 0.18)} />
          </g>
        );
      })}
      <rect x={x} y={y} width={w} height={46} rx={7} fill={color} />
      <rect x={x} y={y + 30} width={w} height={16} rx={6} fill={darken(color, 0.14)} />
      <rect x={x + 8} y={y + 7} width={w * 0.35} height={6} rx={3} fill={WHITE} opacity={0.35} />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 300 300" style={{ display: "block" }}>
      <ellipse cx={150} cy={268} rx={120} ry={14} fill={withAlpha(c.ink, 0.12)} />
      {brick(40, 206, 140, c.a, 4)}
      {brick(180, 206, 90, c.c, 2)}
      {brick(74, 150, 110, c.b, 3)}
      {brick(184, 150, 70, mix(c.a, WHITE, 0.35), 2)}
      {brick(110, 94, 100, c.c, 3)}
      {brick(128, 38, 64, c.b, 2)}
    </svg>
  );
};

/** Baby-foot vu de trois quarts : terrain, barres, joueurs, ballon. */
export const Foosball: React.FC<Sized> = ({ size, c }) => {
  const field = "#5dbb7a";
  const rods = [70, 118, 166, 214];
  return (
    <svg width={size} height={size} viewBox="0 0 300 300" style={{ display: "block" }}>
      <ellipse cx={150} cy={272} rx={126} ry={12} fill={withAlpha(c.ink, 0.12)} />
      {/* Pieds */}
      <rect x={52} y={200} width={16} height={70} rx={5} fill={darken(c.wood, 0.25)} />
      <rect x={232} y={200} width={16} height={70} rx={5} fill={darken(c.wood, 0.25)} />
      {/* Caisse */}
      <path d="M30 108 L270 108 L262 214 L38 214 Z" fill={c.wood} />
      <path d="M38 196 L262 196 L262 214 L38 214 Z" fill={darken(c.wood, 0.18)} />
      {/* Terrain */}
      <path d="M46 116 L254 116 L248 192 L52 192 Z" fill={field} />
      <path d="M150 116 L150 192" stroke={WHITE} strokeWidth={3} opacity={0.7} />
      <ellipse cx={150} cy={154} rx={22} ry={14} fill="none" stroke={WHITE} strokeWidth={3} opacity={0.7} />
      <rect x={46} y={140} width={8} height={28} fill={WHITE} opacity={0.8} />
      <rect x={246} y={140} width={8} height={28} fill={WHITE} opacity={0.8} />
      {/* Barres et joueurs */}
      {rods.map((x, i) => (
        <g key={x}>
          <rect x={x - 3} y={92} width={6} height={122} rx={3} fill="#c9ced6" />
          {[128, 152, 176].slice(0, i % 2 ? 3 : 2).map((y) => (
            <g key={y}>
              <rect x={x - 7} y={y - 14} width={14} height={24} rx={5} fill={i < 2 ? c.a : c.b} />
              <circle cx={x} cy={y - 18} r={6} fill={i < 2 ? darken(c.a, 0.2) : darken(c.b, 0.2)} />
            </g>
          ))}
          <rect x={x - 8} y={84} width={16} height={14} rx={5} fill={darken(c.wood, 0.35)} />
        </g>
      ))}
      <circle cx={140} cy={164} r={7} fill={WHITE} />
    </svg>
  );
};

/** Appareil photo et tirages en éventail (les souvenirs). */
export const CameraStack: React.FC<Sized> = ({ size, c }) => {
  const photo = (x: number, y: number, r: number, sky: string) => (
    <g transform={`rotate(${r} ${x + 70} ${y + 80})`}>
      <rect x={x} y={y} width={140} height={160} rx={8} fill={WHITE} />
      <rect x={x + 10} y={y + 10} width={120} height={108} rx={4} fill={sky} />
      <circle cx={x + 100} cy={y + 36} r={12} fill={lighten(c.c, 0.3)} />
      <path d={`M${x + 10} ${y + 118} L${x + 50} ${y + 70} L${x + 80} ${y + 100} L${x + 100} ${y + 84} L${x + 130} ${y + 118} Z`} fill={mix(c.leafDark, sky, 0.2)} />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 300 300" style={{ display: "block" }}>
      <ellipse cx={150} cy={272} rx={118} ry={12} fill={withAlpha(c.ink, 0.12)} />
      {photo(40, 40, -14, mix(c.a, WHITE, 0.55))}
      {photo(120, 30, 12, mix(c.b, WHITE, 0.6))}
      {/* Appareil */}
      <rect x={62} y={146} width={176} height={112} rx={18} fill="#2b3240" />
      <rect x={92} y={130} width={60} height={24} rx={7} fill="#2b3240" />
      <rect x={62} y={176} width={176} height={16} fill={c.a} />
      <circle cx={150} cy={202} r={40} fill="#1a1f29" />
      <circle cx={150} cy={202} r={30} fill={mix(c.a, "#1a1f29", 0.4)} />
      <circle cx={150} cy={202} r={17} fill="#0f131a" />
      <circle cx={140} cy={192} r={6} fill={WHITE} opacity={0.6} />
      <circle cx={212} cy={162} r={7} fill={c.c} />
    </svg>
  );
};

/** Ampoule allumée (une idée), avec rayons. */
export const Lightbulb: React.FC<Sized & { glow?: number }> = ({ size, c, glow = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" style={{ display: "block", overflow: "visible" }}>
    <circle cx={60} cy={50} r={42} fill={withAlpha(c.c, 0.25 * glow)} />
    {Array.from({ length: 8 }, (_, i) => (
      <rect key={i} x={57} y={-4} width={6} height={16} rx={3} fill={c.c} opacity={glow} transform={`rotate(${i * 45 - 90 + 22.5} 60 50)`} />
    ))}
    <path d="M60 18 C40 18 28 32 28 48 C28 60 36 66 40 74 L80 74 C84 66 92 60 92 48 C92 32 80 18 60 18 Z" fill={lighten(c.c, 0.2)} />
    <path d="M44 34 C48 28 54 26 60 26" stroke={WHITE} strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.8} />
    <rect x={42} y={76} width={36} height={10} rx={4} fill="#c9ced6" />
    <rect x={44} y={88} width={32} height={10} rx={4} fill="#aeb4be" />
    <rect x={50} y={100} width={20} height={8} rx={4} fill="#8e959f" />
  </svg>
);

/** Petit calendrier de réunions : quelques jours cochés. */
export const MeetingCalendar: React.FC<Sized & { marked: number }> = ({ size, c, marked }) => {
  const days = Array.from({ length: 21 }, (_, i) => i);
  const picks = [4, 11, 17];
  return (
    <svg width={size} height={size * 0.92} viewBox="0 0 240 220" style={{ display: "block" }}>
      <rect x={0} y={10} width={240} height={210} rx={22} fill={WHITE} />
      <rect x={0} y={10} width={240} height={56} rx={22} fill={c.b} />
      <rect x={0} y={44} width={240} height={22} fill={c.b} />
      <rect x={50} y={0} width={12} height={34} rx={6} fill={c.ink} />
      <rect x={178} y={0} width={12} height={34} rx={6} fill={c.ink} />
      {days.map((d) => {
        const x = 26 + (d % 7) * 31;
        const y = 90 + Math.floor(d / 7) * 40;
        const k = picks.indexOf(d);
        const on = k >= 0 && k < marked;
        return (
          <g key={d}>
            {on ? <circle cx={x + 6} cy={y + 6} r={15} fill={c.a} /> : null}
            <rect x={x} y={y} width={12} height={12} rx={4} fill={on ? WHITE : mix(c.ink, WHITE, 0.85)} />
          </g>
        );
      })}
    </svg>
  );
};

/** Silhouette en pointillés : la place qui attend un nouveau parent. */
export const Silhouette: React.FC<{ width: number; height: number; color: string }> = ({ width, height, color }) => (
  <svg width={width} height={height} viewBox="0 0 160 420" style={{ display: "block" }}>
    <g fill={withAlpha(color, 0.12)} stroke={color} strokeWidth={5} strokeDasharray="14 10" strokeLinecap="round">
      <circle cx={80} cy={62} r={44} />
      <path d="M22 400 L22 190 Q22 126 80 126 Q138 126 138 190 L138 400 Z" />
    </g>
  </svg>
);

/** Pictogramme « devenir membre » : carte d'adhérent avec un cœur. */
export const MemberIcon: React.FC<{ size: number; color: string; accent: string }> = ({ size, color, accent }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }}>
    <rect x={10} y={22} width={80} height={58} rx={10} fill={color} />
    <circle cx={34} cy={46} r={10} fill={WHITE} />
    <path d="M20 70 Q20 58 34 58 Q48 58 48 70 Z" fill={WHITE} />
    <rect x={56} y={40} width={26} height={6} rx={3} fill={WHITE} opacity={0.9} />
    <rect x={56} y={52} width={18} height={6} rx={3} fill={WHITE} opacity={0.7} />
    <path d="M76 90 C60 80 58 70 64 65 C68 62 73 63 76 67 C79 63 84 62 88 65 C94 70 92 80 76 90 Z" fill={accent} stroke={WHITE} strokeWidth={3} />
  </svg>
);

/** Pictogramme « prêter main-forte » : main ouverte et cœur. */
export const HelpIcon: React.FC<{ size: number; color: string; accent: string }> = ({ size, color, accent }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }}>
    <path d="M50 44 C36 34 34 24 40 19 C44 16 48 17 50 21 C52 17 56 16 60 19 C66 24 64 34 50 44 Z" fill={accent} />
    <path
      d="M14 66 L30 58 C36 55 42 56 48 60 L62 60 C66 60 68 64 65 67 C63 69 60 69 56 69 L46 69 L60 70 L78 60 C83 57 88 61 85 66 L68 82 C64 86 58 88 52 88 L30 88 L14 94 Z"
      fill={color}
    />
  </svg>
);
