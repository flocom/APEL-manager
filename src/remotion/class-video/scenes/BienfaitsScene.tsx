import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { lighten, readableOn, tooClose, WHITE } from "../colors";
import { BadgeIcon, iconForText } from "../components/illustrations";
import { KenBurns, Polaroid } from "../components/media";
import { ease, pop } from "../components/motion";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { fitFontSize, frenchSpaces, KineticTitle, Pill } from "../components/text";
import { BIENFAITS_INTRO_SECONDS, BIENFAITS_ITEM_SECONDS, getBienfaitsItems, type BienfaitsItem } from "../timeline";
import { FONT_FAMILY, illuColors, pickContrasting, sceneTheme } from "../theme";

/** Position de repos de chaque carte : légèrement décalée et penchée, comme une pile. */
const RESTING = [
  { x: 0, y: 0, r: -3 },
  { x: 36, y: -14, r: 2.6 },
  { x: -30, y: 10, r: -1.4 },
  { x: 22, y: 16, r: 3.4 },
];

/** Carte « temps fort » : icône dans une pastille, texte en gros. */
const HighlightCard: React.FC<{ text: string; bg: string; ink: string; index: number; video: SceneProps["video"] }> = ({
  text,
  bg,
  ink,
  index,
  video,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colors = illuColors(video.palette);
  const value = frenchSpaces(text);
  const size = fitFontSize(value, 640, 3, 92, 44);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 56,
        background: `linear-gradient(160deg, ${lighten(bg, 0.12)}, ${bg})`,
        boxShadow: "0 22px 44px rgba(0, 0, 0, 0.25)",
        display: "flex",
        alignItems: "center",
        padding: "0 70px",
        gap: 60,
        boxSizing: "border-box",
        border: "10px solid #ffffff",
      }}
    >
      <div
        style={{
          flex: "0 0 300px",
          height: 300,
          borderRadius: "50%",
          background: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 10px 0 rgba(0, 0, 0, 0.1)",
        }}
      >
        <BadgeIcon kind={iconForText(text, index)} c={colors} size={210} t={frame / fps} />
      </div>
      <div
        style={{
          flex: 1,
          fontFamily: FONT_FAMILY,
          fontWeight: 900,
          fontSize: size,
          lineHeight: 1.08,
          color: ink,
        }}
      >
        {value}
      </div>
    </div>
  );
};

export const BienfaitsScene: React.FC<SceneProps> = ({ scene, video, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "bienfaits");
  const items = getBienfaitsItems(video);
  const introFrames = Math.round(BIENFAITS_INTRO_SECONDS * fps);
  const itemFrames = Math.round(BIENFAITS_ITEM_SECONDS * fps);
  const hasItems = items.length > 0;

  // Le titre commence en grand au centre puis se range en bandeau en haut.
  const dock = hasItems ? ease(frame, fps, introFrames - 10, 20) : 0;
  const titleScale = 1 - 0.5 * dock;
  const titleY = (1 - dock) * 360 + 34;

  // Couleurs des cartes « temps fort », qui doivent trancher sur le fond.
  const cardColors = [video.palette.primary, video.palette.accent, WHITE, video.palette.secondary].filter(
    (c) => !tooClose(c, theme.bg),
  );
  const cardW = 1180;
  const cardH = 720;
  const centerY = 600;

  const renderItem = (item: BienfaitsItem, i: number) => {
    const start = introFrames + i * itemFrames;
    const local = frame - start;
    if (local < -2) return null;
    // Seules les trois dernières cartes restent dessinées (les autres sont cachées dessous).
    const current = Math.floor((frame - introFrames) / itemFrames);
    if (i < current - 2) return null;
    const land = pop(frame, fps, start, 120, 13);
    const rest = RESTING[i % RESTING.length];
    const fromLeft = i % 2 === 0;
    const x = rest.x + (1 - land) * (fromLeft ? -1500 : 1500);
    const y = rest.y + (1 - land) * -120;
    const r = rest.r + (1 - land) * (fromLeft ? -22 : 22);
    // La légende s'efface quand la carte suivante arrive par-dessus.
    const nextStart = start + itemFrames;
    const captionOut = i < items.length - 1 ? Math.max(0, Math.min(1, (frame - nextStart) / 6)) : 0;
    const captionIn = pop(frame, fps, start + 12, 170, 11) * (1 - captionOut);
    const caption = item.kind === "photo" ? item.photo.caption.trim() : "";
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: 960 - cardW / 2,
          top: centerY - cardH / 2,
          width: cardW,
          height: cardH,
          transform: `translate(${x}px, ${y}px) rotate(${r}deg)`,
        }}
      >
        {item.kind === "photo" ? (
          <Polaroid width={cardW} height={cardH} tint={video.palette.secondary} ink={video.palette.dark}>
            <KenBurns src={item.photo.url} fallback={lighten(video.palette.primary, 0.5)} durationInFrames={itemFrames + 30} direction={i} delay={start} />
          </Polaroid>
        ) : (
          (() => {
            const bg = cardColors[i % Math.max(1, cardColors.length)] ?? video.palette.primary;
            return <HighlightCard text={item.text} bg={bg} ink={readableOn(bg, video.palette.dark)} index={i} video={video} />;
          })()
        )}
        {caption ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: -44,
              display: "flex",
              justifyContent: "center",
              transform: `scale(${captionIn}) rotate(${fromLeft ? -3 : 3}deg)`,
              opacity: Math.min(1, captionIn * 2),
            }}
          >
            <div
              style={{
                maxWidth: cardW - 160,
                padding: "18px 44px",
                borderRadius: 26,
                background: pickContrasting(WHITE, [video.palette.primary, video.palette.accent, video.palette.dark]),
                color: readableOn(pickContrasting(WHITE, [video.palette.primary, video.palette.accent, video.palette.dark]), video.palette.dark),
                fontFamily: FONT_FAMILY,
                fontWeight: 900,
                fontSize: fitFontSize(frenchSpaces(caption), cardW - 250, 2, 60, 34),
                lineHeight: 1.1,
                textAlign: "center",
                boxShadow: "0 10px 0 rgba(0, 0, 0, 0.15)",
              }}
            >
              {frenchSpaces(caption)}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <SceneBackdrop theme={theme} seed={401 + index} shapeCount={12}>
      {items.map(renderItem)}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 30,
            transform: `translateY(${titleY}px) scale(${titleScale})`,
            transformOrigin: "50% 0%",
          }}
        >
          <KineticTitle text={scene.title} color={theme.ink} shadow={theme.inkShadow} maxWidth={1500} maxSize={140} maxLines={1} delay={4} />
          <div style={{ opacity: 1 - dock }}>
            <Pill text={scene.subtitle} bg={theme.pill} color={theme.pillInk} delay={14} fontSize={50} />
          </div>
        </div>
      </AbsoluteFill>
      {items.slice(0, 8).map((_, i) => (
        <Sfx key={i} src={video.sfx?.pop} at={introFrames + i * itemFrames + 6} volume={0.4} />
      ))}
    </SceneBackdrop>
  );
};
