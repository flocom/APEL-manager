import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

import { contrastRatio, mix, WHITE } from "../colors";
import { Character, makeCast } from "../components/characters";
import { BadgeIcon, iconForText } from "../components/illustrations";
import { KenBurns, PhotoFrame } from "../components/media";
import { enter, progress } from "../components/motion";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { BODY_CHAR, fitFontSize, frenchSpaces, TextBlock } from "../components/text";
import {
  BIENFAITS_CARD_STAGGER_SECONDS,
  BIENFAITS_ITEM_SECONDS,
  bienfaitsSchedule,
  getBienfaitsItems,
} from "../timeline";
import { FONT_FAMILY, illuColors, sceneTheme } from "../theme";
import { MARGIN_X } from "./common";

const AREA = { x: 780, y: 120, w: 1020, h: 720 };

/**
 * « Concrètement » : les photos des réalisations (Ken Burns, cadre sobre,
 * légende), puis les temps forts en cartes. Une maman présente le tout.
 */
export const BienfaitsScene: React.FC<SceneProps> = ({ scene, video }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "bienfaits");
  const c = illuColors(video.palette);
  const cast = makeCast(c, theme.bold ? theme.bg : undefined);
  const items = getBienfaitsItems(video);
  const schedule = bienfaitsSchedule(items);
  const photos = items.flatMap((item) => (item.kind === "photo" ? [item.photo] : []));
  const texts = items.flatMap((item) => (item.kind === "highlight" ? [item.text] : []));
  const itemFrames = Math.round(BIENFAITS_ITEM_SECONDS * fps);
  const cardsStart = schedule.cardsStart === null ? null : Math.round(schedule.cardsStart * fps);
  const iconColors = [video.palette.primary, video.palette.secondary, video.palette.accent].map((col) =>
    contrastRatio(col, WHITE) >= 2 ? col : mix(col, video.palette.dark, 0.35),
  );

  const photoEls = photos.map((photo, i) => {
    const start = Math.round(schedule.photoStarts[i] * fps);
    const end = i < photos.length - 1 ? start + itemFrames : (cardsStart ?? Number.POSITIVE_INFINITY);
    if (frame < start - 1 || frame > end + 16) return null;
    const inK = enter(frame, start, 20);
    const outK = Number.isFinite(end) ? progress(frame, end, end + 14) : 0;
    const caption = frenchSpaces(photo.caption.trim());
    const captionSize = caption ? fitFontSize(caption, AREA.w - 70, 1, 40, 26, BODY_CHAR + 0.04) : 40;
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: AREA.x,
          top: AREA.y,
          width: AREA.w,
          height: AREA.h,
          opacity: inK * (1 - outK),
          transform: `translateX(${(1 - inK) * 60 - outK * 40}px)`,
        }}
      >
        <PhotoFrame width={AREA.w} height={AREA.h} ink={theme.ink} caption={caption || undefined} captionSize={captionSize}>
          <KenBurns src={photo.url} fallback={mix(video.palette.primary, WHITE, 0.6)} durationInFrames={itemFrames + 30} direction={i} delay={start} />
        </PhotoFrame>
      </div>
    );
  });

  // Petits repères de progression sous les photos.
  const photosVisible = photos.length > 1 && frame < (cardsStart ?? Number.POSITIVE_INFINITY) + 10;
  const current = Math.max(0, Math.min(photos.length - 1, Math.floor((frame / fps - (schedule.photoStarts[0] ?? 0)) / BIENFAITS_ITEM_SECONDS)));
  const dotsIn = photos.length ? enter(frame, Math.round((schedule.photoStarts[0] ?? 0) * fps), 20) : 0;

  let cardEls: React.ReactNode = null;
  if (cardsStart !== null && texts.length > 0) {
    const twoCols = texts.length > 3;
    const cols = twoCols ? 2 : 1;
    const gap = 24;
    const cardW = twoCols ? (AREA.w - gap) / 2 : AREA.w;
    const cardH = twoCols ? 186 : 170;
    const rows = Math.ceil(texts.length / cols);
    const gridH = rows * cardH + (rows - 1) * gap;
    const top = AREA.y + (AREA.h - gridH) / 2 + 20;
    const stagger = BIENFAITS_CARD_STAGGER_SECONDS * fps;
    cardEls = texts.map((text, i) => {
      const p = enter(frame, cardsStart + 8 + i * stagger, 20);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const color = iconColors[i % iconColors.length];
      const value = frenchSpaces(text);
      const textW = cardW - 60 - 104 - 28;
      const size = fitFontSize(value, textW, 2, twoCols ? 40 : 44, 26, 0.56);
      return (
        <div
          key={i}
          style={{
            position: "absolute",
            left: AREA.x + col * (cardW + gap),
            top: top + row * (cardH + gap),
            width: cardW,
            height: cardH,
            borderRadius: 26,
            background: WHITE,
            boxShadow: "0 18px 40px rgba(15, 25, 40, 0.10), 0 2px 8px rgba(15, 25, 40, 0.05)",
            display: "flex",
            alignItems: "center",
            gap: 28,
            padding: "0 30px",
            boxSizing: "border-box",
            opacity: p,
            transform: `translateY(${(1 - p) * 30}px)`,
          }}
        >
          <div
            style={{
              flex: "0 0 104px",
              height: 104,
              borderRadius: "50%",
              background: mix(color, WHITE, 0.86),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <BadgeIcon kind={iconForText(text, i)} color={color} accent={video.palette.accent === color ? video.palette.primary : video.palette.accent} size={62} />
          </div>
          <div style={{ flex: 1, fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: size, lineHeight: 1.16, color: theme.ink, letterSpacing: "-0.01em" }}>{value}</div>
        </div>
      );
    });
  }

  return (
    <SceneBackdrop theme={theme} floorY={960}>
      <div style={{ position: "absolute", left: MARGIN_X, top: 140, width: 600 }}>
        <TextBlock title={scene.title} subtitle={scene.subtitle} ink={theme.ink} muted={theme.muted} accent={theme.accent} maxWidth={600} maxLines={2} titleSize={100} subtitleSize={42} delay={6} />
      </div>
      <Character look={cast.claire} c={c} x={420} y={1015} height={480} gesture="present" gestureAt={26} gaze={0.6} tilt={2} seed={40} appear={4} shadow={theme.shadow} />
      {photoEls}
      {photosVisible ? (
        <div style={{ position: "absolute", left: AREA.x, top: AREA.y + AREA.h + 30, width: AREA.w, display: "flex", justifyContent: "center", gap: 14, opacity: dotsIn }}>
          {photos.map((_, i) => (
            <div key={i} style={{ width: i === current ? 40 : 14, height: 14, borderRadius: 7, background: i === current ? theme.accent : mix(theme.bg, theme.ink, 0.18) }} />
          ))}
        </div>
      ) : null}
      {cardEls}
      {schedule.photoStarts.slice(0, 8).map((s, i) => (
        <Sfx key={i} src={video.sfx?.pop} at={Math.round(s * fps) + 2} volume={0.16} />
      ))}
      {cardsStart !== null ? <Sfx src={video.sfx?.pop} at={cardsStart + 8} volume={0.16} /> : null}
    </SceneBackdrop>
  );
};
