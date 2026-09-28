import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { contrastRatio, NEAR_BLACK, withAlpha } from "../colors";
import { ConfettiBurst } from "../components/decor";
import { SafeImg } from "../components/media";
import { bob, pop } from "../components/motion";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { fitFontSize, KineticTitle, Pill } from "../components/text";
import { FONT_FAMILY, sceneTheme } from "../theme";

/** Rayons de soleil qui tournent lentement derrière le logo. */
export const Sunburst: React.FC<{ color: string; size: number; rotation: number; rays?: number }> = ({
  color,
  size,
  rotation,
  rays = 18,
}) => {
  const wedges = Array.from({ length: rays }, (_, i) => {
    const a0 = (i / rays) * Math.PI * 2;
    const a1 = a0 + (Math.PI / rays) * 1.0;
    return `M 50 50 L ${50 + 50 * Math.cos(a0)} ${50 + 50 * Math.sin(a0)} L ${50 + 50 * Math.cos(a1)} ${50 + 50 * Math.sin(a1)} Z`;
  });
  return (
    <div style={{ position: "absolute", width: size, height: size, transform: `rotate(${rotation}deg)` }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        {wedges.map((d, i) => (
          <path key={i} d={d} fill={color} />
        ))}
      </svg>
    </div>
  );
};

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

/** Carte blanche qui porte le logo (ou le nom court de l'association sans logo). */
export const LogoCard: React.FC<{
  logoUrl: string | null;
  fallbackText: string;
  width: number;
  height: number;
  ink: string;
  fallbackBg: string;
}> = ({ logoUrl, fallbackText, width, height, ink, fallbackBg }) => {
  const pad = Math.round(height * 0.12);
  // Sur la carte blanche, une couleur trop claire (jaune…) cède la place au foncé.
  const textColor = contrastRatio(ink, "#ffffff") >= 3 ? ink : NEAR_BLACK;
  const text = shortName(fallbackText);
  return (
    <div
      style={{
        width,
        height,
        borderRadius: height * 0.2,
        background: "#ffffff",
        boxShadow: `0 ${height * 0.06}px 0 rgba(0, 0, 0, 0.12), 0 ${height * 0.1}px ${height * 0.2}px rgba(0, 0, 0, 0.18)`,
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
            fontWeight: 900,
            fontSize: fitFontSize(text, width - pad * 2, 1, height * 0.62, 28),
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

export const IntroScene: React.FC<SceneProps> = ({ scene, video, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "intro");
  const title = scene.title.trim() || video.associationName;
  const subtitle = scene.subtitle.trim() || video.schoolName;
  const cardIn = pop(frame, fps, 3, 150, 9);
  const wobble = bob(frame, fps, 2.2, 3.2);
  const cardW = 640;
  const cardH = 360;

  return (
    <SceneBackdrop theme={theme} seed={101 + index}>
      <ConfettiBurst x={960} y={330} colors={[...theme.shapes, "#ffffff"]} delay={8} count={60} power={44} spread={200} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 20 }}>
        <div style={{ position: "relative", width: cardW, height: cardH, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              position: "absolute",
              width: 1300,
              height: 1300,
              left: (cardW - 1300) / 2,
              top: (cardH - 1300) / 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: Math.min(1, cardIn),
            }}
          >
            <Sunburst color={withAlpha("#ffffff", 0.14)} size={1300} rotation={frame * 0.25} />
          </div>
          <div style={{ transform: `scale(${cardIn}) rotate(${(1 - cardIn) * -12 + wobble}deg)` }}>
            <LogoCard
              logoUrl={video.logoUrl}
              fallbackText={video.associationName}
              width={cardW}
              height={cardH}
              ink={video.palette.primary}
              fallbackBg={video.palette.light}
            />
          </div>
        </div>
        <div style={{ height: 56 }} />
        <KineticTitle text={title} color={theme.ink} shadow={theme.inkShadow} maxWidth={1600} maxSize={132} delay={18} />
        <div style={{ height: 34 }} />
        <Pill text={subtitle} bg={theme.pill} color={theme.pillInk} delay={30} fontSize={50} />
      </AbsoluteFill>
      <Sfx src={video.sfx?.pop} at={4} volume={0.55} />
      <Sfx src={video.sfx?.sparkle} at={20} volume={0.3} />
    </SceneBackdrop>
  );
};
