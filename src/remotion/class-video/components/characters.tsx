import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { darken, lighten, mix, parseColor, withAlpha } from "../colors";
import type { IlluColors } from "../theme";
import { beatFrames } from "../timeline";
import { snap } from "./motion";

/**
 * Personnages dessinés en SVG, style illustration « à plat » : parents,
 * enfants, enseignante. Aucun fichier externe.
 *
 * Le rendu web rastérise chaque <svg> et le met en cache tant que son
 * contenu ne change pas : chaque membre (jambe, bras, avant-bras, tête) est
 * donc un petit SVG figé, posé dans un <div> que l'on anime uniquement par
 * transformations CSS (rotation autour de l'épaule, du coude, du cou…).
 *
 * Les coordonnées sont en « unités » dans le cadre du personnage (260 de
 * large, pieds en bas) ; le tout est mis à l'échelle de `height` pixels.
 */

// ---------------------------------------------------------------------------
// Apparence

export const SKIN_TONES = ["#f6d5bf", "#ecbd98", "#d59d6e", "#b3794d", "#8b5739", "#5e3a27"] as const;
export const HAIR_COLORS = {
  black: "#221915",
  brown: "#4e3222",
  chestnut: "#7a4a2a",
  blond: "#c9a063",
  ginger: "#b0552e",
  grey: "#b8b5b0",
} as const;

export type HairStyle =
  | "short"
  | "side"
  | "buzz"
  | "bald"
  | "bob"
  | "long"
  | "bun"
  | "ponytail"
  | "curly"
  | "afro"
  | "pigtails"
  | "kid";

export type TopStyle = "tee" | "sweater" | "shirt" | "cardigan" | "dress" | "hoodie" | "blazer";

export type Look = {
  build: "adult" | "child";
  skin: string;
  hair: HairStyle;
  hairColor: string;
  /** Couleur principale du haut. */
  top: string;
  topStyle: TopStyle;
  /** Couleur secondaire : t-shirt sous le gilet, col, élastiques. */
  inner?: string;
  bottom: string;
  bottomStyle?: "pants" | "shorts" | "skirt";
  shoes: string;
  glasses?: boolean;
  beard?: boolean;
  /** Couleur du sac à dos (sortie scolaire). */
  backpack?: string;
  /** Couleur du badge porté en sautoir (enseignante). */
  lanyard?: string;
};

// ---------------------------------------------------------------------------
// Gabarits

type Build = {
  H: number;
  headCy: number;
  headScale: number;
  /** Ligne des épaules, demi-largeur aux épaules. */
  S: number;
  sh: number;
  hipY: number;
  hh: number;
  legW: number;
  legOff: number;
  ankleY: number;
  /** Largeur du bras, longueurs bras / avant-bras, rayon de la main. */
  AW: number;
  UL: number;
  FL: number;
  HR: number;
  skirtY: number;
};

const W = 260;
const CX = 130;

const BUILDS: Record<Look["build"], Build> = {
  adult: {
    H: 600,
    headCy: 90,
    headScale: 1,
    S: 158,
    sh: 58,
    hipY: 352,
    hh: 50,
    legW: 38,
    legOff: 21,
    ankleY: 580,
    AW: 30,
    UL: 98,
    FL: 86,
    HR: 15,
    skirtY: 468,
  },
  child: {
    H: 400,
    headCy: 64,
    headScale: 0.9,
    S: 124,
    sh: 42,
    hipY: 250,
    hh: 38,
    legW: 30,
    legOff: 17,
    ankleY: 384,
    AW: 24,
    UL: 64,
    FL: 56,
    HR: 12,
    skirtY: 302,
  },
};

const shoulder = (b: Build, side: -1 | 1) => ({ x: CX + side * (b.sh - 15), y: b.S + 17 });

// ---------------------------------------------------------------------------
// Tête (repère « tête » : centre du visage en 90,100, rayons 46 × 52)

const HX = 90;
const HY = 100;
const EYE_DX = 16;
const EYE_Y = 105;
const MOUTH_Y = 127;
const NECK_PIVOT = "90px 150px";

/** Cheveux derrière la tête (dessinés sous le buste). */
function hairBack(style: HairStyle, color: string): React.ReactNode {
  switch (style) {
    case "bob":
      return <path d="M36,100 C34,46 64,32 90,32 C116,32 146,46 144,100 L146,150 C146,160 138,164 130,162 L50,162 C42,164 34,160 34,150 Z" fill={color} />;
    case "long":
      return <path d="M36,100 C34,44 62,30 90,30 C118,30 146,44 144,100 L150,244 C151,258 142,266 130,264 L50,264 C38,266 29,258 30,244 Z" fill={color} />;
    case "ponytail":
      return <path d="M118,56 C162,58 170,120 154,176 C150,188 136,186 137,174 C142,132 136,96 110,78 Z" fill={color} />;
    case "curly":
      return (
        <g fill={color}>
          {[
            [48, 82, 26],
            [66, 54, 28],
            [96, 44, 30],
            [126, 58, 28],
            [140, 88, 25],
            [42, 112, 20],
            [141, 116, 19],
            [52, 136, 15],
            [132, 138, 15],
          ].map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
          ))}
        </g>
      );
    case "afro":
      return (
        <g fill={color}>
          <circle cx={90} cy={80} r={64} />
          {[
            [36, 62, 20],
            [60, 30, 22],
            [96, 20, 22],
            [128, 34, 22],
            [148, 66, 20],
            [34, 104, 18],
            [148, 104, 18],
          ].map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
          ))}
        </g>
      );
    case "pigtails":
      return (
        <g fill={color}>
          <ellipse cx={34} cy={112} rx={17} ry={22} />
          <ellipse cx={146} cy={112} rx={17} ry={22} />
        </g>
      );
    default:
      return null;
  }
}

