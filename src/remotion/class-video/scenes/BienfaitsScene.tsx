import React from "react";
import { Easing, useCurrentFrame, useVideoConfig } from "remotion";

import { contrastRatio, mix, WHITE } from "../colors";
import { Character, makeCast } from "../components/characters";
import { GeoShapes } from "../components/decor";
import { Camera, Sheen } from "../components/finish";
import { BadgeIcon, iconForText } from "../components/illustrations";
import { KenBurns, PhotoFrame } from "../components/media";
import { progress, snap } from "../components/motion";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { fitFontSize, frenchSpaces, TextBlock } from "../components/text";
import {
  BIENFAITS_CARD_STAGGER_SECONDS,
  BIENFAITS_ITEM_SECONDS,
  bienfaitsSchedule,
  getBienfaitsItems,
} from "../timeline";
import { FONT_FAMILY, illuColors, sceneTheme } from "../theme";
import { chapter, MARGIN_X } from "./common";

const AREA = { x: 770, y: 110, w: 1030, h: 740 };

/**
 * « Concrètement » : les photos des réalisations (Ken Burns, cadre sobre,
 * légende), puis les temps forts en cartes. Une maman présente le tout.
 */
export const BienfaitsScene: React.FC<SceneProps> = ({ scene, video, durationInFrames, index }) => {
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
    // Coupe franche : la photo remplace la précédente d'un coup, avec un zoom qui claque.
    if (frame < start || frame >= end) return null;
    const first = i === 0;
    const punch = first ? Math.max(0, snap(frame, fps, start, 240, 19)) : progress(frame, start, start + 8, Easing.bezier(0.16, 1, 0.3, 1));
    const scale = first ? 0.6 + 0.4 * punch : 1.1 - 0.1 * punch;
    const caption = frenchSpaces(photo.caption.trim());
    const captionSize = caption ? fitFontSize(caption, AREA.w - 160, 1, 44, 26, 0.56) : 44;
    const chipIn = progress(frame, start + 4, start + 14, Easing.bezier(0.16, 1, 0.3, 1));
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: AREA.x,
          top: AREA.y,
          width: AREA.w,
          height: AREA.h,
          transform: `perspective(1600px) rotateY(${first ? (1 - punch) * -28 : 0}deg) scale(${scale}) rotate(${i % 2 ? 1.4 : -1.4}deg)`,
        }}
      >
        <PhotoFrame width={AREA.w} height={AREA.h} ink={theme.ink}>
          <KenBurns src={photo.url} fallback={mix(video.palette.primary, WHITE, 0.6)} durationInFrames={itemFrames} direction={i} delay={start} />
          <Sheen at={start + 3} width={200} opacity={0.35} />
        </PhotoFrame>
        {caption ? (
          <div style={{ position: "absolute", left: -24, bottom: 48, maxWidth: AREA.w - 40, overflow: "hidden", borderRadius: 16 }}>
            <div
              style={{
                padding: "16px 30px",
                background: theme.marker,
                color: theme.markerInk,
                fontFamily: FONT_FAMILY,
                fontWeight: 800,
                fontSize: captionSize,
                letterSpacing: "-0.01em",
                whiteSpace: "nowrap",
                transform: `translateX(${(chipIn - 1) * 105}%)`,
              }}
            >
              {caption}
            </div>
          </div>
        ) : null}
      </div>
    );
  });

  // Petits repères de progression sous les photos.
  const photosVisible = photos.length > 1 && frame < (cardsStart ?? Number.POSITIVE_INFINITY) + 10;
  const current = Math.max(0, Math.min(photos.length - 1, Math.floor((frame / fps - (schedule.photoStarts[0] ?? 0)) / BIENFAITS_ITEM_SECONDS)));
  const dotsIn = photos.length ? progress(frame, Math.round((schedule.photoStarts[0] ?? 0) * fps), Math.round((schedule.photoStarts[0] ?? 0) * fps) + 8) : 0;

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
      const p = Math.max(0, snap(frame, fps, cardsStart + 4 + i * stagger, 260, 18));
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
            opacity: Math.min(1, p * 3),
            overflow: "hidden",
            transformOrigin: "50% 100%",
            transform: `perspective(1200px) rotateX(${(1 - p) * 55}deg) translateY(${(1 - p) * 40}px) scale(${0.85 + 0.15 * p})`,
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
          <Sheen at={cardsStart + 12 + i * stagger} width={120} opacity={0.6} />
        </div>
      );
    });
  }

  return (
    <SceneBackdrop theme={theme} floorY={960} durationInFrames={durationInFrames}>
      <Camera depth={0.6} durationInFrames={durationInFrames}>
        <GeoShapes
          shapes={[
            { kind: "disc", x: 1840, y: 100, r: 120, color: theme.shapes[0], at: 0 },
            { kind: "dots", x: 90, y: 560, cols: 2, rows: 4, gap: 30, r: 5, color: theme.shapes[2] ?? theme.shapes[0], at: 5 },
            { kind: "ring", x: 740, y: 950, r: 44, width: 6, color: theme.shapes[1] ?? theme.shapes[0], at: 8 },
          ]}
        />
      </Camera>
      <Camera depth={0.3} durationInFrames={durationInFrames}>
        <div style={{ position: "absolute", left: MARGIN_X, top: 130, width: 600 }}>
          <TextBlock title={scene.title} subtitle={scene.subtitle} ink={theme.ink} muted={theme.muted} accent={theme.accent} marker={{ color: theme.marker, ink: theme.markerInk }} maxWidth={600} maxLines={2} titleSize={110} subtitleSize={42} delay={3} eyebrow={chapter(index, video.associationName)} />
        </div>
      </Camera>
      <Camera depth={1} durationInFrames={durationInFrames}>
        <Character look={cast.claire} c={c} x={420} y={1015} height={480} gesture="present" gestureAt={14} gaze={0.6} tilt={2} seed={40} appear={4} shadow={theme.shadow} />
        {photoEls}
        {photosVisible ? (
          <div style={{ position: "absolute", left: AREA.x, top: AREA.y + AREA.h + 30, width: AREA.w, display: "flex", justifyContent: "center", gap: 14, opacity: dotsIn }}>
            {photos.map((_, i) => (
              <div key={i} style={{ width: i === current ? 40 : 14, height: 14, borderRadius: 7, background: i === current ? theme.accent : mix(theme.bg, theme.ink, 0.18) }} />
            ))}
          </div>
        ) : null}
        {cardEls}
      </Camera>
      {schedule.photoStarts.slice(0, 8).map((s, i) => (
        <Sfx key={i} src={video.sfx?.pop} at={Math.round(s * fps)} volume={0.28} />
      ))}
      {cardsStart !== null ? <Sfx src={video.sfx?.pop} at={cardsStart + 4} volume={0.28} /> : null}
    </SceneBackdrop>
  );
};
