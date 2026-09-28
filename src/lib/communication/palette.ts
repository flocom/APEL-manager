import type { VideoPalette } from "@/remotion/class-video/types";

/**
 * Palette de la vidéo, tirée du logo de l'école.
 *
 * Un logo n'est pas fait pour remplir un écran : bleu marine presque noir,
 * bordeaux éteint, kaki, ou pas de couleur du tout. On garde donc ses
 * teintes — c'est ce qui fait reconnaître l'école —, mais on ramène leur
 * saturation et leur luminosité dans une plage où elles restent vives sans
 * crier. Un logo sans couleur exploitable (noir et blanc, gris) laisse la
 * place à la palette par défaut, plutôt qu'à une vidéo grise.
 */

export const DEFAULT_VIDEO_PALETTE: VideoPalette = {
  primary: "#1f7fcf",
  secondary: "#ff8a3d",
  accent: "#ffc83d",
  dark: "#0e2742",
  light: "#eef6fd",
};

export type WeightedColor = { r: number; g: number; b: number; weight: number };

type Hsl = { h: number; s: number; l: number };

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `#${[r, g, b]
    .map((v) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function hueDistance(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Luminosité cible selon la teinte : un jaune à 45 % de luminosité vire au
 * moutarde, un bleu à 55 % pâlit. Chaque famille a sa plage où elle reste
 * franche.
 */
function lightnessRange(hue: number): [number, number] {
  if (hue >= 40 && hue < 75) return [0.5, 0.58]; // jaunes, ors
  if (hue >= 75 && hue < 170) return [0.38, 0.48]; // verts
  if (hue >= 170 && hue < 260) return [0.4, 0.5]; // bleus, turquoises
  return [0.44, 0.54]; // rouges, roses, violets, orangés
}

/**
 * Une couleur du logo, rendue présentable en grand à l'écran. Les teintes
 * entre le jaune et le vert (kaki, olive, moutarde verdâtre) tournent au
 * vert acide une fois saturées : on les ramène vers l'or si elles sont
 * claires, vers un vert franc si elles sont sombres.
 */
function tame({ h, s, l }: Hsl): Hsl {
  const hue = h >= 55 && h < 85 ? (l > 0.45 ? 48 : 100) : h;
  const [minL, maxL] = lightnessRange(hue);
  return { h: hue, s: clamp(s, 0.58, 0.85), l: clamp(l, minL, maxL) };
}

/**
 * Compagne d'une couleur quand le logo n'en a qu'une : des accords éprouvés
 * plutôt qu'un décalage mécanique sur le cercle chromatique, qui donnait du
 * vert fluo à côté d'un bordeaux.
 */
function companionHue(hue: number): number {
  if (hue >= 170 && hue < 260) return 22; // bleus → corail orangé
  if (hue >= 260 && hue < 320) return 45; // violets → or
  if (hue >= 85 && hue < 170) return 12; // verts → corail
  return 198; // rouges, roses, orangés, jaunes → bleu lagon
}

/**
 * Teintes vives qui s'accordent avec presque tout, pour les accents, avec la
 * saturation où chacune reste gaie sans virer au fluo.
 */
const ACCENT_HUES: { h: number; s: number }[] = [
  { h: 45, s: 0.92 },
  { h: 12, s: 0.88 },
  { h: 170, s: 0.68 },
  { h: 330, s: 0.74 },
];

/**
 * Regroupe les pixels par teinte (secteurs de 15°) et renvoie les teintes
 * dominantes, du plus présent au moins présent. Seuls comptent les pixels
 * assez saturés : le blanc du fond, le noir du texte et les gris n'ont pas de
 * teinte à transmettre.
 */
export function dominantHues(colors: WeightedColor[]): Hsl[] {
  const buckets = new Map<
    number,
    { weight: number; h: number; s: number; l: number }
  >();
  for (const color of colors) {
    const hsl = rgbToHsl(color);
    // Trop gris, trop sombre ou trop clair pour porter une couleur.
    if (hsl.s < 0.22 || hsl.l < 0.12 || hsl.l > 0.93) continue;
    // Un pixel saturé pèse plus qu'un pixel délavé de même teinte.
    const weight = color.weight * hsl.s;
    const key = Math.floor(hsl.h / 15);
    const bucket = buckets.get(key) ?? { weight: 0, h: 0, s: 0, l: 0 };
    bucket.weight += weight;
    bucket.h += hsl.h * weight;
    bucket.s += hsl.s * weight;
    bucket.l += hsl.l * weight;
    buckets.set(key, bucket);
  }
  const total = [...buckets.values()].reduce((sum, b) => sum + b.weight, 0);
  return [...buckets.values()]
    .filter((b) => total > 0 && b.weight / total >= 0.04)
    .sort((a, b) => b.weight - a.weight)
    .map((b) => ({ h: b.h / b.weight, s: b.s / b.weight, l: b.l / b.weight }));
}

/**
 * Construit la palette à partir des couleurs du logo. Pure et déterministe :
 * la même image donne toujours la même vidéo.
 */
export function buildVideoPalette(colors: WeightedColor[]): VideoPalette {
  const hues = dominantHues(colors);
  // Une part infime de couleur (un liseré) ne suffit pas à teinter une vidéo.
  const chromatic = colors.reduce((sum, c) => {
    const hsl = rgbToHsl(c);
    return hsl.s >= 0.22 && hsl.l >= 0.12 && hsl.l <= 0.93 ? sum + c.weight : sum;
  }, 0);
  const all = colors.reduce((sum, c) => sum + c.weight, 0);
  if (hues.length === 0 || all === 0 || chromatic / all < 0.03) {
    return DEFAULT_VIDEO_PALETTE;
  }

  const primary = tame(hues[0]);
  // Seconde couleur du logo si elle se distingue vraiment de la première ;
  // sinon une teinte voisine décalée, qui reste dans la même famille.
  const distinct = hues
    .slice(1)
    .find(
      (hsl) =>
        hueDistance(hsl.h, hues[0].h) >= 35 &&
        hueDistance(tame(hsl).h, primary.h) >= 35,
    );
  const secondary = distinct
    ? tame(distinct)
    : tame({ h: companionHue(primary.h), s: 0.78, l: 0.5 });
  // L'accent doit trancher sur les deux autres : le premier des tons vifs
  // assez éloigné de chacune.
  const accent = ACCENT_HUES.find(
    ({ h }) =>
      hueDistance(h, primary.h) >= 50 && hueDistance(h, secondary.h) >= 22,
  ) ?? { h: 45, s: 0.92 };
  const [accentMin, accentMax] = lightnessRange(accent.h);

  return {
    primary: hslToHex(primary),
    secondary: hslToHex(secondary),
    accent: hslToHex({
      h: accent.h,
      s: accent.s,
      l: (accentMin + accentMax) / 2 + 0.03,
    }),
    dark: hslToHex({ h: primary.h, s: 0.55, l: 0.13 }),
    light: hslToHex({ h: primary.h, s: 0.7, l: 0.95 }),
  };
}