/** Cheveux devant (frange, calotte), dessinés sur le visage. */
function hairFront(style: HairStyle, color: string, tie: string): React.ReactNode {
  switch (style) {
    case "short":
      return <path d="M44,102 C40,52 68,39 92,40 C118,41 142,54 136,102 C132,82 118,70 96,71 C72,71 52,80 44,102 Z" fill={color} />;
    case "kid":
      return (
        <g fill={color}>
          <path d="M43,104 C38,52 66,38 92,39 C120,40 144,54 137,104 C132,84 120,74 104,72 C92,80 70,80 58,74 C50,82 46,92 43,104 Z" />
          <path d="M84,42 C88,28 100,24 108,30 C100,32 96,38 96,44 Z" />
        </g>
      );
    case "side":
      return <path d="M43,104 C35,50 64,33 96,35 C127,37 147,56 137,104 C134,84 127,74 117,69 C100,78 74,76 60,66 C52,76 46,88 43,104 Z" fill={color} />;
    case "buzz":
      return <path d="M45,98 C44,56 68,45 92,45 C116,45 138,56 135,98 C130,78 116,67 92,67 C68,67 52,78 45,98 Z" fill={color} opacity={0.9} />;
    case "bald":
      return (
        <g fill={color}>
          <path d="M44,106 C43,90 47,80 57,76 L58,108 Z" />
          <path d="M136,106 C137,90 133,80 123,76 L122,108 Z" />
        </g>
      );
    case "bob":
      return <path d="M40,150 C33,62 60,36 92,36 C124,36 150,60 142,150 L131,150 C135,112 131,88 120,76 C104,85 76,85 62,74 C52,90 48,116 50,150 Z" fill={color} />;
    case "long":
      return <path d="M42,134 C35,60 62,34 90,34 C118,34 146,60 138,134 C136,98 128,80 112,72 C104,70 96,74 90,82 C84,74 76,70 68,72 C52,80 44,100 42,134 Z" fill={color} />;
    case "bun":
    case "ponytail":
      return (
        <g fill={color}>
          <path d="M44,104 C40,54 66,41 90,41 C114,41 140,54 136,104 C132,84 116,70 90,70 C64,70 48,84 44,104 Z" />
          {style === "bun" ? <circle cx={90} cy={32} r={21} /> : null}
        </g>
      );
    case "curly":
      return (
        <g fill={color}>
          {[
            [56, 72, 17],
            [74, 62, 17],
            [95, 59, 18],
            [116, 63, 17],
            [131, 76, 15],
          ].map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
          ))}
        </g>
      );
    case "afro":
      return <path d="M44,98 C44,64 64,54 90,54 C116,54 136,64 136,98 C128,80 110,74 90,74 C70,74 52,80 44,98 Z" fill={color} />;
    case "pigtails":
      return (
        <g>
          <path d="M44,104 C40,54 66,40 90,40 C114,40 140,54 136,104 C132,84 118,72 94,70 L90,58 L86,70 C62,72 48,84 44,104 Z" fill={color} />
          <circle cx={46} cy={100} r={7} fill={tie} />
          <circle cx={134} cy={100} r={7} fill={tie} />
        </g>
      );
  }
}

/** Visage : oreilles, ovale, sourcils, joues, barbe et cheveux de devant. */
const HeadSvg: React.FC<{ look: Look; tie: string }> = ({ look, tie }) => {
  const shade = darken(look.skin, 0.1);
  const brow = darken(look.hairColor, 0.15);
  return (
    <svg width={180} height={200} viewBox="0 0 180 200" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <circle cx={HX - 45} cy={110} r={10} fill={shade} />
      <circle cx={HX + 45} cy={110} r={10} fill={shade} />
      <ellipse cx={HX} cy={HY} rx={46} ry={52} fill={look.skin} />
      <path d={`M${HX + 18},${HY - 47} A46,52 0 0 1 ${HX + 18},${HY + 47} A38,50 0 0 0 ${HX + 18},${HY - 47} Z`} fill={shade} opacity={0.35} />
      <circle cx={HX - 27} cy={121} r={7.5} fill="#f08a7e" opacity={0.28} />
      <circle cx={HX + 27} cy={121} r={7.5} fill="#f08a7e" opacity={0.28} />
      {look.beard ? (
        <path d="M45,108 C47,148 70,160 90,160 C110,160 133,148 135,108 C129,124 116,130 104,126 C98,122 82,122 76,126 C64,130 51,124 45,108 Z" fill={look.hairColor} />
      ) : null}
      <rect x={HX - EYE_DX - 8} y={90} width={15} height={4} rx={2} fill={brow} opacity={0.85} />
      <rect x={HX + EYE_DX - 7} y={90} width={15} height={4} rx={2} fill={brow} opacity={0.85} />
      {hairFront(look.hair, look.hairColor, tie)}
      {look.hair !== "bald" && look.hair !== "buzz" ? (
        <path d="M62,58 Q78,46 98,46" stroke={lighten(look.hairColor, 0.28)} strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.55} />
      ) : null}
    </svg>
  );
};

const FaceInk = "#2b2220";

/** Bouche souriante fermée. */
const SmileSvg = () => (
  <svg width={30} height={16} viewBox="-15 -4 30 16" style={{ position: "absolute", left: 0, top: 0 }}>
    <path d="M-9,0 Q0,8 9,0" stroke={FaceInk} strokeWidth={3.4} fill="none" strokeLinecap="round" />
  </svg>
);

/** Bouche ouverte (parole, rire) : demi-disque sombre et langue. */
const OpenMouthSvg = () => (
  <svg width={28} height={20} viewBox="-14 -3 28 20" style={{ position: "absolute", left: 0, top: 0 }}>
    <path d="M-11,-1 Q0,1 11,-1 Q10,15 0,15 Q-10,15 -11,-1 Z" fill="#5b2424" />
    <ellipse cx={0} cy={11} rx={6} ry={3.2} fill="#e0797a" />
  </svg>
);

/** Yeux plissés de bonheur (rire). */
const HappyEyesSvg = () => (
  <svg width={60} height={16} viewBox="-30 -8 60 16" style={{ position: "absolute", left: 0, top: 0 }}>
    <path d={`M${-EYE_DX - 6},3 Q${-EYE_DX},-5 ${-EYE_DX + 6},3`} stroke={FaceInk} strokeWidth={3.4} fill="none" strokeLinecap="round" />
    <path d={`M${EYE_DX - 6},3 Q${EYE_DX},-5 ${EYE_DX + 6},3`} stroke={FaceInk} strokeWidth={3.4} fill="none" strokeLinecap="round" />
  </svg>
);

const GlassesSvg = () => (
  <svg width={80} height={24} viewBox="-40 -12 80 24" style={{ position: "absolute", left: HX - 40, top: EYE_Y - 12 }}>
    <rect x={-EYE_DX - 12} y={-9} width={24} height={18} rx={7} fill="#ffffff" fillOpacity={0.18} stroke={FaceInk} strokeWidth={3} />
    <rect x={EYE_DX - 12} y={-9} width={24} height={18} rx={7} fill="#ffffff" fillOpacity={0.18} stroke={FaceInk} strokeWidth={3} />
    <path d="M-4,-2 Q0,-5 4,-2" stroke={FaceInk} strokeWidth={3} fill="none" />
  </svg>
);

const NoseSvg: React.FC<{ skin: string }> = ({ skin }) => (
  <svg width={14} height={10} viewBox="-7 -5 14 10" style={{ position: "absolute", left: HX - 7, top: 115 }}>
    <path d="M-4,-1 Q0,4 4,-1" stroke={darken(skin, 0.22)} strokeWidth={3} fill="none" strokeLinecap="round" />
  </svg>
);

// ---------------------------------------------------------------------------
// Buste, jambes, bras

