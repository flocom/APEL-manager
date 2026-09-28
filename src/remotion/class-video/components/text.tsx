import React from "react";
import { Easing, useCurrentFrame, useVideoConfig } from "remotion";

import { FONT_FAMILY } from "../theme";
import { progress, snap } from "./motion";

/**
 * Typographie cinétique : très gros titres (Inter 900) dont les mots
 * surgissent d'un masque l'un après l'autre (ou claquent à l'écran pour
 * l'accroche), mot clé passé au surligneur, sous-titre qui glisse juste
 * après. Rapide et lisible.
 */

/** Largeur moyenne d'un caractère en Inter 900, en fraction de la taille. */
const TITLE_CHAR = 0.63;
/** Sortie très vive (quintique) pour les révélations masquées. */
const REVEAL = Easing.bezier(0.16, 1, 0.3, 1);
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

/** Mot clé du titre : le dernier mot porteur de lettres (la chute de la phrase). */
function keyWordIndex(words: string[]): number {
  for (let i = words.length - 1; i >= 0; i--) if (/[A-Za-z0-9À-ÖØ-öø-ÿ]/.test(words[i])) return i;
  return -1;
}

/** Sépare la ponctuation finale (« vous ? » → « vous », «  ? »). */
function splitPunct(word: string): [string, string] {
  const m = word.match(/^(.*?)([\s\u00a0]*[?!.…:;,]+)$/);
  return m && m[1] ? [m[1], m[2]] : [word, ""];
}

export type Marker = { color: string; ink: string };

/**
 * Grand titre cinétique. « rise » : chaque mot monte d'un masque ; « slam » :
 * chaque mot claque en grossissant puis se pose (accroche d'ouverture).
 * Avec `marker`, le mot clé est surligné d'un coup de feutre.
 */
export const Title: React.FC<{
  text: string;
  color: string;
  maxWidth: number;
  maxSize?: number;
  minSize?: number;
  maxLines?: number;
  delay?: number;
  align?: "left" | "center";
  mode?: "rise" | "slam";
  marker?: Marker;
  style?: React.CSSProperties;
}> = ({ text, color, maxWidth, maxSize = 140, minSize = 60, maxLines = 2, delay = 0, align = "left", mode = "rise", marker, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = splitWords(text);
  if (words.length === 0) return null;
  const size = fitFontSize(text, maxWidth, maxLines, maxSize, minSize);
  const stagger = mode === "slam" ? 4 : 3;
  const key = marker ? keyWordIndex(words) : -1;
  const markerAt = delay + (words.length - 1) * stagger + (mode === "slam" ? 12 : 9);
  const m = progress(frame, markerAt, markerAt + 8, REVEAL);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : "flex-start",
        columnGap: size * SPACE_WIDTH,
        maxWidth,
        fontFamily: FONT_FAMILY,
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1.04,
        letterSpacing: "-0.03em",
        color,
        ...style,
      }}
    >
      {words.map((word, i) => {
        const d = delay + i * stagger;
        const isKey = i === key;
        const [core, punct] = isKey ? splitPunct(word) : [word, ""];
        const markerEl = isKey && marker ? (
          <span
            style={{
              position: "absolute",
              left: "-0.07em",
              right: "-0.07em",
              top: "0.1em",
              bottom: "0.08em",
              background: marker.color,
              borderRadius: "0.12em",
              transform: `rotate(-1.5deg) scaleX(${m})`,
              transformOrigin: "0% 50%",
            }}
          />
        ) : null;
        const inner = (
          <>
            <span style={{ position: "relative", display: "inline-block" }}>
              {markerEl}
              <span style={{ position: "relative", color: isKey && marker && m > 0.4 ? marker.ink : undefined }}>{core}</span>
            </span>
            {punct ? <span style={{ position: "relative" }}>{punct}</span> : null}
          </>
        );
        if (mode === "slam") {
          const p = snap(frame, fps, d, 300, 20);
          return (
            <span
              key={`${word}-${i}`}
              style={{
                position: "relative",
                display: "inline-block",
                whiteSpace: "pre",
                opacity: Math.min(1, p * 3),
                transform: `scale(${1.9 - 0.9 * p})`,
                transformOrigin: "50% 60%",
                filter: p < 0.98 ? `blur(${((1 - Math.min(1, p)) * 16).toFixed(1)}px)` : undefined,
              }}
            >
              {inner}
            </span>
          );
        }
        const p = progress(frame, d, d + 11, REVEAL);
        return (
          <span
            key={`${word}-${i}`}
            style={{
              position: "relative",
              display: "inline-block",
              whiteSpace: "pre",
              overflow: "hidden",
              padding: "0 0.08em 0.14em",
              margin: "0 -0.08em -0.14em",
            }}
          >
            <span
              style={{
                position: "relative",
                display: "inline-block",
                transform: `translateY(${(1 - p) * 115}%)`,
                filter: p < 0.98 ? `blur(${((1 - p) * 12).toFixed(1)}px)` : undefined,
              }}
            >
              {inner}
            </span>
          </span>
        );
      })}
    </div>
  );
};

