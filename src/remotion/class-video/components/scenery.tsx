import React from "react";

import { darken, lighten, mix, withAlpha } from "../colors";
import type { IlluColors } from "../theme";

/**
 * Décors dessinés en SVG, même style à plat que les personnages : école,
 * stand de fête, guirlande de fanions, table, car de sortie, arbres. Chaque
 * décor est un SVG figé (mis en cache au rendu) ; on l'anime en déplaçant son
 * conteneur.
 */

type Placed = { x: number; y: number; width: number; style?: React.CSSProperties };

/** Place un SVG de proportions `vw × vh` à (x, y) — coin haut gauche — sur `width` pixels. */
const Frame: React.FC<Placed & { vw: number; vh: number; children: React.ReactNode }> = ({ x, y, width, vw, vh, style, children }) => (
  <div style={{ position: "absolute", left: x, top: y, width, height: (width * vh) / vw, ...style }}>
    <svg width={width} height={(width * vh) / vw} viewBox={`0 0 ${vw} ${vh}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      {children}
    </svg>
  </div>
);

const Window: React.FC<{ x: number; y: number; w: number; h: number; c: IlluColors; arch?: boolean }> = ({ x, y, w, h, c, arch }) => {
  const glass = mix(c.a, "#ffffff", 0.72);
  const r = arch ? w / 2 : 6;
  const d = arch
    ? `M${x},${y + h} L${x},${y + r} A${r},${r} 0 0 1 ${x + w},${y + r} L${x + w},${y + h} Z`
    : `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`;
  return (
    <g>
      <path d={d} fill={glass} stroke="#ffffff" strokeWidth={6} />
      <path d={`M${x + w * 0.2},${y + h * 0.75} L${x + w * 0.55},${y + h * 0.2}`} stroke="#ffffff" strokeWidth={5} strokeLinecap="round" opacity={0.55} />
      <rect x={x - 6} y={y + h - 2} width={w + 12} height={8} rx={3} fill={mix(c.cream, c.ink, 0.12)} />
    </g>
  );
};

/** Façade d'école : corps central à fronton, deux ailes, porte, drapeau. 900 × 560. */
export const School: React.FC<Placed & { c: IlluColors; roof?: string }> = ({ c, roof: roofColor, ...placed }) => {
  const wall = c.cream;
  const wallShade = mix(c.cream, c.ink, 0.06);
  const roof = roofColor ?? c.a;
  return (
    <Frame {...placed} vw={900} vh={560}>
      {/* Ailes */}
      {[40, 600].map((x) => (
        <g key={x}>
          <rect x={x} y={250} width={260} height={310} fill={wallShade} />
          <rect x={x - 10} y={236} width={280} height={22} rx={6} fill={darken(roof, 0.12)} />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <Window x={x + 30 + i * 76} y={290} w={50} h={70} c={c} />
              <Window x={x + 30 + i * 76} y={410} w={50} h={70} c={c} />
            </g>
          ))}
        </g>
      ))}
      {/* Corps central */}
      <rect x={290} y={150} width={320} height={410} fill={wall} />
      <path d="M270,160 L450,50 L630,160 Z" fill={roof} strokeLinejoin="round" stroke={roof} strokeWidth={14} />
      <path d="M318,152 L450,78 L582,152 Z" fill={lighten(roof, 0.82)} />
      <circle cx={450} cy={122} r={20} fill="#ffffff" />
      <circle cx={450} cy={122} r={20} fill="none" stroke={darken(roof, 0.1)} strokeWidth={4} />
      <path d="M450,110 L450,122 L459,128" stroke={c.ink} strokeWidth={3.5} strokeLinecap="round" fill="none" />
      <rect x={446} y={4} width={5} height={54} fill={c.stone} />
      <path d="M451,8 L494,18 L451,30 Z" fill={c.b} />
      {[330, 425, 520].map((x) => (
        <Window key={x} x={x} y={200} w={50} h={80} c={c} arch />
      ))}
      <Window x={330} y={340} w={50} h={80} c={c} />
      <Window x={520} y={340} w={50} h={80} c={c} />
      {/* Porte */}
      <path d="M404,560 L404,380 A46,46 0 0 1 496,380 L496,560 Z" fill={c.b} />
      <path d="M404,560 L404,380 A46,46 0 0 1 496,380 L496,560 Z" fill="none" stroke="#ffffff" strokeWidth={8} />
      <line x1={450} y1={340} x2={450} y2={560} stroke={darken(c.b, 0.15)} strokeWidth={4} />
      <circle cx={438} cy={470} r={5} fill={c.c} />
      <circle cx={462} cy={470} r={5} fill={c.c} />
      <rect x={380} y={548} width={140} height={12} rx={3} fill={mix(wall, c.ink, 0.15)} />
      {/* Soubassement */}
      <rect x={40} y={540} width={820} height={20} fill={mix(wall, c.ink, 0.1)} />
    </Frame>
  );
};

/** Arbre rond (tronc + feuillage deux tons). 200 × 300. */
export const Tree: React.FC<Placed & { c: IlluColors; variant?: number }> = ({ c, variant = 0, ...placed }) => (
  <Frame {...placed} vw={200} vh={300}>
    <rect x={92} y={170} width={16} height={130} rx={6} fill={mix(c.wood, "#5b4636", 0.4)} />
    {variant % 2 === 0 ? (
      <>
        <circle cx={100} cy={110} r={84} fill={c.leaf} />
        <circle cx={128} cy={90} r={44} fill={lighten(c.leaf, 0.18)} />
      </>
    ) : (
      <>
        <ellipse cx={100} cy={120} rx={70} ry={100} fill={c.leafDark} />
        <ellipse cx={120} cy={96} rx={32} ry={56} fill={c.leaf} />
      </>
    )}
  </Frame>
);

/** Haie arrondie. 240 × 90. */
export const Bush: React.FC<Placed & { c: IlluColors }> = ({ c, ...placed }) => (
  <Frame {...placed} vw={240} vh={90}>
    <path d="M10,90 C0,50 40,30 70,44 C84,10 140,6 158,38 C190,24 236,44 230,90 Z" fill={c.leafDark} />
    <path d="M60,90 C58,62 84,52 104,62 C118,40 160,44 164,72 C180,70 196,80 196,90 Z" fill={c.leaf} />
  </Frame>
);

/** Nuage doux. 260 × 110. */
export const Cloud: React.FC<Placed & { color?: string }> = ({ color = "#ffffff", ...placed }) => (
  <Frame {...placed} vw={260} vh={110}>
    <path d="M30,106 C0,106 0,64 34,64 C38,30 84,18 104,44 C120,8 184,10 190,54 C232,48 256,106 216,106 Z" fill={color} />
  </Frame>
);

/**
 * Guirlande de fanions entre deux points (repère local 1000 × 200), avec
 * un léger creux. Couleurs en alternance.
 */
export const Bunting: React.FC<Placed & { colors: string[]; count?: number; sag?: number }> = ({ colors, count = 11, sag = 70, ...placed }) => {
  const pts = Array.from({ length: count }, (_, i) => {
    const k = (i + 0.5) / count;
    return { x: 20 + k * 960, y: 20 + Math.sin(k * Math.PI) * sag };
  });
  return (
    <Frame {...placed} vw={1000} vh={200}>
      <path d={`M20,20 Q500,${20 + sag * 2} 980,20`} stroke={withAlpha("#3a3a3a", 0.45)} strokeWidth={4} fill="none" />
      {pts.map((p, i) => {
        const angle = Math.cos(((i + 0.5) / count) * Math.PI) * -12;
        return (
          <path
            key={i}
            d={`M${p.x - 30},${p.y} L${p.x + 30},${p.y} L${p.x},${p.y + 70} Z`}
            fill={colors[i % colors.length]}
            transform={`rotate(${angle.toFixed(1)} ${p.x} ${p.y})`}
            strokeLinejoin="round"
            stroke={colors[i % colors.length]}
            strokeWidth={6}
          />
        );
      })}
    </Frame>
  );
};

/** Table nappée, vue de face. 560 × 210 (plateau en haut, pieds au sol). */
export const Table: React.FC<Placed & { c: IlluColors; cloth: string; trim?: string }> = ({ c, cloth, trim, ...placed }) => (
  <Frame {...placed} vw={560} vh={210}>
    <rect x={40} y={120} width={16} height={90} rx={4} fill={darken(c.wood, 0.2)} />
    <rect x={504} y={120} width={16} height={90} rx={4} fill={darken(c.wood, 0.2)} />
    <rect x={10} y={0} width={540} height={20} rx={6} fill={darken(cloth, 0.06)} />
    <path d={`M10,14 H550 V128 ${Array.from({ length: 9 }, (_, i) => `Q${550 - i * 60 - 30},${150} ${550 - (i + 1) * 60},128`).join(" ")} Z`} fill={cloth} />
    {trim ? <rect x={10} y={16} width={540} height={10} fill={trim} /> : null}
  </Frame>
);

/** Stand de fête : auvent rayé et poteaux (le comptoir est une Table posée devant). 620 × 420. */
export const Stand: React.FC<Placed & { c: IlluColors; stripe: string }> = ({ c, stripe, ...placed }) => {
  const n = 8;
  const w = 600 / n;
  return (
    <Frame {...placed} vw={620} vh={420}>
      <rect x={30} y={60} width={14} height={360} rx={5} fill={mix(c.wood, "#ffffff", 0.2)} />
      <rect x={576} y={60} width={14} height={360} rx={5} fill={mix(c.wood, "#ffffff", 0.2)} />
      <path d="M0,70 L40,0 L580,0 L620,70 Z" fill={darken(stripe, 0.12)} />
      {Array.from({ length: n }, (_, i) => (
        <path
          key={i}
          d={`M${10 + i * w},60 H${10 + (i + 1) * w} V104 Q${10 + (i + 0.5) * w},130 ${10 + i * w},104 Z`}
          fill={i % 2 === 0 ? stripe : "#ffffff"}
        />
      ))}
      <rect x={10} y={52} width={600} height={16} rx={4} fill={darken(stripe, 0.18)} />
    </Frame>
  );
};

/** Car de sortie scolaire, vu de profil. 820 × 330. */
export const Coach: React.FC<Placed & { c: IlluColors }> = ({ c, ...placed }) => {
  const body = "#ffffff";
  const glass = mix(c.a, "#ffffff", 0.55);
  return (
    <Frame {...placed} vw={820} vh={330}>
      <path d="M40,40 Q40,10 70,10 H740 Q800,10 806,70 L812,250 Q812,270 792,270 H48 Q30,270 30,250 Z" fill={body} />
      <path d="M30,196 H812 V236 H30 Z" fill={c.a} />
      <path d="M30,236 H812 V250 Q812,270 792,270 H48 Q30,270 30,250 Z" fill={darken(c.a, 0.2)} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i}>
          <rect x={70 + i * 102} y={46} width={88} height={96} rx={12} fill={glass} />
          <path d={`M${86 + i * 102},${120} L${116 + i * 102},${62}`} stroke="#ffffff" strokeWidth={6} strokeLinecap="round" opacity={0.5} />
        </g>
      ))}
      <path d="M700,46 H764 Q790,46 792,80 L796,142 H700 Z" fill={glass} />
      <rect x={636} y={46} width={50} height={190} rx={8} fill={mix(glass, "#ffffff", 0.25)} />
      <rect x={66} y={160} width={560} height={10} rx={5} fill={withAlpha(c.a, 0.25)} />
      <circle cx={798} cy={214} r={9} fill={c.c} />
      {[170, 660].map((x) => (
        <g key={x}>
          <circle cx={x} cy={270} r={50} fill="#2b2f36" />
          <circle cx={x} cy={270} r={22} fill="#c9ced6" />
        </g>
      ))}
    </Frame>
  );
};

/** Goûter posé sur une table : gâteau, gobelets, assiette de biscuits. 460 × 150. */
export const Treats: React.FC<Placed & { c: IlluColors }> = ({ c, ...placed }) => (
  <Frame {...placed} vw={460} vh={150}>
    {/* Gâteau à étages */}
    <rect x={40} y={96} width={140} height={54} rx={10} fill={lighten(c.b, 0.55)} />
    <rect x={60} y={50} width={100} height={50} rx={10} fill={lighten(c.c, 0.4)} />
    <path d="M40,106 Q57,122 75,106 Q92,122 110,106 Q127,122 145,106 Q162,122 180,106 V104 H40 Z" fill="#ffffff" />
    <rect x={106} y={22} width={8} height={28} rx={3} fill={c.a} />
    <path d="M110,6 Q118,16 110,22 Q102,16 110,6 Z" fill={c.c} />
    {/* Gobelets */}
    {[230, 280].map((x, i) => (
      <g key={x}>
        <path d={`M${x},90 H${x + 36} L${x + 31},150 H${x + 5} Z`} fill={i ? c.a : c.b} />
        <rect x={x - 2} y={86} width={40} height={8} rx={3} fill={darken(i ? c.a : c.b, 0.15)} />
      </g>
    ))}
    {/* Assiette de biscuits */}
    <ellipse cx={390} cy={142} rx={62} ry={10} fill={mix("#ffffff", c.ink, 0.08)} />
    {[360, 390, 420, 375, 405].map((x, i) => (
      <circle key={i} cx={x} cy={i < 3 ? 128 : 112} r={16} fill={c.wood} />
    ))}
  </Frame>
);

/** Grand cœur en contour, motif du lien (à révéler par un masque). 400 × 360. */
export const HeartOutline: React.FC<Placed & { color: string; strokeWidth?: number }> = ({ color, strokeWidth = 16, ...placed }) => (
  <Frame {...placed} vw={400} vh={360}>
    <path
      d="M200,330 C60,240 20,170 30,110 C40,50 100,24 150,40 C176,48 192,66 200,84 C208,66 224,48 250,40 C300,24 360,50 370,110 C380,170 340,240 200,330 Z"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
  </Frame>
);

/** Petits cœurs pleins (accents discrets). */
export const SmallHeart: React.FC<Placed & { color: string }> = ({ color, ...placed }) => (
  <Frame {...placed} vw={100} vh={90}>
    <path d="M50,86 C12,62 2,40 6,26 C10,10 26,2 38,6 C44,8 48,12 50,18 C52,12 56,8 62,6 C74,2 90,10 94,26 C98,40 88,62 50,86 Z" fill={color} />
  </Frame>
);

/** Objets de réunion posés sur une table : papiers, tasses, plante. 460 × 110. */
export const DeskItems: React.FC<Placed & { c: IlluColors }> = ({ c, ...placed }) => (
  <Frame {...placed} vw={460} vh={110}>
    {/* Plante */}
    <path d="M40,110 L34,74 H78 L72,110 Z" fill={c.b} />
    <path d="M56,74 C40,50 30,40 22,20 C44,28 54,46 56,74 Z" fill={c.leafDark} />
    <path d="M56,74 C62,44 76,30 94,24 C88,46 74,62 56,74 Z" fill={c.leaf} />
    {/* Papiers */}
    <rect x={150} y={96} width={120} height={14} rx={3} fill="#ffffff" transform="rotate(-3 210 103)" />
    <rect x={160} y={92} width={110} height={12} rx={3} fill={mix("#ffffff", c.a, 0.12)} transform="rotate(4 215 98)" />
    {/* Tasses */}
    {[320, 390].map((x, i) => (
      <g key={x}>
        <path d={`M${x + 34},${76} C${x + 50},${76} ${x + 50},${98} ${x + 34},${98}`} stroke={darken(i ? c.c : c.a, 0.12)} strokeWidth={5} fill="none" />
        <rect x={x} y={68} width={36} height={42} rx={7} fill={i ? c.c : c.a} />
      </g>
    ))}
  </Frame>
);

/** Bulle de discussion discrète (trois points). 150 × 110. */
export const SpeechBubble: React.FC<Placed & { color: string; dots: string; flip?: boolean }> = ({ color, dots, flip, ...placed }) => (
  <Frame {...placed} vw={150} vh={110}>
    <g transform={flip ? "translate(150 0) scale(-1 1)" : undefined}>
      <path d="M20,0 H130 Q150,0 150,20 V62 Q150,82 130,82 H56 L28,108 L34,82 H20 Q0,82 0,62 V20 Q0,0 20,0 Z" fill={color} />
    </g>
    {[45, 75, 105].map((x) => (
      <circle key={x} cx={x} cy={41} r={8} fill={dots} />
    ))}
  </Frame>
);
