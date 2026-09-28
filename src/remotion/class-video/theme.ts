import { contrastRatio, darken, lighten, mix, parseColor, readableOn, relativeLuminance, tooClose, withAlpha, WHITE } from "./colors";
import type { ClassVideoSceneId, VideoPalette } from "./types";

/** Police de l'app (Inter via next/font), avec replis locaux : aucun téléchargement. */
export const FONT_FAMILY = "var(--font-sans), Inter, system-ui, sans-serif";

/**
 * Habillage d'une scène. Rythme de couleurs franc pour accrocher l'œil :
 * les scènes alternent la couleur principale, la seconde couleur du logo et
 * un fond clair. Le texte reste toujours lisible (contraste WCAG).
 */
export type SceneTheme = {
  /** Aplat de fond. */
  bg: string;
  /** Vrai sur les scènes en couleur pleine. */
  bold: boolean;
  /** Titre. */
  ink: string;
  /** Sous-titre et textes secondaires. */
  muted: string;
  /** Couleur d'accent lisible sur le fond (filet sous le titre, chiffres). */
  accent: string;
  /** Surligneur du mot clé du titre, et couleur du mot surligné. */
  marker: string;
  markerInk: string;
  /** Formes géométriques d'accompagnement (bandes, cercles), visibles sur le fond. */
  shapes: string[];
  /** Grande forme douce derrière l'illustration. */
  soft: string;
  /** Dégradé de fond étalonné (CSS linear-gradient). */
  gradient: string;
  /** Lumière douce (halo) et filet fin du cercle derrière l'illustration. */
  glow: string;
  line: string;
  /** Bas du sol (dégradé) et couleur des particules. */
  floorDeep: string;
  particle: string;
  /** Sol sous les personnages. */
  floor: string;
  /** Ombre portée des personnages et objets. */
  shadow: string;
};

/** Couleur de la palette qui se distingue le mieux de `bg` parmi les candidates. */
export function pickContrasting(bg: string, candidates: string[]): string {
  const usable = candidates.filter((c) => !tooClose(c, bg));
  return usable[0] ?? (readableOn(bg) === WHITE ? lighten(bg, 0.55) : darken(bg, 0.35));
}

/** Première candidate assez contrastée pour du texte (≥ `min`), sinon texte lisible. */
function legible(bg: string, candidates: string[], min: number, fallback: string): string {
  return candidates.find((c) => contrastRatio(c, bg) >= min) ?? fallback;
}

/** Distance entre deux couleurs (RVB) : sert à écarter un accent invisible sur le fond. */
function distinct(a: string, b: string, min = 90): boolean {
  const pa = parseColor(a);
  const pb = parseColor(b);
  return Math.hypot(pa.r - pb.r, pa.g - pb.g, pa.b - pb.b) >= min;
}

/**
 * Seconde couleur utilisable en fond plein : si elle est trop proche de la
 * principale ou trop pâle, on prend la teinte foncée.
 */
function secondaryBackground(palette: VideoPalette): string {
  const s = palette.secondary;
  if (!distinct(s, palette.primary, 80) || relativeLuminance(s) > 0.62) return palette.dark;
  return s;
}

/** Fond de chaque scène : principale, claire, seconde, claire… */
function sceneBackground(palette: VideoPalette, id: ClassVideoSceneId): { bg: string; bold: boolean; tint: string } {
  const paper = mix(WHITE, palette.light, 0.55);
  switch (id) {
    case "intro":
    case "souvenirs":
    case "chiffres":
    case "fin":
      return { bg: palette.primary, bold: true, tint: WHITE };
    case "vie":
    case "rassembler":
      return { bg: secondaryBackground(palette), bold: true, tint: WHITE };
    case "sourire":
      return { bg: mix(WHITE, palette.accent, 0.14), bold: false, tint: palette.accent };
    case "apel":
    case "bienfaits":
    case "membres":
      return { bg: paper, bold: false, tint: palette.primary };
  }
}

export function sceneTheme(palette: VideoPalette, id: ClassVideoSceneId): SceneTheme {
  const { bg, bold, tint } = sceneBackground(palette, id);
  const ink = bold ? readableOn(bg, palette.dark) : legible(bg, [palette.dark], 7, readableOn(bg, palette.dark));
  const inkIsLight = ink === WHITE;
  const marker = pickContrasting(bg, [palette.accent, palette.secondary, palette.primary, WHITE].filter((c) => distinct(c, bg)));
  const shapes = [palette.accent, palette.secondary, palette.primary, WHITE].filter((c) => distinct(c, bg, 110));
  return {
    bg,
    bold,
    ink,
    muted: inkIsLight ? withAlpha(WHITE, 0.88) : mix(ink, bg, 0.25),
    accent: bold
      ? legible(bg, [palette.accent, WHITE], 1.8, ink)
      : legible(bg, [palette.primary, palette.secondary, palette.dark], 3, palette.dark),
    marker,
    markerInk: readableOn(marker, palette.dark),
    shapes: shapes.length >= 2 ? shapes : [lighten(bg, 0.35), darken(bg, 0.25)],
    soft: bold ? mix(bg, WHITE, 0.12) : mix(bg, tint, 0.1),
    gradient: bold
      ? `linear-gradient(155deg, ${mix(bg, WHITE, 0.14)} 0%, ${bg} 48%, ${darken(bg, 0.16)} 100%)`
      : `linear-gradient(155deg, ${mix(bg, WHITE, 0.6)} 0%, ${bg} 50%, ${mix(bg, tint, 0.1)} 100%)`,
    glow: bold ? mix(bg, WHITE, 0.45) : mix(bg, tint, 0.35),
    line: bold ? withAlpha(WHITE, 0.22) : withAlpha(tint, 0.25),
    floor: bold ? darken(bg, 0.12) : mix(bg, palette.dark, 0.05),
    floorDeep: bold ? darken(bg, 0.26) : mix(bg, palette.dark, 0.1),
    particle: bold ? withAlpha(WHITE, 0.9) : withAlpha(tint, 0.9),
    shadow: withAlpha(darken(bold ? bg : palette.dark, 0.5), bold ? 0.3 : 0.13),
  };
}

/** Couleurs des illustrations : la palette, avec ombres et reflets dérivés. */
export type IlluColors = {
  a: string;
  aDark: string;
  aLight: string;
  b: string;
  bDark: string;
  bLight: string;
  c: string;
  cDark: string;
  cLight: string;
  ink: string;
  white: string;
  /** Crème chaude des murs, nappes, cartons. */
  cream: string;
  /** Neutres pour les vêtements et le mobilier (gris chaud, bois). */
  stone: string;
  wood: string;
  /** Verdure (arbres, haies), désaturée pour rester discrète. */
  leaf: string;
  leafDark: string;
};

export function illuColors(palette: VideoPalette): IlluColors {
  const accent = palette.accent;
  return {
    a: palette.primary,
    aDark: darken(palette.primary, 0.22),
    aLight: lighten(palette.primary, 0.6),
    b: palette.secondary,
    bDark: darken(palette.secondary, 0.2),
    bLight: lighten(palette.secondary, 0.6),
    c: accent,
    cDark: darken(accent, 0.18),
    cLight: lighten(accent, 0.55),
    ink: darken(palette.dark, 0.1),
    white: WHITE,
    cream: mix("#fbf6ec", palette.light, 0.25),
    stone: mix("#8e959c", palette.dark, 0.15),
    wood: "#c99a6b",
    leaf: "#8fbf95",
    leafDark: "#6a9f76",
  };
}
