/**
 * Petits outils de couleur pour la vidéo : la palette vient du logo de
 * l'école, on ne sait donc jamais d'avance si un fond est clair ou foncé.
 * Tout passe par ici pour garantir un texte lisible (contraste WCAG).
 */

export const NEAR_BLACK = "#14161f";
export const WHITE = "#ffffff";

type Rgb = { r: number; g: number; b: number };

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** Lit « #rgb », « #rrggbb » ou « rgb(r, g, b) ». Couleur illisible → gris moyen. */
export function parseColor(input: string): Rgb {
  const value = input.trim().toLowerCase();
  const hex = value.startsWith("#") ? value.slice(1) : null;
  if (hex && /^[0-9a-f]{3}$/.test(hex)) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  if (hex && /^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (rgb) {
    return { r: clampByte(+rgb[1]), g: clampByte(+rgb[2]), b: clampByte(+rgb[3]) };
  }
  return { r: 128, g: 128, b: 128 };
}

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Luminance relative WCAG 2.1 (0 = noir, 1 = blanc). */
export function relativeLuminance(color: string): number {
  const { r, g, b } = parseColor(color);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Rapport de contraste WCAG entre deux couleurs (1 à 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Couleur de texte lisible sur `bg` : blanc ou `dark` (en général
 * palette.dark), celle qui contraste le plus. Si `dark` n'est pas assez
 * foncée, on retombe sur un quasi-noir neutre.
 */
export function readableOn(bg: string, dark: string = NEAR_BLACK): string {
  const ink = contrastRatio(dark, bg) >= contrastRatio(NEAR_BLACK, bg) * 0.6 ? dark : NEAR_BLACK;
  // Léger biais vers le blanc : sur les couleurs vives moyennes, un texte
  // blanc épais et ombré se lit mieux pour des enfants qu'un texte sombre.
  return contrastRatio(WHITE, bg) * 1.25 >= contrastRatio(ink, bg) ? WHITE : ink;
}

/** Mélange linéaire de deux couleurs (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  return toHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

export const lighten = (color: string, t: number) => mix(color, WHITE, t);
export const darken = (color: string, t: number) => mix(color, "#000000", t);

export function withAlpha(color: string, alpha: number): string {
  const { r, g, b } = parseColor(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** Vrai si deux couleurs sont trop proches pour être distinguées côte à côte. */
export function tooClose(a: string, b: string): boolean {
  return contrastRatio(a, b) < 1.35;
}
