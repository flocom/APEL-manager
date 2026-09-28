import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { contrastRatio, mix, withAlpha, WHITE } from "../colors";
import { Character, makeCast } from "../components/characters";
import { GeoShapes } from "../components/decor";
import { Camera, Sheen } from "../components/finish";
import { BadgeIcon, iconForText } from "../components/illustrations";
import { snap } from "../components/motion";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { BODY_CHAR, fitFontSize, frenchSpaces, TextBlock } from "../components/text";
import { CHIFFRES_MAX } from "../timeline";
import { FONT_FAMILY, illuColors, sceneTheme } from "../theme";
import { chapter, MARGIN_X } from "./common";

/** 12500 → « 12 500 » (espace insécable, sans dépendre d'Intl). */
export function formatFigure(value: number): string {
  const rounded = Math.round(Math.max(0, value));
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

const COUNT_SECONDS = 1.1;
const AREA = { x: 750, w: 1050, top: 250, h: 620 };

/** Chiffres clés : cartes sobres, comptage qui ralentit, un papa les présente. */
export const ChiffresScene: React.FC<SceneProps> = ({ scene, video, durationInFrames, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "chiffres");
  const c = illuColors(video.palette);
  const cast = makeCast(c, theme.bold ? theme.bg : undefined);
  const figures = video.figures.slice(0, CHIFFRES_MAX);
  const n = Math.max(1, figures.length);
  const gap = 32;
  const cardW = (AREA.w - gap * (n - 1)) / n;
  const cardH = n === 3 ? 440 : 470;
  const startOf = (i: number) => 10 + i * 6;
  const ghostIn = Math.max(0, Math.min(1, snap(frame, fps, 2, 120, 20)));
  // Chiffres tous dans la même couleur lisible ; la palette varie sur les pictogrammes.
  const numberColor = contrastRatio(video.palette.primary, WHITE) >= 3 ? video.palette.primary : video.palette.dark;
  const colors = [video.palette.primary, video.palette.secondary, video.palette.accent].map((col) =>
    contrastRatio(col, WHITE) >= 2 ? col : mix(col, video.palette.dark, 0.3),
  );

  return (
    <SceneBackdrop theme={theme} floorY={960} durationInFrames={durationInFrames}>
      <Camera depth={0.5} durationInFrames={durationInFrames}>
        {/* Grand chiffre en filigrane, élément graphique de fond. */}
        {figures[0] ? (
          <div
            style={{
              position: "absolute",
              right: -40,
              top: 20,
              fontFamily: FONT_FAMILY,
              fontWeight: 900,
              fontSize: 820,
              lineHeight: 1,
              letterSpacing: "-0.06em",
              color: withAlpha(theme.ink, 0.07),
              transform: `translateY(${(1 - ghostIn) * 120}px)`,
              opacity: ghostIn,
              whiteSpace: "nowrap",
            }}
          >
            {formatFigure(figures[0].value)}
          </div>
        ) : null}
        <GeoShapes
          shapes={[
            { kind: "band", x: 1500, y: 150, w: 1100, h: 14, angle: -10, color: theme.shapes[0], at: 0 },
            { kind: "disc", x: 1870, y: 1010, r: 120, color: theme.shapes[1] ?? theme.shapes[0], at: 4 },
            { kind: "dots", x: 640, y: 900, cols: 3, rows: 2, gap: 30, r: 5, color: theme.shapes[0], at: 8 },
          ]}
        />
      </Camera>
      <Camera depth={0.3} durationInFrames={durationInFrames}>
        <div style={{ position: "absolute", left: MARGIN_X, top: 130, width: 580 }}>
          <TextBlock title={scene.title} subtitle={scene.subtitle} ink={theme.ink} muted={theme.muted} accent={theme.accent} marker={{ color: theme.marker, ink: theme.markerInk }} maxWidth={580} maxLines={3} titleSize={120} subtitleSize={42} delay={3} eyebrow={chapter(index, video.associationName)} />
        </div>
      </Camera>
      <Camera depth={1} durationInFrames={durationInFrames}>
        <Character look={cast.karim} c={c} x={430} y={1015} height={480} gesture="present" gestureAt={12} gaze={0.6} seed={50} appear={4} shadow={theme.shadow} />
        <div style={{ position: "absolute", left: AREA.x, top: AREA.top, width: AREA.w, height: AREA.h, display: "flex", alignItems: "center", gap }}>
          {figures.map((figure, i) => {
            const start = startOf(i);
            const p = Math.max(0, snap(frame, fps, start, 260, 18));
            const countEnd = start + 4 + Math.round(COUNT_SECONDS * fps);
            const count = interpolate(frame, [start + 4, countEnd], [0, figure.value], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            });
            // Petit « pop » du chiffre quand le comptage s'arrête.
            const bump = 1 + 0.14 * Math.sin(Math.PI * Math.min(1, Math.max(0, (frame - countEnd) / 9)));
            const color = colors[i % colors.length];
            const finalText = formatFigure(figure.value);
            const numberSize = Math.min(n === 3 ? 150 : 176, (cardW - 90) / (Math.max(2, finalText.length) * 0.62));
            const label = frenchSpaces(figure.label);
            return (
              <div
                key={i}
                style={{
                  width: cardW,
                  height: cardH,
                  borderRadius: 34,
                  background: WHITE,
                  boxShadow: "0 24px 50px rgba(15, 25, 40, 0.10), 0 3px 10px rgba(15, 25, 40, 0.05)",
                  padding: "44px 44px 40px",
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-start",
                  gap: 18,
                  opacity: Math.min(1, p * 3),
                  position: "relative",
                  overflow: "hidden",
                  transform: `perspective(1400px) rotateY(${(1 - p) * -40}deg) translateY(${(1 - p) * 60}px) scale(${0.8 + 0.2 * p})`,
                }}
              >
                <Sheen at={countEnd + 2} width={140} opacity={0.6} />
                <div style={{ width: 84, height: 84, borderRadius: "50%", background: mix(color, WHITE, 0.87), display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <BadgeIcon kind={iconForText(figure.label, i)} color={color} accent={video.palette.accent === color ? video.palette.primary : video.palette.accent} size={50} />
                </div>
                <div
                  style={{
                    marginTop: 16,
                    fontFamily: FONT_FAMILY,
                    fontWeight: 900,
                    fontSize: numberSize,
                    lineHeight: 1,
                    letterSpacing: "-0.04em",
                    color: numberColor,
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                    transform: `scale(${bump})`,
                    transformOrigin: "0% 70%",
                  }}
                >
                  {formatFigure(count)}
                </div>
                <div
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontWeight: 600,
                    fontSize: fitFontSize(label, cardW - 88, 2, n === 3 ? 36 : 40, 24, BODY_CHAR + 0.04),
                    lineHeight: 1.2,
                    color: mix(video.palette.dark, WHITE, 0.25),
                  }}
                >
                  {label}
                </div>
              </div>
            );
          })}
        </div>
      </Camera>
      {figures.map((_, i) => (
        <Sfx key={i} src={video.sfx?.pop} at={startOf(i) + 4 + Math.round(COUNT_SECONDS * fps)} volume={0.3} />
      ))}
    </SceneBackdrop>
  );
};
