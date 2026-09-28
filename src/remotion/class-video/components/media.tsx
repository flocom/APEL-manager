import React, { useState } from "react";
import { Img, useCurrentFrame } from "remotion";

import { darken, lighten, readableOn, withAlpha } from "../colors";
import { FONT_FAMILY } from "../theme";

/**
 * Photos : cadre polaroïd, effet Ken Burns, avatar à initiales. Les images
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
  const scale = 1.06 + 0.12 * t;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${scale}) translate(${dx * 2.2 * t}%, ${dy * 2.2 * t}%)`,
        }}
      >
        <SafeImg src={src} fallback={fallback} />
      </div>
    </div>
  );
};

/** Bout de ruban adhésif translucide posé sur un cadre. */
export const Tape: React.FC<{ tint: string; width?: number; rotate?: number; style?: React.CSSProperties }> = ({
  tint,
  width = 180,
  rotate = -4,
  style,
}) => (
  <div
    style={{
      position: "absolute",
      width,
      height: width * 0.28,
      background: `linear-gradient(90deg, ${withAlpha(lighten(tint, 0.55), 0.78)}, ${withAlpha(lighten(tint, 0.7), 0.7)})`,
      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.12)",
      transform: `rotate(${rotate}deg)`,
      ...style,
    }}
  />
);

/** Cadre polaroïd : bord blanc, légende manuscrite en bas, ruban en haut. */
export const Polaroid: React.FC<{
  width: number;
  height: number;
  tint: string;
  ink: string;
  caption?: string;
  captionSize?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
  tape?: boolean;
}> = ({ width, height, tint, ink, caption, captionSize = 40, children, style, tape = true }) => {
  const border = Math.round(width * 0.045);
  const bottom = caption ? Math.round(captionSize * 2.1) : border * 2.4;
  return (
    <div
      style={{
        position: "absolute",
        width,
        height,
        background: "#ffffff",
        borderRadius: 10,
        boxShadow: "0 22px 44px rgba(0, 0, 0, 0.28)",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: border,
          top: border,
          right: border,
          bottom,
          overflow: "hidden",
          borderRadius: 4,
          background: lighten(tint, 0.6),
        }}
      >
        {children}
      </div>
      {caption ? (
        <div
          style={{
            position: "absolute",
            left: border,
            right: border,
            bottom: 0,
            height: bottom,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FONT_FAMILY,
            fontWeight: 800,
            fontSize: captionSize,
            color: ink,
            textAlign: "center",
            lineHeight: 1.05,
            overflow: "hidden",
          }}
        >
          {caption}
        </div>
      ) : null}
      {tape ? <Tape tint={tint} width={width * 0.34} style={{ left: width * 0.33, top: -width * 0.045 }} /> : null}
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
        background: `linear-gradient(145deg, ${lighten(color, 0.18)}, ${darken(color, 0.12)})`,
        color: ink,
        fontFamily: FONT_FAMILY,
        fontWeight: 900,
        fontSize: size * 0.38,
        letterSpacing: "0.02em",
      }}
    >
      {initials(name)}
    </div>
  );
};
