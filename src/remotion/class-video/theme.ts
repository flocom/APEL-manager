import { contrastRatio, darken, lighten, mix, readableOn, tooClose, withAlpha, WHITE } from "./colors";
import type { ClassVideoSceneId, VideoPalette } from "./types";

/** Police de l'app (Inter via next/font), avec replis locaux : aucun téléchargement. */
export const FONT_FAMILY = "var(--font-sans), Inter, system-ui, sans-serif";

/**
 * Habillage d'une scène. La vidéo s'adresse aux parents : fonds clairs et
 * calmes la plupart du temps, la palette du logo en touches, et deux scènes
 * franches (« rassembler », « fin ») sur la couleur principale.
 */
export type SceneTheme = {
  /** Aplat de fond. */
  bg: string;
  /** Vrai sur les scènes en couleur pleine (texte clair en général). */
  bold: boolean;
  /** Titre. */
  ink: string;
  /** Sous-titre et textes secondaires. */
  muted: string;
  /** Couleur d'accent lisible sur le fond (filet sous le titre, chiffres). */
  accent: string;
  /** Grande forme douce derrière l'illustration. */
  soft: string;
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

/** Fond de chaque scène : clair, teinté tour à tour par les couleurs du logo. */
function sceneBackground(palette: VideoPalette, id: ClassVideoSceneId): { bg: string; bold: boolean; tint: string } {
  const paper = mix(WHITE, palette.light, 0.55);
  switch (id) {
    case "intro":
    case "souvenirs":
      return { bg: mix(WHITE, palette.light, 0.9), bold: false, tint: palette.primary };
    case "vie":
    case "chiffres":
      return { bg: mix(WHITE, palette.accent, 0.1), bold: false, tint: palette.accent };
    case "sourire":
      return { bg: mix(WHITE, palette.secondary, 0.07), bold: false, tint: palette.secondary };
    case "rassembler":
    case "fin":
      return { bg: palette.primary, bold: true, tint: WHITE };
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
  return {
    bg,
    bold,
    ink,
    muted: inkIsLight ? withAlpha(WHITE, 0.86) : mix(ink, bg, 0.28),
    accent: bold
      ? legible(bg, [palette.accent, WHITE], 1.8, ink)
      : legible(bg, [palette.primary, palette.secondary, palette.dark], 3, palette.dark),
    soft: bold ? mix(bg, WHITE, 0.1) : mix(bg, tint, 0.09),
    floor: bold ? darken(bg, 0.1) : mix(bg, palette.dark, 0.05),
    shadow: withAlpha(darken(bold ? bg : palette.dark, 0.5), bold ? 0.28 : 0.13),
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
