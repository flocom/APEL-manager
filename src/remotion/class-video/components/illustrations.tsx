import React from "react";

import type { IlluColors } from "../theme";

/**
 * Illustrations dessinées en SVG, dans les couleurs du logo. Style « à plat »
 * avec une ombre décalée et un reflet blanc, lisible de loin sur un TBI.
 * Chaque composant reçoit le temps en secondes (t) pour ses petites
 * animations internes ; aucune ressource externe.
 */

type IlluProps = { c: IlluColors; t: number; size: number };

const TAU = Math.PI * 2;
const wave = (t: number, period: number, phase = 0) => Math.sin((t * TAU) / period + phase);

/** Cœur centré en (x, y), de largeur ~2s. */
export function heartPath(x: number, y: number, s: number): string {
  return `M ${x} ${y + s * 0.9} C ${x - s * 1.25} ${y + s * 0.1}, ${x - s * 0.95} ${y - s * 0.95}, ${x} ${y - s * 0.35} C ${x + s * 0.95} ${y - s * 0.95}, ${x + s * 1.25} ${y + s * 0.1}, ${x} ${y + s * 0.9} Z`;
}

/** Étoile à cinq branches (points pour <polygon>). */
export function starPoints(x: number, y: number, r: number, inner = 0.5, rotation = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = (Math.PI * i) / 5 - Math.PI / 2 + rotation;
    pts.push(`${(x + rad * Math.cos(a)).toFixed(1)},${(y + rad * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

/** Ellipse « ombrée » : une teinte foncée décalée sous la couleur principale. */
const ShadedEllipse: React.FC<{ cx: number; cy: number; rx: number; ry: number; fill: string; shade: string }> = ({
  cx,
  cy,
  rx,
  ry,
  fill,
  shade,
}) => (
  <g>
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={shade} />
    <ellipse cx={cx - rx * 0.08} cy={cy - ry * 0.08} rx={rx * 0.9} ry={ry * 0.9} fill={fill} />
  </g>
);

// ---------------------------------------------------------------------------
// Piliers

/** « Donner vie » : un bouquet de ballons de fête qui se balancent. */
export const Balloons: React.FC<IlluProps> = ({ c, t, size }) => {
  const balloons = [
    { x: 128, y: 150, rx: 66, ry: 80, fill: c.b, shade: c.bDark, ph: 0 },
    { x: 272, y: 146, rx: 66, ry: 80, fill: c.c, shade: c.cDark, ph: 2.1 },
    { x: 200, y: 112, rx: 74, ry: 90, fill: c.a, shade: c.aDark, ph: 4.2 },
  ].map((b) => ({ ...b, dy: wave(t, 2.4, b.ph) * 9, rot: wave(t, 3.1, b.ph) * 5 }));
  const knotY = (b: (typeof balloons)[number]) => b.y + b.ry + b.dy;
  return (
    <svg width={size} height={size} viewBox="0 0 400 400">
      {balloons.map((b, i) => (
        <path
          key={`s${i}`}
          d={`M ${b.x} ${knotY(b) + 8} Q ${b.x + (200 - b.x) * 0.2 + wave(t, 2, i) * 10} ${(knotY(b) + 330) / 2} 200 332`}
          stroke={c.ink}
          strokeOpacity={0.55}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
        />
      ))}
      {balloons.map((b, i) => (
        <g key={i} transform={`rotate(${b.rot} ${b.x} ${knotY(b)}) translate(0 ${b.dy})`}>
          <polygon points={`${b.x - 10},${b.y + b.ry + 12} ${b.x + 10},${b.y + b.ry + 12} ${b.x},${b.y + b.ry - 4}`} fill={b.shade} />
          <ShadedEllipse cx={b.x} cy={b.y} rx={b.rx} ry={b.ry} fill={b.fill} shade={b.shade} />
          <ellipse
            cx={b.x - b.rx * 0.38}
            cy={b.y - b.ry * 0.38}
            rx={b.rx * 0.16}
            ry={b.ry * 0.26}
            fill={c.white}
            opacity={0.6}
            transform={`rotate(-28 ${b.x - b.rx * 0.38} ${b.y - b.ry * 0.38})`}
          />
        </g>
      ))}
      {/* Nœud du bouquet */}
      <path d="M 200 334 C 176 318, 166 346, 196 340 Z" fill={c.c} />
      <path d="M 204 334 C 228 318, 238 346, 208 340 Z" fill={c.c} />
      <circle cx={202} cy={336} r={7} fill={c.cDark} />
      <path d="M 198 340 L 186 372 M 206 340 L 220 370" stroke={c.c} strokeWidth={6} strokeLinecap="round" />
    </svg>
  );
};

/** « Faire sourire » : un grand visage qui cligne des yeux et sourit de plus en plus. */
export const Smiley: React.FC<IlluProps & { open: number }> = ({ c, t, size, open }) => {
  // Clignement bref toutes les ~2,6 s.
  const blinkPhase = (t + 1.9) % 2.6;
  const blink = blinkPhase < 0.14 ? 0.12 : 1;
  const o = Math.max(0, Math.min(1, open));
  const topY = 236 - 6 * o;
  const bottomY = 252 + 88 * o;
  return (
    <svg width={size} height={size} viewBox="0 0 400 400">
      <circle cx={206} cy={208} r={172} fill={c.bDark} />
      <circle cx={196} cy={196} r={168} fill={c.b} />
      <ellipse cx={128} cy={112} rx={34} ry={20} fill={c.white} opacity={0.45} transform="rotate(-35 128 112)" />
      {[140, 256].map((x) => (
        <g key={x} transform={`translate(${x} 170) scale(1 ${blink})`}>
          <ellipse cx={0} cy={0} rx={22} ry={32} fill={c.ink} />
          <circle cx={7} cy={-11} r={8} fill={c.white} />
        </g>
      ))}
      <ellipse cx={104} cy={240} rx={30} ry={18} fill={c.blush} />
      <ellipse cx={292} cy={240} rx={30} ry={18} fill={c.blush} />
      <path
        d={`M 116 232 Q 198 ${topY + 20} 280 232 Q 198 ${bottomY + 30 * o} 116 232 Z`}
        fill={c.ink}
        stroke={c.ink}
        strokeWidth={14}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {o > 0.35 ? (
        <ellipse cx={198} cy={232 + (bottomY - 232) * 0.78} rx={46 * o} ry={20 * o} fill={c.blush} opacity={0.95} />
      ) : null}
    </svg>
  );
};

/** « Créer des souvenirs » : un appareil photo instantané qui flashe et imprime une photo. */
export const Camera: React.FC<IlluProps & { flash: number; print: number }> = ({ c, t, size, flash, print }) => {
  const photoY = 214 + 118 * Math.max(0, Math.min(1, print));
  return (
    <svg width={size} height={size} viewBox="0 0 400 400">
      {flash > 0.01 ? (
        <polygon points={starPoints(122, 150, 150 * flash, 0.42, t)} fill={c.white} opacity={Math.min(1, flash * 1.4)} />
      ) : null}
      {/* Photo qui sort sous l'appareil */}
      <g transform={`rotate(${-4 * print} 200 ${photoY + 70})`}>
        <rect x={128} y={photoY} width={144} height={156} rx={8} fill={c.white} stroke={c.aLight} strokeWidth={3} />
        <rect x={140} y={photoY + 12} width={120} height={106} rx={4} fill={c.bLight} />
        <circle cx={226} cy={photoY + 44} r={16} fill={c.c} />
        <path d={`M 140 ${photoY + 118} L 140 ${photoY + 96} Q 178 ${photoY + 60} 212 ${photoY + 96} Q 236 ${photoY + 80} 260 ${photoY + 100} L 260 ${photoY + 118} Z`} fill={c.a} />
      </g>
      {/* Boîtier */}
      <rect x={128} y={92} width={84} height={50} rx={14} fill={c.aDark} />
      <rect x={272} y={104} width={44} height={30} rx={10} fill={c.c} />
      <rect x={62} y={132} width={276} height={196} rx={40} fill={c.aDark} />
      <rect x={62} y={124} width={276} height={188} rx={40} fill={c.a} />
      <rect x={62} y={250} width={276} height={16} fill={c.aDark} opacity={0.35} />
      <rect x={90} y={150} width={50} height={32} rx={9} fill={c.white} opacity={0.55 + 0.45 * flash} />
      <circle cx={200} cy={226} r={80} fill={c.white} />
      <circle cx={200} cy={226} r={64} fill={c.ink} />
      <circle cx={200} cy={226} r={44} fill={c.aDark} />
      <circle cx={200} cy={226} r={26} fill={c.ink} />
      <circle cx={180} cy={205} r={13} fill={c.white} opacity={0.85} />
      <circle cx={218} cy={246} r={6} fill={c.white} opacity={0.6} />
      <circle cx={306} cy={152} r={10} fill={c.c} />
    </svg>
  );
};

/** Petit personnage rond (corps en goutte, visage souriant). */
const Buddy: React.FC<{
  x: number;
  y: number;
  scale: number;
  fill: string;
  shade: string;
  c: IlluColors;
  arms?: "up" | "none";
}> = ({ x, y, scale, fill, shade, c, arms = "none" }) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`}>
    {arms === "up" ? (
      <path d="M -30 -36 L -52 -80 M 30 -36 L 52 -80" stroke={fill} strokeWidth={16} strokeLinecap="round" />
    ) : null}
    <path d="M -42 0 L -42 -40 Q -42 -78 0 -78 Q 42 -78 42 -40 L 42 0 Z" fill={shade} />
    <path d="M -38 0 L -38 -42 Q -38 -74 0 -74 Q 38 -74 38 -42 L 38 0 Z" fill={fill} />
    <circle cx={0} cy={-112} r={36} fill={shade} />
    <circle cx={-2} cy={-114} r={33} fill={fill} />
    <circle cx={-12} cy={-118} r={5} fill={c.ink} />
    <circle cx={10} cy={-118} r={5} fill={c.ink} />
    <path d="M -14 -102 Q -1 -90 12 -102" stroke={c.ink} strokeWidth={5} fill="none" strokeLinecap="round" />
    <ellipse cx={-14} cy={-128} rx={8} ry={5} fill={c.white} opacity={0.45} transform="rotate(-30 -14 -128)" />
  </g>
);