/** Ligne secondaire sous le titre, qui glisse d'un masque. */
export const Subtitle: React.FC<{
  text: string;
  color: string;
  maxWidth: number;
  size?: number;
  delay?: number;
  align?: "left" | "center";
  weight?: number;
  style?: React.CSSProperties;
}> = ({ text, color, maxWidth, size = 48, delay = 0, align = "left", weight = 600, style }) => {
  const frame = useCurrentFrame();
  const value = frenchSpaces(text.trim());
  if (!value) return null;
  const fitted = fitFontSize(value, maxWidth, 2, size, 30, BODY_CHAR + 0.03);
  const p = progress(frame, delay, delay + 12, REVEAL);
  return (
    <div style={{ overflow: "hidden", maxWidth, padding: "0 0 0.1em", ...style }}>
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontWeight: weight,
          fontSize: fitted,
          lineHeight: 1.22,
          letterSpacing: "-0.01em",
          color,
          textAlign: align,
          transform: `translateY(${(1 - p) * 105}%)`,
          filter: p < 0.98 ? `blur(${((1 - p) * 8).toFixed(1)}px)` : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
};

/** Filet d'accent au-dessus du titre, qui se déploie d'un coup. */
export const AccentBar: React.FC<{ color: string; delay?: number; width?: number; align?: "left" | "center" }> = ({
  color,
  delay = 0,
  width = 110,
  align = "left",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = snap(frame, fps, delay);
  return (
    <div
      style={{
        width,
        height: 14,
        borderRadius: 7,
        background: color,
        transform: `scaleX(${Math.max(0, p)})`,
        transformOrigin: align === "left" ? "0% 50%" : "50% 50%",
        alignSelf: align === "left" ? "flex-start" : "center",
      }}
    />
  );
};

/** Surtitre : petit filet et libellé en capitales espacées (« 02 · APEL »). */
export const Eyebrow: React.FC<{ text: string; color: string; accent: string; delay?: number; align?: "left" | "center" }> = ({ text, color, accent, delay = 0, align = "left" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bar = Math.max(0, snap(frame, fps, delay));
  const p = progress(frame, delay + 3, delay + 15, REVEAL);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, alignSelf: align === "left" ? "flex-start" : "center" }}>
      <div style={{ width: 56, height: 6, borderRadius: 3, background: accent, transform: `scaleX(${bar})`, transformOrigin: "0% 50%" }} />
      <div style={{ overflow: "hidden" }}>
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: 700,
            fontSize: 26,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color,
            transform: `translateY(${(1 - p) * 110}%)`,
            whiteSpace: "nowrap",
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
};

/** Bloc titre complet : surtitre (ou filet), titre (mot clé surligné), sous-titre. */
export const TextBlock: React.FC<{
  title: string;
  subtitle: string;
  ink: string;
  muted: string;
  accent: string;
  marker?: Marker;
  maxWidth: number;
  delay?: number;
  titleSize?: number;
  subtitleSize?: number;
  maxLines?: number;
  align?: "left" | "center";
  gap?: number;
  mode?: "rise" | "slam";
  eyebrow?: string;
}> = ({ title, subtitle, ink, muted, accent, marker, maxWidth, delay = 4, titleSize = 140, subtitleSize = 48, maxLines = 2, align = "left", gap = 28, mode = "rise", eyebrow }) => {
  const words = splitWords(title).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align === "left" ? "flex-start" : "center", gap }}>
      {eyebrow ? <Eyebrow text={eyebrow} color={muted} accent={accent} delay={delay} align={align} /> : <AccentBar color={accent} delay={delay} align={align} />}
      <Title text={title} color={ink} maxWidth={maxWidth} maxSize={titleSize} maxLines={maxLines} delay={delay + 2} align={align} marker={marker} mode={mode} />
      <Subtitle text={subtitle} color={muted} maxWidth={maxWidth} size={subtitleSize} delay={delay + 6 + words * 3} align={align} />
    </div>
  );
};
