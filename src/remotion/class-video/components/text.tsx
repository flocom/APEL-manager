import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

import { FONT_FAMILY } from "../theme";
import { pop } from "./motion";

/**
 * Typographie de la vidéo : très gros, très gras, arrondi, qui rebondit
 * mot par mot. Pensé pour des enfants qui lisent peu ou pas encore.
 */

/** Largeur moyenne d'un caractère en Inter 900, en fraction de la taille. */
const CHAR_WIDTH = 0.64;
const SPACE_WIDTH = 0.28;

/**
 * Espaces insécables avant « ? ! : ; » (typographie française) : la
 * ponctuation ne part jamais seule à la ligne.
 */
export function frenchSpaces(text: string): string {
  return text.replace(/\s+([?!:;»])/g, " $1").replace(/([«])\s+/g, "$1 ");
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
  minSize = 36,
  charWidth = CHAR_WIDTH,
): number {
  const words = splitWords(text);
  if (words.length === 0) return maxSize;
  const longest = Math.max(...words.map((w) => w.length));
  let size = Math.min(maxSize, maxWidth / (longest * charWidth));
  while (size > minSize && countLines(words, size, maxWidth, charWidth) > maxLines) size -= 2;
  return Math.max(minSize, Math.floor(size));
}

export const KineticTitle: React.FC<{
  text: string;
  color: string;
  shadow: string;
  maxWidth: number;
  maxSize: number;
  maxLines?: number;
  delay?: number;
  align?: "center" | "left";
  stagger?: number;
  style?: React.CSSProperties;
}> = ({ text, color, shadow, maxWidth, maxSize, maxLines = 2, delay = 0, align = "center", stagger = 3, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = splitWords(text);
  if (words.length === 0) return null;
  const size = fitFontSize(text, maxWidth, maxLines, maxSize);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : "flex-start",
        columnGap: size * SPACE_WIDTH,
        rowGap: 0,
        maxWidth,
        fontFamily: FONT_FAMILY,
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1.08,
        letterSpacing: "-0.01em",
        color,
        ...style,
      }}
    >
      {words.map((word, i) => {
        const p = pop(frame, fps, delay + i * stagger, 190, 10);
        const tilt = (i % 2 === 0 ? -1 : 1) * 4 * (1 - Math.min(1, p));
        return (
          <span
            key={`${word}-${i}`}
            style={{
              display: "inline-block",
              whiteSpace: "pre",
              opacity: Math.min(1, p * 1.6),
              transform: `translateY(${(1 - p) * size * 0.6}px) scale(${0.4 + 0.6 * p}) rotate(${tilt}deg)`,
              textShadow: `0 ${Math.round(size * 0.07)}px 0 ${shadow}`,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

/** Pastille arrondie pour le sous-titre ou une étiquette. */
export const Pill: React.FC<{
  text: string;
  bg: string;
  color: string;
  delay?: number;
  fontSize?: number;
  maxWidth?: number;
  rotate?: number;
  style?: React.CSSProperties;
}> = ({ text, bg, color, delay = 0, fontSize = 50, maxWidth = 1400, rotate = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const value = frenchSpaces(text.trim());
  if (!value) return null;
  // Une seule ligne si possible (quitte à réduire un peu), sinon deux.
  const avail = maxWidth - fontSize * 1.6;
  // Graisse 800 en minuscules : caractères plus étroits que le titre.
  const oneLine = fitFontSize(value, avail, 1, fontSize, 20, 0.56);
  const size = oneLine >= fontSize * 0.74 ? oneLine : fitFontSize(value, avail, 2, fontSize, 30, 0.56);
  const p = pop(frame, fps, delay, 160, 12);
  return (
    <div
      style={{
        display: "inline-block",
        maxWidth,
        padding: `${size * 0.32}px ${size * 0.8}px`,
        borderRadius: size * 1.2,
        background: bg,
        color,
        fontFamily: FONT_FAMILY,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.18,
        textAlign: "center",
        boxShadow: `0 ${size * 0.16}px 0 rgba(0, 0, 0, 0.14)`,
        opacity: Math.min(1, p * 1.5),
        transform: `translateY(${(1 - p) * 40}px) scale(${0.6 + 0.4 * p}) rotate(${rotate}deg)`,
        ...style,
      }}
    >
      {value}
    </div>
  );
};
