import { darken, lighten, mix, readableOn, tooClose, withAlpha, WHITE } from "./colors";
import type { ClassVideoSceneId, VideoPalette } from "./types";

/** Police de l'app (Inter via next/font), avec replis locaux : aucun téléchargement. */
export const FONT_FAMILY = "var(--font-sans), Inter, system-ui, sans-serif";

export type SceneTheme = {
  /** Couleur de fond principale. */
  bg: string;
  /** Dégradé de fond (du haut vers le bas). */
  gradient: string;
  /** Couleur du grand texte posé sur le fond. */
  ink: string;
  /** Ombre portée « dure » sous le grand texte. */
  inkShadow: string;
  /** Couleurs des formes décoratives, choisies pour se voir sur le fond. */
  shapes: string[];
  /** Pastille de sous-titre : fond et texte. */
  pill: string;
  pillInk: string;
  /** Couleur vive qui ressort sur le fond (rubans, étoiles). */
  pop: string;
};

/** Couleur de la palette qui se distingue le mieux de `bg` parmi les candidates. */
export function pickContrasting(bg: string, candidates: string[]): string {
  const usable = candidates.filter((c) => !tooClose(c, bg));
  return usable[0] ?? (readableOn(bg) === WHITE ? lighten(bg, 0.55) : darken(bg, 0.35));
}

/** Fond de chaque scène : on alterne les couleurs du logo pour rythmer la vidéo. */
function sceneBackground(palette: VideoPalette, id: ClassVideoSceneId): string {
  switch (id) {
    case "intro":
    case "sourire":
    case "membres":
      return palette.primary;
    case "vie":
    case "bienfaits":
      return palette.secondary;
    case "rassembler":
      return palette.accent;
    case "apel":
    case "souvenirs":
    case "chiffres":
      return palette.light;
    case "fin":
      return palette.primary;
  }
}

export function sceneTheme(palette: VideoPalette, id: ClassVideoSceneId): SceneTheme {
  const bg = sceneBackground(palette, id);
  const ink = readableOn(bg, palette.dark);
  const light = ink === WHITE;
  const others = [palette.secondary, palette.accent, palette.primary, WHITE, palette.light].filter(
    (c) => !tooClose(c, bg),
  );
  const shapes = others.length >= 2 ? others.slice(0, 4) : [lighten(bg, 0.4), darken(bg, 0.2)];
  const pill = light ? WHITE : palette.dark;
  return {
    bg,
    gradient: `linear-gradient(165deg, ${lighten(bg, 0.12)} 0%, ${bg} 55%, ${darken(bg, 0.1)} 100%)`,
    ink,
    inkShadow: light ? withAlpha(darken(bg, 0.55), 0.45) : withAlpha(darken(bg, 0.35), 0.35),
    shapes,
    pill,
    pillInk: readableOn(pill, palette.dark) === WHITE ? WHITE : pill === WHITE ? palette.dark : WHITE,
    pop: pickContrasting(bg, [palette.secondary, palette.accent, palette.primary]),
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
  blush: string;
};

export function illuColors(palette: VideoPalette): IlluColors {
  const accent = palette.accent;
  return {
    a: palette.primary,
    aDark: darken(palette.primary, 0.25),
    aLight: lighten(palette.primary, 0.55),
    b: palette.secondary,
    bDark: darken(palette.secondary, 0.22),
    bLight: lighten(palette.secondary, 0.5),
    c: accent,
    cDark: darken(accent, 0.22),
    cLight: lighten(accent, 0.5),
    ink: darken(palette.dark, 0.1),
    white: WHITE,
    blush: withAlpha(mix(accent, "#ff5a7a", 0.5), 0.45),
  };
}