/** « Rassembler » : une ronde d'amis qui se tiennent la main et sautillent. */
export const Friends: React.FC<IlluProps> = ({ c, t, size }) => {
  const people = [
    { x: 64, s: 1.12, fill: c.b, shade: c.bDark },
    { x: 154, s: 0.86, fill: c.c, shade: c.cDark },
    { x: 246, s: 0.86, fill: c.a, shade: c.aDark },
    { x: 336, s: 1.12, fill: c.b, shade: c.bDark },
  ].map((p, i) => ({ ...p, dy: -Math.abs(wave(t, 1.1, (i * Math.PI) / 2)) * 16 }));
  const base = 340;
  const heartScale = 1 + 0.08 * wave(t, 0.8);
  return (
    <svg width={size} height={size} viewBox="0 0 400 400">
      <ellipse cx={200} cy={base + 6} rx={180} ry={16} fill={c.ink} opacity={0.12} />
      {people.slice(0, -1).map((p, i) => {
        const q = people[i + 1];
        const y1 = base + p.dy - 50 * p.s;
        const y2 = base + q.dy - 50 * q.s;
        const mx = (p.x + q.x) / 2;
        const my = (y1 + y2) / 2 + 22;
        return (
          <g key={i}>
            <path d={`M ${p.x + 26 * p.s} ${y1} Q ${mx - 12} ${my} ${mx} ${my}`} stroke={p.fill} strokeWidth={15} fill="none" strokeLinecap="round" />
            <path d={`M ${q.x - 26 * q.s} ${y2} Q ${mx + 12} ${my} ${mx} ${my}`} stroke={q.fill} strokeWidth={15} fill="none" strokeLinecap="round" />
            <circle cx={mx} cy={my} r={10} fill={c.white} />
          </g>
        );
      })}
      {people.map((p, i) => (
        <Buddy key={i} x={p.x} y={base + p.dy} scale={p.s} fill={p.fill} shade={p.shade} c={c} />
      ))}
      <g transform={`translate(200 70) scale(${heartScale}) translate(-200 -70)`}>
        <path d={heartPath(200, 70, 44)} fill={c.cDark} transform="translate(4 5)" />
        <path d={heartPath(200, 70, 44)} fill={c.c} />
        <ellipse cx={180} cy={56} rx={9} ry={6} fill={c.white} opacity={0.6} transform="rotate(-30 180 56)" />
      </g>
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Scène « APEL »

/** L'école avec son drapeau, des cœurs qui s'envolent et une famille devant. */
export const School: React.FC<IlluProps & { familyIn: number[] }> = ({ c, t, size, familyIn }) => {
  const flagWave = wave(t, 1.2) * 6;
  const hearts = [0, 1, 2].map((i) => {
    const cycle = (t / 2.4 + i / 3) % 1;
    return { x: 200 + i * 100 + wave(t, 1.6, i) * 12, y: 150 - cycle * 130, o: Math.sin(cycle * Math.PI), s: 18 + (i % 2) * 6 };
  });
  const family = [
    { x: 58, s: 0.9, fill: c.a, shade: c.aDark },
    { x: 142, s: 0.66, fill: c.c, shade: c.cDark },
    { x: 458, s: 0.66, fill: c.b, shade: c.bDark },
    { x: 542, s: 0.9, fill: c.c, shade: c.cDark },
  ];
  return (
    <svg width={size} height={size * (440 / 600)} viewBox="0 0 600 440">
      <ellipse cx={300} cy={392} rx={290} ry={34} fill={c.bLight} />
      {/* Drapeau */}
      <line x1={300} y1={92} x2={300} y2={8} stroke={c.ink} strokeWidth={7} strokeLinecap="round" />
      <path
        d={`M 302 10 Q 344 ${2 + flagWave} 382 ${22 - flagWave * 0.5} Q 350 ${36 + flagWave * 0.4} 382 ${62 + flagWave} Q 344 ${58 - flagWave} 302 64 Z`}
        fill={c.c}
      />
      {/* Bâtiment */}
      <rect x={126} y={196} width={360} height={190} rx={12} fill={c.aLight} />
      <rect x={116} y={186} width={368} height={196} rx={12} fill={c.white} />
      <polygon points="96,204 300,90 504,204" fill={c.bDark} stroke={c.bDark} strokeWidth={18} strokeLinejoin="round" />
      <polygon points="96,194 300,82 504,194" fill={c.b} stroke={c.b} strokeWidth={18} strokeLinejoin="round" />
      <circle cx={300} cy={150} r={30} fill={c.white} />
      <path d="M 300 132 L 300 150 L 314 158" stroke={c.ink} strokeWidth={6} fill="none" strokeLinecap="round" />
      {/* Fenêtres */}
      {[150, 212, 346, 408].map((x) =>
        [226, 296].map((y) => (
          <g key={`${x}-${y}`}>
            <rect x={x} y={y} width={46} height={46} rx={8} fill={c.aLight} />
            <rect x={x} y={y + 30} width={46} height={16} rx={6} fill={c.a} opacity={0.25} />
            <path d={`M ${x + 23} ${y} L ${x + 23} ${y + 46} M ${x} ${y + 23} L ${x + 46} ${y + 23}`} stroke={c.white} strokeWidth={5} />
          </g>
        )),
      )}
      {/* Porte */}
      <path d="M 266 382 L 266 300 Q 266 266 300 266 Q 334 266 334 300 L 334 382 Z" fill={c.a} />
      <circle cx={318} cy={328} r={5} fill={c.white} />
      {hearts.map((h, i) => (
        <path key={i} d={heartPath(h.x, h.y, h.s)} fill={i === 1 ? c.a : c.c} opacity={h.o} />
      ))}
      {family.map((p, i) => {
        const k = familyIn[i] ?? 1;
        return (
          <g key={i} opacity={Math.min(1, k * 1.5)}>
            <Buddy x={p.x} y={400 + (1 - k) * 40 - Math.abs(wave(t, 1.3, i)) * 6} scale={p.s * (0.5 + 0.5 * k)} fill={p.fill} shade={p.shade} c={c} />
          </g>
        );
      })}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Petites icônes (cartes « temps forts », chiffres)

export type BadgeIconKind =
  | "star"
  | "heart"
  | "gift"
  | "bus"
  | "book"
  | "ball"
  | "music"
  | "sun"
  | "tree"
  | "cake"
  | "people"
  | "coin"
  | "calendar";

const KEYWORDS: [BadgeIconKind, RegExp][] = [
  ["tree", /no[eë]l|sapin/i],
  ["bus", /sortie|voyage|visite|excursion|classe (verte|de neige|de mer|d[ée]couverte)|transport|mus[ée]e|\bcar\b|bus/i],
  ["book", /livre|biblioth|lecture|bcd|dictionnaire|manuel|conte/i],
  ["ball", /sport|ballon|jeu|cour\b|r[ée]cr[ée]|tournoi|olympiade|piscine|foot|v[ée]lo|course/i],
  ["music", /spectacle|chorale|musique|concert|danse|th[ée][aâ]tre|chant|carnaval|bal\b/i],
  ["cake", /g[aâ]teau|go[uû]ter|anniversaire|cr[eê]pe|galette|repas|petit[- ]d[ée]j|chocolat|p[aâ]tisserie/i],
  ["sun", /kermesse|f[eê]te|[ée]t[ée]|jardin|potager|pique[- ]nique|plein air|nature/i],
  ["gift", /cadeau|jouet|tombola|lot|mat[ée]riel|achat|offert|don/i],
  ["coin", /€|euro|budget|financ|argent|recette/i],
  ["people", /famille|parent|adh[ée]rent|membre|b[ée]n[ée]vole|enfant|[ée]l[eè]ve/i],
  ["calendar", /[ée]v[ée]nement|rendez-vous|date|ann[ée]e|mois/i],
];

/** Icône la plus parlante pour un texte, sinon une étoile ou un cœur. */
export function iconForText(text: string, fallbackIndex = 0): BadgeIconKind {
  for (const [kind, re] of KEYWORDS) if (re.test(text)) return kind;
  return fallbackIndex % 2 === 0 ? "star" : "heart";
}

export const BadgeIcon: React.FC<{ kind: BadgeIconKind; c: IlluColors; size: number; t?: number }> = ({
  kind,
  c,
  size,
  t = 0,
}) => {
  const body = (() => {
    switch (kind) {
      case "star":
        return (
          <>
            <polygon points={starPoints(52, 54, 44, 0.5)} fill={c.cDark} strokeLinejoin="round" stroke={c.cDark} strokeWidth={6} />
            <polygon points={starPoints(50, 51, 42, 0.5)} fill={c.c} strokeLinejoin="round" stroke={c.c} strokeWidth={6} />
            <ellipse cx={40} cy={38} rx={6} ry={4} fill={c.white} opacity={0.6} transform="rotate(-30 40 38)" />
          </>
        );
      case "heart":
        return (
          <>
            <path d={heartPath(52, 54, 38)} fill={c.cDark} />
            <path d={heartPath(50, 51, 38)} fill={c.c} />
            <ellipse cx={34} cy={36} rx={7} ry={4.5} fill={c.white} opacity={0.6} transform="rotate(-30 34 36)" />
          </>
        );
      case "gift":
        return (
          <>
            <rect x={16} y={44} width={68} height={46} rx={6} fill={c.a} />
            <rect x={12} y={32} width={76} height={18} rx={5} fill={c.aDark} />
            <rect x={44} y={32} width={12} height={58} fill={c.c} />
            <path d="M 50 32 C 30 10, 18 30, 48 32 M 50 32 C 70 10, 82 30, 52 32" stroke={c.c} strokeWidth={7} fill="none" strokeLinecap="round" />
          </>
        );
      case "bus":
        return (
          <>
            <rect x={10} y={24} width={80} height={54} rx={12} fill={c.b} />
            <rect x={10} y={62} width={80} height={16} rx={6} fill={c.bDark} />
            {[18, 40, 62].map((x) => (
              <rect key={x} x={x} y={32} width={18} height={18} rx={4} fill={c.white} />
            ))}
            <circle cx={28} cy={80} r={10} fill={c.ink} />
            <circle cx={72} cy={80} r={10} fill={c.ink} />
            <circle cx={28} cy={80} r={4} fill={c.white} />
            <circle cx={72} cy={80} r={4} fill={c.white} />
          </>
        );
      case "book":
        return (
          <>
            <path d="M 50 30 Q 30 20 10 26 L 10 80 Q 30 74 50 84 Z" fill={c.a} />
            <path d="M 50 30 Q 70 20 90 26 L 90 80 Q 70 74 50 84 Z" fill={c.aDark} />
            <path d="M 18 40 Q 30 36 42 40 M 18 52 Q 30 48 42 52 M 58 40 Q 70 36 82 40 M 58 52 Q 70 48 82 52" stroke={c.white} strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.8} />
          </>
        );
      case "ball":
        return (
          <g transform={`rotate(${t * 40} 50 52)`}>
            <circle cx={50} cy={52} r={40} fill={c.white} />
            <path d="M 50 12 A 40 40 0 0 1 90 52 L 50 52 Z" fill={c.a} />
            <path d="M 50 92 A 40 40 0 0 1 10 52 L 50 52 Z" fill={c.a} />
            <path d="M 90 52 A 40 40 0 0 1 50 92 L 50 52 Z" fill={c.c} />
            <circle cx={50} cy={52} r={40} fill="none" stroke={c.aDark} strokeWidth={4} />
          </g>
        );
      case "music":
        return (
          <>
            <path d="M 36 74 L 36 24 L 80 14 L 80 64" stroke={c.a} strokeWidth={8} fill="none" strokeLinejoin="round" />
            <path d="M 36 24 L 80 14 L 80 28 L 36 38 Z" fill={c.a} />
            <ellipse cx={26} cy={76} rx={14} ry={11} fill={c.a} transform="rotate(-20 26 76)" />
            <ellipse cx={70} cy={66} rx={14} ry={11} fill={c.a} transform="rotate(-20 70 66)" />
          </>
        );
      case "sun":
        return (
          <g transform={`rotate(${t * 30} 50 50)`}>
            {Array.from({ length: 10 }, (_, i) => (
              <rect key={i} x={46} y={2} width={8} height={18} rx={4} fill={c.cDark} transform={`rotate(${i * 36} 50 50)`} />
            ))}
            <circle cx={50} cy={50} r={27} fill={c.c} />
            <circle cx={42} cy={46} r={3.5} fill={c.ink} />
            <circle cx={58} cy={46} r={3.5} fill={c.ink} />
            <path d="M 40 56 Q 50 66 60 56" stroke={c.ink} strokeWidth={3.5} fill="none" strokeLinecap="round" />
          </g>
        );
      case "tree":
        return (
          <>
            <rect x={44} y={76} width={12} height={16} fill={c.ink} opacity={0.7} />
            <polygon points="50,14 82,58 18,58" fill={c.a} strokeLinejoin="round" stroke={c.a} strokeWidth={6} />
            <polygon points="50,34 88,80 12,80" fill={c.aDark} strokeLinejoin="round" stroke={c.aDark} strokeWidth={6} />
            <polygon points={starPoints(50, 12, 10, 0.5)} fill={c.c} />
            <circle cx={36} cy={66} r={5} fill={c.c} />
            <circle cx={62} cy={50} r={5} fill={c.b} />
            <circle cx={60} cy={72} r={5} fill={c.white} />
          </>
        );
      case "cake":
        return (
          <>
            <rect x={16} y={48} width={68} height={40} rx={8} fill={c.b} />
            <path d="M 16 58 Q 25 68 33 58 Q 42 68 50 58 Q 59 68 67 58 Q 76 68 84 58 L 84 52 Q 84 46 78 46 L 22 46 Q 16 46 16 52 Z" fill={c.white} />
            <rect x={46} y={24} width={8} height={22} rx={3} fill={c.a} />
            <path d="M 50 8 Q 58 18 50 24 Q 42 18 50 8 Z" fill={c.c} />
          </>
        );
      case "people":
        return (
          <>
            <circle cx={30} cy={36} r={13} fill={c.b} />
            <path d="M 12 84 Q 12 54 30 54 Q 48 54 48 84 Z" fill={c.b} />
            <circle cx={70} cy={36} r={13} fill={c.a} />
            <path d="M 52 84 Q 52 54 70 54 Q 88 54 88 84 Z" fill={c.a} />
            <circle cx={50} cy={52} r={10} fill={c.c} />
            <path d="M 36 90 Q 36 66 50 66 Q 64 66 64 90 Z" fill={c.c} />
          </>
        );
      case "coin":
        return (
          <>
            <circle cx={53} cy={53} r={40} fill={c.cDark} />
            <circle cx={50} cy={50} r={40} fill={c.c} />
            <circle cx={50} cy={50} r={30} fill="none" stroke={c.white} strokeWidth={4} opacity={0.6} />
            <path d="M 62 36 A 17 17 0 1 0 62 64" stroke={c.white} strokeWidth={7} fill="none" strokeLinecap="round" />
            <path d="M 30 46 L 54 46 M 30 56 L 54 56" stroke={c.white} strokeWidth={6} strokeLinecap="round" />
          </>
        );
      case "calendar":
        return (
          <>
            <rect x={14} y={20} width={72} height={68} rx={10} fill={c.white} stroke={c.aLight} strokeWidth={3} />
            <rect x={14} y={20} width={72} height={20} rx={10} fill={c.a} />
            <rect x={14} y={30} width={72} height={10} fill={c.a} />
            <rect x={28} y={12} width={8} height={18} rx={4} fill={c.ink} />
            <rect x={64} y={12} width={8} height={18} rx={4} fill={c.ink} />
            <path d={heartPath(50, 62, 16)} fill={c.c} />
          </>
        );
    }
  })();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {body}
    </svg>
  );
};