const TorsoSvg: React.FC<{ look: Look; b: Build }> = ({ look, b }) => {
  const r = b.sh * 0.52;
  const top = look.top;
  const topDark = darken(top, 0.12);
  const inner = look.inner ?? lighten(top, 0.75);
  const neckTop = b.headCy + 30 * b.headScale;
  const L = CX - b.sh;
  const R = CX + b.sh;
  const body = `M${L + r},${b.S} L${R - r},${b.S} Q${R},${b.S} ${R},${b.S + r} L${CX + b.hh},${b.hipY - 10} Q${CX + b.hh},${b.hipY} ${CX + b.hh - 10},${b.hipY} L${CX - b.hh + 10},${b.hipY} Q${CX - b.hh},${b.hipY} ${CX - b.hh},${b.hipY - 10} L${L},${b.S + r} Q${L},${b.S} ${L + r},${b.S} Z`;
  const neckW = 13 * b.headScale;
  const bottomStyle = look.topStyle === "dress" ? "dress" : (look.bottomStyle ?? "pants");
  const skirt = `M${CX - b.hh + 2},${b.hipY - 16} L${CX + b.hh - 2},${b.hipY - 16} L${CX + b.hh + 24},${b.skirtY - 8} Q${CX + b.hh + 26},${b.skirtY} ${CX + b.hh + 16},${b.skirtY} L${CX - b.hh - 16},${b.skirtY} Q${CX - b.hh - 26},${b.skirtY} ${CX - b.hh - 24},${b.skirtY - 8} Z`;
  const vDepth = (b.hipY - b.S) * 0.45;
  return (
    <svg width={W} height={b.H} viewBox={`0 0 ${W} ${b.H}`} style={{ position: "absolute", left: 0, top: 0 }}>
      {/* Bassin (couvre le haut des jambes qui pivotent). */}
      {bottomStyle === "pants" || bottomStyle === "shorts" ? (
        <rect x={CX - b.hh} y={b.hipY - 40} width={b.hh * 2} height={62} rx={16} fill={look.bottom} />
      ) : null}
      {look.topStyle === "hoodie" ? (
        <ellipse cx={CX} cy={b.S + 4} rx={b.sh * 0.62} ry={b.sh * 0.3} fill={topDark} />
      ) : null}
      {look.backpack ? (
        <>
          <rect x={L - 6} y={b.S + 18} width={16} height={(b.hipY - b.S) * 0.7} rx={8} fill={darken(look.backpack, 0.15)} />
          <rect x={R - 10} y={b.S + 18} width={16} height={(b.hipY - b.S) * 0.7} rx={8} fill={darken(look.backpack, 0.15)} />
        </>
      ) : null}
      <rect x={CX - neckW} y={neckTop} width={neckW * 2} height={b.S - neckTop + 14} fill={look.skin} />
      <rect x={CX - neckW} y={neckTop} width={neckW * 2} height={10} fill={darken(look.skin, 0.1)} />
      {bottomStyle === "skirt" || bottomStyle === "dress" ? (
        <path d={skirt} fill={bottomStyle === "dress" ? top : look.bottom} />
      ) : null}
      <path d={body} fill={top} />
      {/* Modelé : flanc droit dans l'ombre, épaule gauche dans la lumière. */}
      <path d={`M${R - 4},${b.S + r * 0.7} Q${R},${b.S + r} ${R},${b.S + r + 6} L${CX + b.hh},${b.hipY - 10} Q${CX + b.hh},${b.hipY} ${CX + b.hh - 10},${b.hipY} L${CX + b.hh - 22},${b.hipY} L${R - 18},${b.S + r + 10} Z`} fill={darken(top, 0.14)} opacity={0.75} />
      <path d={`M${L + r * 0.6},${b.S + 3} Q${L + 6},${b.S + 6} ${L + 5},${b.S + r} L${L + 14},${b.S + r + 4} Q${L + 16},${b.S + 14} ${L + r * 0.9},${b.S + 9} Z`} fill={lighten(top, 0.22)} opacity={0.7} />
      {/* Détails selon le vêtement. */}
      {look.topStyle === "tee" || look.topStyle === "dress" || look.topStyle === "sweater" || look.topStyle === "hoodie" ? (
        <path d={`M${CX - neckW - 5},${b.S} Q${CX},${b.S + 20} ${CX + neckW + 5},${b.S} Z`} fill={look.skin} />
      ) : null}
      {look.topStyle === "sweater" ? (
        <rect x={CX - b.hh} y={b.hipY - 16} width={b.hh * 2} height={16} rx={6} fill={topDark} />
      ) : null}
      {look.topStyle === "hoodie" ? (
        <>
          <path d={`M${CX - b.hh * 0.62},${b.hipY - 20} L${CX + b.hh * 0.62},${b.hipY - 20} L${CX + b.hh * 0.5},${b.hipY - 62} L${CX - b.hh * 0.5},${b.hipY - 62} Z`} fill={topDark} />
          <path d={`M${CX - 8},${b.S + 8} L${CX - 10},${b.S + 44} M${CX + 8},${b.S + 8} L${CX + 10},${b.S + 44}`} stroke={inner} strokeWidth={4} strokeLinecap="round" />
        </>
      ) : null}
      {look.topStyle === "shirt" ? (
        <>
          <path d={`M${CX - neckW - 6},${b.S - 2} L${CX},${b.S + 20} L${CX - 4},${b.S + 30} L${CX - neckW - 14},${b.S + 12} Z`} fill={inner} />
          <path d={`M${CX + neckW + 6},${b.S - 2} L${CX},${b.S + 20} L${CX + 4},${b.S + 30} L${CX + neckW + 14},${b.S + 12} Z`} fill={inner} />
          {[0.3, 0.55, 0.8].map((k) => (
            <circle key={k} cx={CX} cy={b.S + (b.hipY - b.S) * k} r={3} fill={topDark} />
          ))}
        </>
      ) : null}
      {look.topStyle === "cardigan" || look.topStyle === "blazer" ? (
        <>
          <path d={`M${CX - neckW - 8},${b.S} L${CX + neckW + 8},${b.S} L${CX + 6},${b.S + vDepth} L${CX - 6},${b.S + vDepth} Z`} fill={inner} />
          <path d={`M${CX - neckW - 4},${b.S} Q${CX},${b.S + 14} ${CX + neckW + 4},${b.S} Z`} fill={look.skin} />
          <rect x={CX - 3} y={b.S + vDepth} width={6} height={b.hipY - b.S - vDepth} fill={topDark} />
          {look.topStyle === "blazer" ? (
            <>
              <path d={`M${CX - neckW - 8},${b.S} L${CX - 4},${b.S + vDepth} L${CX - neckW - 20},${b.S + vDepth * 0.45} Z`} fill={topDark} />
              <path d={`M${CX + neckW + 8},${b.S} L${CX + 4},${b.S + vDepth} L${CX + neckW + 20},${b.S + vDepth * 0.45} Z`} fill={topDark} />
            </>
          ) : (
            [0.62, 0.8].map((k) => <circle key={k} cx={CX + 10} cy={b.S + (b.hipY - b.S) * k} r={3.2} fill={topDark} />)
          )}
        </>
      ) : null}
      {look.backpack ? (
        <>
          <path d={`M${L + 14},${b.S + 4} Q${L + 22},${b.S + 50} ${L + 18},${b.S + 90}`} stroke={darken(look.backpack, 0.1)} strokeWidth={9} fill="none" strokeLinecap="round" />
          <path d={`M${R - 14},${b.S + 4} Q${R - 22},${b.S + 50} ${R - 18},${b.S + 90}`} stroke={darken(look.backpack, 0.1)} strokeWidth={9} fill="none" strokeLinecap="round" />
        </>
      ) : null}
      {look.lanyard ? (
        <>
          <path d={`M${CX - neckW},${b.S} L${CX},${b.S + 70} L${CX + neckW},${b.S}`} stroke={look.lanyard} strokeWidth={4} fill="none" />
          <rect x={CX - 14} y={b.S + 66} width={28} height={36} rx={5} fill="#ffffff" stroke={look.lanyard} strokeWidth={3} />
          <rect x={CX - 8} y={b.S + 76} width={16} height={4} rx={2} fill={look.lanyard} />
          <rect x={CX - 8} y={b.S + 86} width={11} height={4} rx={2} fill={mix(look.lanyard, "#ffffff", 0.5)} />
        </>
      ) : null}
    </svg>
  );
};

