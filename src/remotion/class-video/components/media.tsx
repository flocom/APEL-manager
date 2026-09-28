import React, { useState } from "react";
import { Img, useCurrentFrame } from "remotion";

import { readableOn } from "../colors";
import { FONT_FAMILY } from "../theme";

/**
 * Photos : cadre sobre, effet Ken Burns, avatar à initiales. Les images
 * acceptent n'importe quel format (objectFit: cover) et une image cassée
 * n'interrompt jamais l'export : on dessine un aplat à la place.
 */

/** Image qui retombe sur un aplat coloré si le fichier ne se charge pas. */
export const SafeImg: React.FC<{
  src: string;
  fallback: string;
  fit?: "cover" | "contain";
  style?: React.CSSProperties;
}> = ({ src, fallback, fit = "cover", style }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div style={{ width: "100%", height: "100%", background: fallback, ...style }} />;
  }
  return (
    <Img
      src={src}
      onError={() => setFailed(true)}
      style={{ width: "100%", height: "100%", objectFit: fit, display: "block", ...style }}
    />
  );
};

/** Zoom et glissement lents sur une photo (effet Ken Burns). */
export const KenBurns: React.FC<{
  src: string;
  fallback: string;
  durationInFrames: number;
  direction?: number;
  delay?: number;
}> = ({ src, fallback, durationInFrames, direction = 0, delay = 0 }) => {
  const frame = useCurrentFrame() - delay;
  const t = Math.max(0, Math.min(1, frame / Math.max(1, durationInFrames)));
  const dirs = [
    [1, 0.4],
    [-1, 0.3],
    [0.5, -1],
    [-0.6, -0.8],
  ];
  const [dx, dy] = dirs[((direction % dirs.length) + dirs.length) % dirs.length];
  const scale = 1.04 + 0.08 * t;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${scale}) translate(${dx * 1.4 * t}%, ${dy * 1.4 * t}%)`,
        }}
      >
        <SafeImg src={src} fallback={fallback} />
      </div>
    </div>
  );
};

/**
 * Cadre photo sobre : carte blanche arrondie, ombre douce, photo en retrait
 * et légende sur la carte.
 */
export const PhotoFrame: React.FC<{
  width: number;
  height: number;
  ink: string;
  caption?: string;
  captionSize?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ width, height, ink, caption, captionSize = 40, children, style }) => {
  const pad = 16;
  const band = caption ? Math.round(captionSize * 2.3) : 0;
  return (
    <div
      style={{
        position: "absolute",
        width,
        height,
        background: "#ffffff",
        borderRadius: 30,
        boxShadow: "0 30px 60px rgba(15, 25, 40, 0.16), 0 4px 12px rgba(15, 25, 40, 0.08)",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: pad,
          top: pad,
          right: pad,
          bottom: caption ? band : pad,
          overflow: "hidden",
          borderRadius: 18,
          background: "#e9edf1",
        }}
      >
        {children}
      </div>
      {caption ? (
        <div
          style={{
            position: "absolute",
            left: pad + 14,
            right: pad + 14,
            bottom: 0,
            height: band,
            display: "flex",
            alignItems: "center",
            fontFamily: FONT_FAMILY,
            fontWeight: 600,
            fontSize: captionSize,
            color: ink,
            lineHeight: 1.1,
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );
};

/** Initiales d'un prénom (« Marie-Claire D. » → « MD »). */
export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Za-z0-9À-ÖØ-öø-ÿ]/g, ""))
    .filter(Boolean);
  if (parts.length === 0) return "♥";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Avatar rond à initiales, pour un membre sans photo. */
export const InitialsAvatar: React.FC<{ name: string; color: string; dark: string; size: number }> = ({
  name,
  color,
  dark,
  size,
}) => {
  const ink = readableOn(color, dark);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: color,
        color: ink,
        fontFamily: FONT_FAMILY,
        fontWeight: 700,
        fontSize: size * 0.36,
        letterSpacing: "0.02em",
      }}
    >
      {initials(name)}
    </div>
  );
};
