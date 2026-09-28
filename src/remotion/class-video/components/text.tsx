import React from "react";
import { useCurrentFrame } from "remotion";

import { FONT_FAMILY } from "../theme";
import { enter } from "./motion";

/**
 * Typographie de la vidéo : hiérarchie nette (titre 800, sous-titre 500),
 * alignée à gauche le plus souvent, qui apparaît en fondu montant, mot par
 * mot pour le titre. Pensée pour être lue par des parents, sans effet
 * appuyé.
 */

/** Largeur moyenne d'un caractère en Inter 800, en fraction de la taille. */
const TITLE_CHAR = 0.6;
/** Idem pour le texte courant (Inter 500, minuscules surtout). */
export const BODY_CHAR = 0.52;
const SPACE_WIDTH = 0.28;

/**
 * Espaces insécables avant « ? ! : ; » (typographie française) : la
 * ponctuation ne part jamais seule à la ligne.
 */
export function frenchSpaces(text: string): string {
  return text.replace(/\s+([?!:;»])/g, " $1").replace(/([«])\s+/g, "$1 ");
}

export function splitWords(text: string): string[] {
  return frenchSpaces(text.trim()).split(/[ \t\n]+/).filter(Boolean);
}

/** Estime le nombre de lignes d'un texte à une taille donnée (retour à la ligne glouton). */
function countLines(words: string[], size: number, maxWidth: number, charWidth: number): number {
  let lines = 1;
  let width = 0;
  for (const word of words) {
    const w = word.length * charWidth * size;
    if (width === 0) width = w;
    else if (width + SPACE_WIDTH * size + w <= maxWidth) width += SPACE_WIDTH * size + w;
    else {
      lines++;
      width = w;
    }
  }
  return lines;
}

/** Plus grande taille (px) qui fait tenir le texte en `maxLines` lignes de `maxWidth`. */
export function fitFontSize(
  text: string,
  maxWidth: number,
  maxLines: number,
  maxSize: number,
  minSize = 30,
  charWidth = TITLE_CHAR,
): number {
  const words = splitWords(text);
  if (words.length === 0) return maxSize;
  const longest = Math.max(...words.map((w) => w.length));
  let size = Math.min(maxSize, maxWidth / (longest * charWidth));
  while (size > minSize && countLines(words, size, maxWidth, charWidth) > maxLines) size -= 2;
  return Math.max(minSize, Math.floor(size));
}

/** Grand titre : mots qui montent en fondu, l'un après l'autre. */
export const Title: React.FC<{
  text: string;
  color: string;
  maxWidth: number;
  maxSize?: number;
  minSize?: number;
  maxLines?: number;
  delay?: number;
  align?: "left" | "center";
  style?: React.CSSProperties;
}> = ({ text, color, maxWidth, maxSize = 112, minSize = 56, maxLines = 2, delay = 0, align = "left", style }) => {
  const frame = useCurrentFrame();
  const words = splitWords(text);
  if (words.length === 0) return null;
  const size = fitFontSize(text, maxWidth, maxLines, maxSize, minSize);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : "flex-start",
        columnGap: size * SPACE_WIDTH,
        maxWidth,
        fontFamily: FONT_FAMILY,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.06,
        letterSpacing: "-0.025em",
        color,
        ...style,
      }}
    >
      {words.map((word, i) => {
        const p = enter(frame, delay + i * 2.5, 22);
        return (
          <span
            key={`${word}-${i}`}
            style={{
              display: "inline-block",
              whiteSpace: "pre",
              opacity: p,
              transform: `translateY(${(1 - p) * size * 0.32}px)`,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

/** Ligne secondaire sous le titre. */
export const Subtitle: React.FC<{
  text: string;
  color: string;
  maxWidth: number;
  size?: number;
  delay?: number;
  align?: "left" | "center";
  weight?: number;
  style?: React.CSSProperties;
}> = ({ text, color, maxWidth, size = 46, delay = 0, align = "left", weight = 500, style }) => {
  const frame = useCurrentFrame();
  const value = frenchSpaces(text.trim());
  if (!value) return null;
  const fitted = fitFontSize(value, maxWidth, 2, size, 30, BODY_CHAR);
  const p = enter(frame, delay, 22);
  return (
    <div
      style={{
        maxWidth,
        fontFamily: FONT_FAMILY,
        fontWeight: weight,
        fontSize: fitted,
        lineHeight: 1.25,
        letterSpacing: "-0.005em",
        color,
        textAlign: align,
        opacity: p,
        transform: `translateY(${(1 - p) * 16}px)`,
        ...style,
      }}
    >
      {value}
    </div>
  );
};

/** Filet d'accent au-dessus du titre, qui s'allonge à l'entrée. */
export const AccentBar: React.FC<{ color: string; delay?: number; width?: number; align?: "left" | "center" }> = ({
  color,
  delay = 0,
  width = 88,
  align = "left",
}) => {
  const frame = useCurrentFrame();
  const p = enter(frame, delay, 24);
  return (
    <div
      style={{
        width,
        height: 10,
        borderRadius: 5,
        background: color,
        transform: `scaleX(${p})`,
        transformOrigin: align === "left" ? "0% 50%" : "50% 50%",
        alignSelf: align === "left" ? "flex-start" : "center",
      }}
    />
  );
};

/** Bloc titre complet : filet, titre, sous-titre. */
export const TextBlock: React.FC<{
  title: string;
  subtitle: string;
  ink: string;
  muted: string;
  accent: string;
  maxWidth: number;
  delay?: number;
  titleSize?: number;
  subtitleSize?: number;
  maxLines?: number;
  align?: "left" | "center";
  gap?: number;
}> = ({ title, subtitle, ink, muted, accent, maxWidth, delay = 6, titleSize = 112, subtitleSize = 46, maxLines = 2, align = "left", gap = 30 }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: align === "left" ? "flex-start" : "center", gap }}>
    <AccentBar color={accent} delay={delay} align={align} />
    <Title text={title} color={ink} maxWidth={maxWidth} maxSize={titleSize} maxLines={maxLines} delay={delay + 4} align={align} />
    <Subtitle text={subtitle} color={muted} maxWidth={maxWidth} size={subtitleSize} delay={delay + 14} align={align} />
  </div>
);
