import React from "react";

import { contrastRatio, NEAR_BLACK } from "../colors";
import { SafeImg } from "../components/media";
import { fitFontSize } from "../components/text";
import { FONT_FAMILY } from "../theme";

/** Marges et colonne de texte communes (px, image 1920 × 1080). */
export const MARGIN_X = 140;
export const TEXT_WIDTH = 720;

/**
 * Nom court pour la carte sans logo : le sigle en tête (« APEL »), sinon les
 * initiales des premiers mots.
 */
export function shortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "APEL";
  if (/^[A-ZÀ-Ý]{2,8}$/.test(words[0])) return words[0];
  if (words.join(" ").length <= 14) return words.join(" ");
  return words
    .slice(0, 4)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Surtitre de chapitre : « 03 · APEL » (numéro de la scène, nom court). */
export function chapter(index: number, associationName: string): string {
  return `${String(Math.max(1, index)).padStart(2, "0")} · ${shortName(associationName)}`;
}

/** Carte blanche qui porte le logo (ou le nom court de l'association sans logo). */
export const LogoCard: React.FC<{
  logoUrl: string | null;
  fallbackText: string;
  width: number;
  height: number;
  ink: string;
  fallbackBg: string;
}> = ({ logoUrl, fallbackText, width, height, ink, fallbackBg }) => {
  const pad = Math.round(height * 0.14);
  // Sur la carte blanche, une couleur trop claire (jaune…) cède la place au foncé.
  const textColor = contrastRatio(ink, "#ffffff") >= 3 ? ink : NEAR_BLACK;
  const text = shortName(fallbackText);
  return (
    <div
      style={{
        width,
        height,
        borderRadius: Math.min(32, height * 0.18),
        background: "#ffffff",
        boxShadow: "0 20px 44px rgba(15, 25, 40, 0.12), 0 3px 10px rgba(15, 25, 40, 0.06)",
        padding: pad,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {logoUrl ? (
        <SafeImg src={logoUrl} fallback={fallbackBg} fit="contain" />
      ) : (
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: 800,
            fontSize: fitFontSize(text, width - pad * 2, 1, height * 0.5, 24),
            letterSpacing: "-0.02em",
            color: textColor,
            textAlign: "center",
            lineHeight: 1.05,
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
};

/** Colonne de texte centrée verticalement dans l'image, à gauche ou à droite. */
export const TextColumn: React.FC<{ side?: "left" | "right"; width?: number; top?: number; bottom?: number; children: React.ReactNode }> = ({
  side = "left",
  width = TEXT_WIDTH,
  top = 0,
  bottom = 0,
  children,
}) => (
  <div
    style={{
      position: "absolute",
      top,
      bottom,
      left: side === "left" ? MARGIN_X : undefined,
      right: side === "right" ? MARGIN_X : undefined,
      width,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
    }}
  >
    {children}
  </div>
);