const LegSvg: React.FC<{ look: Look; b: Build; side: -1 | 1 }> = ({ look, b, side }) => {
  const w = b.legW;
  const boxW = w + 30;
  const c = boxW / 2;
  const len = b.ankleY - (b.hipY - 30);
  const bottomStyle = look.topStyle === "dress" ? "dress" : (look.bottomStyle ?? "pants");
  const legColor = bottomStyle === "pants" ? look.bottom : look.skin;
  const shoeH = w * 0.55;
  return (
    <svg width={boxW} height={len + shoeH} viewBox={`0 0 ${boxW} ${len + shoeH}`} style={{ position: "absolute", left: 0, top: 0 }}>
      <rect x={c - w / 2} y={0} width={w} height={len + 4} rx={w * 0.45} fill={side > 0 ? darken(legColor, 0.08) : legColor} />
      {bottomStyle === "shorts" ? <rect x={c - w / 2 - 1} y={0} width={w + 2} height={(b.hipY - b.S) * 0.55} rx={8} fill={look.bottom} /> : null}
      <rect x={c - w / 2 - 3 + side * 7} y={len - 4} width={w + 6} height={shoeH} rx={shoeH / 2} fill={look.shoes} />
    </svg>
  );
};

/** Segment de bras : haut (manche) ou avant-bras (avec la main). */
const ArmSegmentSvg: React.FC<{ width: number; length: number; color: string; sleeve?: { color: string; to: number }; hand?: { r: number; skin: string; cuff?: string } }> = ({
  width,
  length,
  color,
  sleeve,
  hand,
}) => {
  const extra = hand ? hand.r * 2 : 0;
  const h = length + width / 2 + extra;
  const boxW = Math.max(width, hand ? hand.r * 2 : 0) + 4;
  const x = (boxW - width) / 2;
  return (
    <svg width={boxW} height={h + 4} viewBox={`0 0 ${boxW} ${h + 4}`} style={{ position: "absolute", left: (width - boxW) / 2, top: 0 }}>
      <rect x={x} y={0} width={width} height={length + width / 2 + (hand ? 2 : 0)} rx={width / 2} fill={color} />
      {sleeve ? <rect x={x - 2} y={0} width={width + 4} height={sleeve.to} rx={width / 2} fill={sleeve.color} /> : null}
      {hand?.cuff ? <rect x={x} y={length - 4} width={width} height={10} rx={4} fill={hand.cuff} /> : null}
      {hand ? <circle cx={boxW / 2} cy={width / 2 + length} r={hand.r} fill={hand.skin} /> : null}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Objets tenus

export type HandItem = "balloon" | "heartBalloon" | "clipboard" | "mug" | "book" | "cupcake" | "pennant" | "heart" | "phone";
export type CarryItem = "box" | "tray";

/** Boîte de chaque objet tenu : taille et position de la main (ancre). */
const ITEM_BOX: Record<HandItem, { w: number; h: number; ax: number; ay: number }> = {
  balloon: { w: 120, h: 370, ax: 60, ay: 350 },
  heartBalloon: { w: 120, h: 370, ax: 60, ay: 350 },
  clipboard: { w: 84, h: 108, ax: 42, ay: 70 },
  book: { w: 70, h: 92, ax: 35, ay: 64 },
  mug: { w: 56, h: 52, ax: 26, ay: 30 },
  cupcake: { w: 56, h: 64, ax: 28, ay: 52 },
  pennant: { w: 80, h: 120, ax: 10, ay: 110 },
  heart: { w: 100, h: 100, ax: 50, ay: 88 },
  phone: { w: 50, h: 84, ax: 25, ay: 58 },
};

/** Objets tenus dans une main, dessinés avec la main en (0, 0). */
const HandItemSvg: React.FC<{ item: HandItem; c: IlluColors; color: string }> = ({ item, c, color }) => {
  switch (item) {
    case "balloon":
    case "heartBalloon":
      return (
        <svg width={120} height={370} viewBox="-60 -350 120 370" style={{ position: "absolute", left: 0, top: 0 }}>
          <path d="M0,0 C9,-70 -11,-150 0,-238" stroke={withAlpha(c.ink, 0.5)} strokeWidth={2.5} fill="none" />
          {item === "balloon" ? (
            <>
              <ellipse cx={0} cy={-292} rx={42} ry={52} fill={color} />
              <path d="M-7,-236 L7,-236 L0,-244 Z" fill={darken(color, 0.12)} />
              <ellipse cx={-15} cy={-312} rx={9} ry={15} fill="#ffffff" opacity={0.3} transform="rotate(-24 -15 -312)" />
            </>
          ) : (
            <>
              <path d="M0,-238 C-58,-274 -48,-330 -18,-330 C-6,-330 0,-320 0,-314 C0,-320 6,-330 18,-330 C48,-330 58,-274 0,-238 Z" fill={color} />
              <ellipse cx={-22} cy={-308} rx={7} ry={11} fill="#ffffff" opacity={0.3} transform="rotate(-30 -22 -308)" />
            </>
          )}
        </svg>
      );
    case "clipboard":
      return (
        <svg width={84} height={108} viewBox="-42 -70 84 108" style={{ position: "absolute", left: 0, top: 0 }}>
          <rect x={-38} y={-62} width={76} height={98} rx={8} fill={c.wood} />
          <rect x={-30} y={-52} width={60} height={80} rx={3} fill="#ffffff" />
          <rect x={-16} y={-68} width={32} height={14} rx={5} fill={c.stone} />
          {[-36, -24, -12, 0, 12].map((y, i) => (
            <rect key={y} x={-22} y={y} width={i % 2 ? 30 : 44} height={4} rx={2} fill={i === 0 ? color : "#d7dbe0"} />
          ))}
        </svg>
      );
    case "book":
      return (
        <svg width={70} height={92} viewBox="-35 -64 70 92" style={{ position: "absolute", left: 0, top: 0 }}>
          <rect x={-30} y={-60} width={60} height={82} rx={5} fill={color} />
          <rect x={-30} y={-60} width={9} height={82} rx={3} fill={darken(color, 0.15)} />
          <rect x={-12} y={-44} width={32} height={6} rx={3} fill="#ffffff" opacity={0.85} />
        </svg>
      );
    case "mug":
      return (
        <svg width={56} height={52} viewBox="-26 -30 56 52" style={{ position: "absolute", left: 0, top: 0 }}>
          <path d="M12,-18 C26,-18 26,2 12,2" stroke={darken(color, 0.1)} strokeWidth={5} fill="none" />
          <rect x={-18} y={-26} width={32} height={38} rx={6} fill={color} />
          <rect x={-18} y={-26} width={32} height={7} rx={3} fill={darken(color, 0.1)} />
        </svg>
      );
    case "cupcake":
      return (
        <svg width={56} height={64} viewBox="-28 -52 56 64" style={{ position: "absolute", left: 0, top: 0 }}>
          <path d="M-18,-14 L18,-14 L13,10 L-13,10 Z" fill={c.wood} />
          <path d="M-22,-14 C-24,-34 -8,-40 0,-44 C8,-40 24,-34 22,-14 Z" fill={lighten(color, 0.45)} />
          <circle cx={0} cy={-46} r={6} fill={c.b} />
        </svg>
      );
    case "pennant":
      return (
        <svg width={80} height={120} viewBox="-10 -110 80 120" style={{ position: "absolute", left: 0, top: 0 }}>
          <rect x={-3} y={-106} width={6} height={116} rx={3} fill={c.stone} />
          <path d="M3,-104 L62,-86 L3,-66 Z" fill={color} />
        </svg>
      );
    case "phone":
      return (
        <svg width={50} height={84} viewBox="-25 -58 50 84" style={{ position: "absolute", left: 0, top: 0 }}>
          <rect x={-19} y={-54} width={38} height={72} rx={8} fill="#1b2230" />
          <rect x={-15} y={-48} width={30} height={60} rx={5} fill={mix(color, "#ffffff", 0.35)} />
          <rect x={-10} y={-40} width={20} height={6} rx={3} fill="#ffffff" opacity={0.9} />
          <rect x={-10} y={-28} width={20} height={14} rx={3} fill="#ffffff" opacity={0.7} />
        </svg>
      );
    case "heart":
      return (
        <svg width={100} height={100} viewBox="-50 -88 100 100" style={{ position: "absolute", left: 0, top: 0 }}>
          <path d="M0,-8 C-52,-40 -46,-86 -18,-86 C-6,-86 0,-76 0,-70 C0,-76 6,-86 18,-86 C46,-86 52,-40 0,-8 Z" fill={color} />
        </svg>
      );
  }
};

/** Objets portés à deux mains, en repère du personnage. */
const CarrySvg: React.FC<{ item: CarryItem; b: Build; c: IlluColors; color: string }> = ({ item, b, c, color }) => {
  const k = b.H / 600;
  if (item === "box") {
    const w = 132 * k;
    const h = 100 * k;
    const x = CX - w / 2;
    const y = b.S + (b.hipY - b.S) * 0.74;
    return (
      <svg width={W} height={b.H} viewBox={`0 0 ${W} ${b.H}`} style={{ position: "absolute", left: 0, top: 0 }}>
        {/* Fanions qui dépassent du carton. */}
        <path d={`M${x + w * 0.2},${y + 4} L${x + w * 0.3},${y - 30 * k} L${x + w * 0.42},${y + 4} Z`} fill={c.b} />
        <path d={`M${x + w * 0.45},${y + 4} L${x + w * 0.56},${y - 36 * k} L${x + w * 0.68},${y + 4} Z`} fill={c.c} />
        <path d={`M${x + w * 0.62},${y + 4} L${x + w * 0.74},${y - 26 * k} L${x + w * 0.84},${y + 4} Z`} fill={color} />
        <rect x={x} y={y} width={w} height={h} rx={6 * k} fill="#d8b07c" />
        <rect x={x} y={y} width={w} height={16 * k} rx={4 * k} fill="#c59a64" />
        <rect x={CX - 10 * k} y={y} width={20 * k} height={h} fill="#e8c898" />
      </svg>
    );
  }
  const w = 200 * k;
  const y = b.S + (b.hipY - b.S) * 0.93;
  return (
    <svg width={W} height={b.H} viewBox={`0 0 ${W} ${b.H}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      {/* Plateau vu de face, gâteaux posés dessus. */}
      {[-60, -20, 20, 60].map((dx, i) => (
        <g key={dx}>
          <path d={`M${CX + dx * k - 16 * k},${y - 12 * k} L${CX + dx * k + 16 * k},${y - 12 * k} L${CX + dx * k + 12 * k},${y + 2} L${CX + dx * k - 12 * k},${y + 2} Z`} fill={c.wood} />
          <path d={`M${CX + dx * k - 19 * k},${y - 12 * k} C${CX + dx * k - 20 * k},${y - 30 * k} ${CX + dx * k - 6 * k},${y - 34 * k} ${CX + dx * k},${y - 37 * k} C${CX + dx * k + 6 * k},${y - 34 * k} ${CX + dx * k + 20 * k},${y - 30 * k} ${CX + dx * k + 19 * k},${y - 12 * k} Z`} fill={i % 2 ? lighten(c.b, 0.55) : lighten(color, 0.6)} />
          <circle cx={CX + dx * k} cy={y - 38 * k} r={5 * k} fill={i % 2 ? c.b : c.c} />
        </g>
      ))}
      <rect x={CX - w / 2} y={y} width={w} height={12 * k} rx={6 * k} fill={c.stone} />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Poses

/** Angles d'un bras (degrés). u : bras, f : avant-bras relatif. Positif = vers l'extérieur. */
export type ArmPose = { u: number; f: number };

export type Gesture = "idle" | "wave" | "present" | "point" | "carry" | "tray" | "hold" | "cheer" | "talk" | "balloon" | "raise";

type Side = "left" | "right";

const IDLE: ArmPose = { u: 6, f: -8 };

function gesturePose(gesture: Gesture, t: number, seed: number): { left: ArmPose; right: ArmPose; main: Side } {
  const osc = (period: number, amp: number, phase = 0) => Math.sin((t * 2 * Math.PI) / period + phase + seed) * amp;
  switch (gesture) {
    case "wave":
      return { left: IDLE, right: { u: 104 + osc(2.4, 3), f: 58 + osc(0.5, 18) }, main: "right" };
    case "present":
      return { left: IDLE, right: { u: 50 + osc(3.2, 2), f: 42 + osc(2.6, 4) }, main: "right" };
    case "point":
      return { left: IDLE, right: { u: 80 + osc(3, 1.5), f: 6 }, main: "right" };
    case "cheer":
      return { left: { u: 142 + osc(1.1, 5), f: 14 }, right: { u: 142 + osc(1.1, 5, 1.2), f: 14 }, main: "right" };
    case "hold":
      return { left: { u: 14, f: -112 }, right: IDLE, main: "left" };
    case "talk":
      return { left: { u: 8 + osc(3.1, 2), f: -14 + osc(2.3, 5) }, right: { u: 20 + osc(2.2, 5), f: -70 + osc(1.3, 14) }, main: "right" };
    case "balloon":
      return { left: IDLE, right: { u: 26, f: -52 + osc(2.8, 4) }, main: "right" };
    case "raise":
      // Main levée (vote, prise de parole).
      return { left: IDLE, right: { u: 166 + osc(1.6, 2), f: 6 }, main: "right" };
    case "carry":
    case "tray":
    case "idle":
      return { left: IDLE, right: IDLE, main: "right" };
  }
}

/**
 * Cinématique inverse à deux segments : angles CSS (bras, avant-bras relatif)
 * pour amener la main sur (tx, ty). Le coude part vers l'extérieur.
 */
function solveArm(px: number, py: number, tx: number, ty: number, a: number, b: number, out: -1 | 1): [number, number] {
  const dx = tx - px;
  const dy = ty - py;
  const d = Math.max(Math.abs(a - b) + 0.5, Math.min(a + b - 0.5, Math.hypot(dx, dy)));
  const base = Math.atan2(-dx, dy);
  const alpha = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  let best: [number, number] = [0, 0];
  let bestScore = -Infinity;
  for (const s of [1, -1]) {
    const up = base + s * alpha;
    const ex = px - a * Math.sin(up);
    const ey = py + a * Math.cos(up);
    const fa = Math.atan2(-(tx - ex), ty - ey);
    const score = out * ex;
    if (score > bestScore) {
      bestScore = score;
      best = [up, fa - up];
    }
  }
  return [(best[0] * 180) / Math.PI, (best[1] * 180) / Math.PI];
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpPose = (p: ArmPose, q: ArmPose, k: number): ArmPose => ({ u: lerp(p.u, q.u, k), f: lerp(p.f, q.f, k) });

/**
 * Point où deux personnages voisins (pieds en xa puis xb, même sol) peuvent
 * se donner la main : milieu horizontal, le plus bas possible à portée des deux.
 */
export function handMeetPoint(a: { look: Look; height: number; x: number }, b: { look: Look; height: number; x: number }, feetY: number) {
  const arm = (p: { look: Look; height: number; x: number }, side: -1 | 1) => {
    const g = BUILDS[p.look.build];
    const s = p.height / g.H;
    const sh = shoulder(g, side);
    return { x: p.x + (sh.x - CX) * s, y: feetY - (g.H - sh.y) * s, reach: (g.UL + g.FL + g.AW / 2 - 2) * s * 0.96 };
  };
  const ra = arm(a, 1);
  const rb = arm(b, -1);
  const mx = (a.x + b.x) / 2;
  const low = (r: { x: number; y: number; reach: number }) => r.y + Math.sqrt(Math.max(0, r.reach ** 2 - (mx - r.x) ** 2));
  return { x: mx, y: Math.min(low(ra), low(rb)) };
}

// ---------------------------------------------------------------------------
// Composant

export type Reach = { x: number; y: number; rel?: boolean };

export type CharacterProps = {
  look: Look;
  c: IlluColors;
  /** Position des pieds dans la scène (px). */
  x: number;
  y: number;
  /** Hauteur totale (px). */
  height: number;
  gesture?: Gesture;
  /** Image (relative à la scène) où le geste commence ; avant, pose de repos. */
  gestureAt?: number;
  /** Image où le geste se termine (retour au repos). */
  gestureUntil?: number;
  /** Bras qui fait le geste, côté écran (par défaut : celui du geste). */
  side?: Side;
  item?: HandItem;
  itemColor?: string;
  carry?: CarryItem;
  carryColor?: string;
  /**
   * Main posée sur un point de la scène (px) : se tenir la main, désigner.
   * Avec `rel`, le point est relatif aux pieds (suit la marche).
   */
  reachLeft?: Reach;
  reachRight?: Reach;
  /** Entrée : marche depuis `from` (x en px), ou apparition en fondu. */
  walk?: { from: number; at: number; duration: number };
  appear?: number;
  /** Regard : -1 (gauche) … 1 (droite). */
  gaze?: number;
  tilt?: number;
  mood?: "smile" | "laugh" | "talk";
  /** Plage (images) où le personnage parle, si mood = talk. */
  talkRange?: [number, number];
  seed?: number;
  shadow?: string;
  /** Amplitude (unités) du rebond sur les temps ; 0 = aucun. */
  groove?: number;
};

export const Character: React.FC<CharacterProps> = ({
  look,
  c,
  x,
  y,
  height,
  gesture = "idle",
  gestureAt = 0,
  gestureUntil,
  side,
  item,
  itemColor,
  carry,
  carryColor,
  reachLeft,
  reachRight,
  walk,
  appear,
  gaze = 0,
  tilt = 0,
  mood = "smile",
  talkRange,
  seed = 0,
  shadow = "rgba(20, 30, 40, 0.12)",
  groove = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = BUILDS[look.build];
  const s = height / b.H;
  const t = frame / fps;
  const phase = seed * 1.7;

  // Déplacement (marche) : la jambe avance au rythme de la distance parcourue.
  let px = x;
  let walking = 0;
  let stride = 0;
  if (walk) {
    const k = interpolate(frame, [walk.at, walk.at + walk.duration], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.quad),
    });
    px = lerp(walk.from, x, k);
    const dist = Math.abs(px - walk.from) / s;
    stride = (dist / (b.H * 0.3)) * Math.PI;
    const remaining = 1 - k;
    walking = frame < walk.at ? 0 : Math.min(1, remaining * 3);
  }
  // Apparition « pop » : le personnage jaillit du sol avec un léger dépassement.
  const popK = appear === undefined ? 1 : Math.max(0, snap(frame, fps, appear, 240, 17));
  const appearK = Math.min(1, popK * 3);
  const sc = 0.35 + 0.65 * popK;

  // Respiration, balancement, pas.
  const breathe = Math.sin(t * 1.7 + phase) * 1.6;
  const sway = Math.sin(t * 1.3 + phase) * 0.7;
  const stepBob = -Math.abs(Math.sin(stride)) * 7 * walking;
  const legSwing = Math.sin(stride) * 17 * walking;
  const laughing = mood === "laugh";
  const laughBob = laughing ? Math.abs(Math.sin(t * 9 + phase)) * -3 : 0;
  // Petit rebond sur chaque temps de la musique (personnages « dans le rythme »).
  const grooveBob = groove ? -Math.abs(Math.sin((Math.PI * frame) / beatFrames(fps))) * groove : 0;

  // Gestes : fondu du repos vers la pose du geste, puis retour éventuel.
  const inK = interpolate(frame, [gestureAt, gestureAt + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const outK =
    gestureUntil === undefined
      ? 0
      : interpolate(frame, [gestureUntil, gestureUntil + 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.inOut(Easing.cubic),
        });
  const gk = inK * (1 - outK);
  const g = gesturePose(gesture, t, phase);
  const swapSides = side !== undefined && side !== g.main;
  const idleL = { u: IDLE.u + Math.sin(t * 1.7 + phase) * 1.5 - legSwing * 0.6, f: IDLE.f };
  const idleR = { u: IDLE.u + Math.sin(t * 1.7 + phase + 1) * 1.5 + legSwing * 0.6, f: IDLE.f };
  const poseL = lerpPose(idleL, swapSides ? g.right : g.left, gk);
  const poseR = lerpPose(idleR, swapSides ? g.left : g.right, gk);

  // Angles CSS finaux (le bras gauche tourne dans le sens horaire vers l'extérieur).
  const shoulderL = shoulder(b, -1);
  const shoulderR = shoulder(b, 1);
  const handReach = b.FL + b.AW / 2 - 2;
  let rotL: [number, number] = [poseL.u, poseL.f];
  let rotR: [number, number] = [-poseR.u, -poseR.f];
  const toLocal = (p: Reach) => (p.rel ? { x: p.x / s + CX, y: p.y / s + b.H } : { x: (p.x - px) / s + CX, y: (p.y - y) / s + b.H });
  const carryTarget = (sideSign: -1 | 1) => {
    const k = b.H / 600;
    if (carry === "box") return { x: CX + sideSign * 68 * k, y: b.S + (b.hipY - b.S) * 1.02 };
    return { x: CX + sideSign * 82 * k, y: b.S + (b.hipY - b.S) * 0.98 };
  };
  if (reachLeft) {
    const p = toLocal(reachLeft);
    rotL = solveArm(shoulderL.x, shoulderL.y, p.x, p.y, b.UL, handReach, -1);
  } else if (carry) {
    const p = carryTarget(-1);
    rotL = solveArm(shoulderL.x, shoulderL.y, p.x, p.y, b.UL, handReach, -1);
  }
  if (reachRight) {
    const p = toLocal(reachRight);
    rotR = solveArm(shoulderR.x, shoulderR.y, p.x, p.y, b.UL, handReach, 1);
  } else if (carry) {
    const p = carryTarget(1);
    rotR = solveArm(shoulderR.x, shoulderR.y, p.x, p.y, b.UL, handReach, 1);
  }

  // Tête : inclinaison, rire, regard, clignement.
  const headTilt = tilt + Math.sin(t * 0.9 + phase) * 1.4 + (laughing ? Math.sin(t * 8 + phase) * 2.2 - 3 : 0);
  const blinkPeriod = Math.round(fps * (3.1 + (seed % 5) * 0.35));
  const blinkPos = (frame + Math.round(seed * 13)) % blinkPeriod;
  const blink = blinkPos < 5 ? [1, 0.45, 0.1, 0.45, 1][blinkPos] : 1;
  const talking = mood === "talk" && (!talkRange || (frame >= talkRange[0] && frame <= talkRange[1]));
  const mouthOpen = laughing ? 0.8 + Math.sin(t * 9 + phase) * 0.2 : talking ? 0.25 + 0.75 * Math.abs(Math.sin(t * 13 + phase)) * (0.6 + 0.4 * Math.sin(t * 2.1 + phase)) : 0;
  const gazeX = gaze * 6;

  const sleeveLong = look.topStyle !== "tee" && look.topStyle !== "dress";
  const tie = look.inner ?? c.b;
  const itemSide: Side = side ?? g.main;
  const hk = b.headScale;

  const arm = (sideName: Side, rot: [number, number]) => {
    const sh = sideName === "left" ? shoulderL : shoulderR;
    const FW = b.AW - 4;
    const cuff = sleeveLong ? darken(look.top, 0.1) : undefined;
    const holds = item && sideName === itemSide ? item : undefined;
    const behind = holds === "clipboard" || holds === "book" || holds === "cupcake" || holds === "phone";
    const upright = -(rot[0] + rot[1]);
    const itemSway = holds === "balloon" || holds === "heartBalloon" ? Math.sin(t * 1.4 + phase) * 4 - rot[1] * 0.08 : 0;
    const box = holds ? ITEM_BOX[holds] : null;
    const itemEl = holds && box ? (
      <div
        style={{
          position: "absolute",
          left: FW / 2 - box.ax,
          top: FW / 2 + b.FL - box.ay,
          width: box.w,
          height: box.h,
          transformOrigin: `${box.ax}px ${box.ay}px`,
          transform: `rotate(${upright + itemSway}deg) scale(${b.H / 600 + 0.25})`,
        }}
      >
        <HandItemSvg item={holds} c={c} color={itemColor ?? c.b} />
      </div>
    ) : null;
    return (
      <div
        style={{
          position: "absolute",
          left: sh.x - b.AW / 2,
          top: sh.y - b.AW / 2,
          width: b.AW,
          height: b.UL + b.AW,
          transformOrigin: `${b.AW / 2}px ${b.AW / 2}px`,
          transform: `rotate(${rot[0]}deg)`,
        }}
      >
        <ArmSegmentSvg
          width={b.AW}
          length={b.UL}
          color={sleeveLong ? look.top : look.skin}
          sleeve={sleeveLong ? undefined : { color: look.topStyle === "dress" ? look.top : look.top, to: b.UL * 0.5 }}
        />
        <div
          style={{
            position: "absolute",
            left: (b.AW - FW) / 2,
            top: b.AW / 2 + b.UL - FW / 2,
            width: FW,
            height: b.FL + FW,
            transformOrigin: `${FW / 2}px ${FW / 2}px`,
            transform: `rotate(${rot[1]}deg)`,
          }}
        >
          {behind ? itemEl : null}
          <ArmSegmentSvg width={FW} length={b.FL} color={sleeveLong ? look.top : look.skin} hand={{ r: b.HR, skin: look.skin, cuff }} />
          {behind ? null : itemEl}
        </div>
      </div>
    );
  };

  const leg = (sideSign: -1 | 1) => {
    const boxW = b.legW + 30;
    return (
      <div
        style={{
          position: "absolute",
          left: CX + sideSign * b.legOff - boxW / 2,
          top: b.hipY - 30,
          width: boxW,
          height: b.ankleY - b.hipY + 30,
          transformOrigin: `${boxW / 2}px 12px`,
          transform: `rotate(${sideSign * 1.5 + (sideSign < 0 ? legSwing : -legSwing)}deg)`,
        }}
      >
        <LegSvg look={look} b={b} side={sideSign} />
      </div>
    );
  };

  const headTop = b.headCy - 150 + 50 * hk;
  const headTransform = `rotate(${headTilt}deg) scale(${hk})`;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: W,
        height: b.H,
        transformOrigin: "0 0",
        transform: `translate(${px - CX * s * sc}px, ${y - b.H * s * sc}px) scale(${s * sc})`,
        opacity: appearK,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: CX - b.sh * 1.25,
          top: b.H - 14,
          width: b.sh * 2.5,
          height: 26,
          borderRadius: "50%",
          background: shadow,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: b.H,
          transformOrigin: `${CX}px ${b.H}px`,
          transform: `translateY(${breathe * 0.4 + stepBob + laughBob + grooveBob}px) rotate(${sway}deg)`,
        }}
      >
        {leg(-1)}
        {leg(1)}
        {/* Cheveux arrière : même transformation que la tête. */}
        <div
          style={{
            position: "absolute",
            left: CX - HX,
            top: headTop,
            width: 180,
            height: 320,
            transformOrigin: NECK_PIVOT,
            transform: headTransform,
          }}
        >
          <svg width={180} height={320} viewBox="0 0 180 320" style={{ position: "absolute", left: 0, top: 0 }}>
            {hairBack(look.hair, look.hairColor)}
          </svg>
        </div>
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: b.H, transform: `translateY(${breathe * -0.3}px)` }}>
          <TorsoSvg look={look} b={b} />
        </div>
        <div
          style={{
            position: "absolute",
            left: CX - HX,
            top: headTop + breathe * -0.5,
            width: 180,
            height: 200,
            transformOrigin: NECK_PIVOT,
            transform: headTransform,
          }}
        >
          <HeadSvg look={look} tie={tie} />
          <div style={{ position: "absolute", left: 0, top: 0, width: 180, height: 200, transform: `translateX(${gazeX}px)` }}>
            {[-1, 1].map((d) => (
              <div
                key={d}
                style={{
                  position: "absolute",
                  left: HX + d * EYE_DX - 5,
                  top: EYE_Y - 6,
                  width: 10,
                  height: 12,
                  borderRadius: "50%",
                  background: FaceInk,
                  transform: `scaleY(${blink})`,
                  opacity: laughing ? 0 : 1,
                }}
              />
            ))}
            <div style={{ position: "absolute", left: HX - 30, top: EYE_Y - 8, width: 60, height: 16, opacity: laughing ? 1 : 0 }}>
              <HappyEyesSvg />
            </div>
            <NoseSvg skin={look.skin} />
            <div style={{ position: "absolute", left: HX - 15, top: MOUTH_Y - 4, width: 30, height: 16, opacity: mouthOpen > 0 ? 0 : 1 }}>
              <SmileSvg />
            </div>
            <div
              style={{
                position: "absolute",
                left: HX - 14,
                top: MOUTH_Y - 4,
                width: 28,
                height: 20,
                opacity: mouthOpen > 0 ? 1 : 0,
                transformOrigin: "14px 3px",
                transform: `scaleY(${Math.max(0.2, mouthOpen)})`,
              }}
            >
              <OpenMouthSvg />
            </div>
            {look.glasses ? <GlassesSvg /> : null}
          </div>
        </div>
        {carry === "box" ? <CarrySvg item="box" b={b} c={c} color={carryColor ?? c.a} /> : null}
        {arm("left", rotL)}
        {arm("right", rotR)}
        {carry === "tray" ? <CarrySvg item="tray" b={b} c={c} color={carryColor ?? c.c} /> : null}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Distribution : une petite troupe récurrente, habillée aux couleurs du logo.

export type Cast = {
  /** Parents. */
  claire: Look;
  karim: Look;
  awa: Look;
  thomas: Look;
  lina: Look;
  papy: Look;
  /** Enseignante. */
  teacher: Look;
  /** Enfants. */
  lea: Look;
  noah: Look;
  jade: Look;
  hugo: Look;
  ines: Look;
};

/**
 * Troupe habillée aux couleurs du logo. Avec `bg` (fond de la scène), un
 * vêtement qui se confondrait avec le fond est éclairci pour rester visible.
 */
export function makeCast(c: IlluColors, bg?: string): Cast {
  const cast = baseCast(c);
  if (!bg) return cast;
  const ref = parseColor(bg);
  const near = (color: string) => {
    const p = parseColor(color);
    return Math.hypot(p.r - ref.r, p.g - ref.g, p.b - ref.b) < 110;
  };
  const visible = (color: string) => (near(color) ? mix(color, "#ffffff", 0.72) : color);
  const out = {} as Cast;
  for (const key of Object.keys(cast) as (keyof Cast)[]) {
    const look = cast[key];
    out[key] = { ...look, top: visible(look.top), bottom: visible(look.bottom) };
  }
  return out;
}

function baseCast(c: IlluColors): Cast {
  const denim = "#34425c";
  const navy = "#2c3547";
  const beige = "#cdb89a";
  const shoeDark = "#2b2b33";
  const shoeBrown = "#6b4a36";
  const soft = (color: string, k = 0.15) => mix(color, "#ffffff", k);
  return {
    claire: { build: "adult", skin: SKIN_TONES[1], hair: "bob", hairColor: HAIR_COLORS.chestnut, top: c.a, topStyle: "cardigan", inner: "#ffffff", bottom: navy, shoes: shoeDark },
    karim: { build: "adult", skin: SKIN_TONES[3], hair: "short", hairColor: HAIR_COLORS.black, beard: true, top: soft(c.b, 0.1), topStyle: "sweater", bottom: beige, shoes: shoeBrown },
    awa: { build: "adult", skin: SKIN_TONES[5], hair: "afro", hairColor: "#1b1411", top: soft(c.c, 0.05), topStyle: "tee", bottom: denim, shoes: "#f3f1ee" },
    thomas: { build: "adult", skin: SKIN_TONES[0], hair: "side", hairColor: HAIR_COLORS.blond, glasses: true, top: mix(c.a, "#ffffff", 0.7), topStyle: "shirt", inner: "#ffffff", bottom: "#3f4a5e", shoes: shoeBrown },
    lina: { build: "adult", skin: SKIN_TONES[2], hair: "long", hairColor: HAIR_COLORS.brown, top: mix(c.b, c.a, 0.35), topStyle: "dress", bottom: navy, shoes: shoeDark },
    papy: { build: "adult", skin: SKIN_TONES[1], hair: "bald", hairColor: HAIR_COLORS.grey, beard: true, glasses: true, top: c.stone, topStyle: "cardigan", inner: soft(c.c, 0.4), bottom: "#4b4f58", shoes: shoeBrown },
    teacher: { build: "adult", skin: SKIN_TONES[4], hair: "bun", hairColor: "#2a1a12", glasses: true, top: "#3d4a5c", topStyle: "blazer", inner: "#ffffff", bottom: "#2f3440", shoes: shoeDark, lanyard: c.a },
    lea: { build: "child", skin: SKIN_TONES[0], hair: "pigtails", hairColor: HAIR_COLORS.ginger, top: soft(c.c, 0.05), topStyle: "tee", inner: c.b, bottom: denim, bottomStyle: "skirt", shoes: c.b },
    noah: { build: "child", skin: SKIN_TONES[4], hair: "kid", hairColor: HAIR_COLORS.black, top: c.a, topStyle: "hoodie", inner: "#ffffff", bottom: "#56607a", shoes: "#f3f1ee" },
    jade: { build: "child", skin: SKIN_TONES[5], hair: "curly", hairColor: "#1b1411", top: soft(c.b, 0.1), topStyle: "dress", bottom: navy, shoes: shoeDark },
    hugo: { build: "child", skin: SKIN_TONES[2], hair: "kid", hairColor: HAIR_COLORS.brown, top: "#ffffff", topStyle: "tee", bottom: c.aDark, bottomStyle: "shorts", shoes: c.b },
    ines: { build: "child", skin: SKIN_TONES[1], hair: "ponytail", hairColor: HAIR_COLORS.brown, top: soft(c.a, 0.45), topStyle: "sweater", bottom: denim, shoes: shoeDark },
  };
}
