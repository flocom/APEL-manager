import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { contrastRatio, mix, WHITE } from "../colors";
import { Character, makeCast } from "../components/characters";
import { BadgeIcon, iconForText } from "../components/illustrations";
import { enter } from "../components/motion";
import { SceneBackdrop, type SceneProps } from "../components/scene";
import { BODY_CHAR, fitFontSize, frenchSpaces, TextBlock } from "../components/text";
import { CHIFFRES_MAX } from "../timeline";
import { FONT_FAMILY, illuColors, sceneTheme } from "../theme";
import { MARGIN_X } from "./common";

/** 12500 → « 12 500 » (espace insécable, sans dépendre d'Intl). */
export function formatFigure(value: number): string {
  const rounded = Math.round(Math.max(0, value));
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

const COUNT_SECONDS = 1.8;
const AREA = { x: 750, w: 1050, top: 250, h: 620 };

/** Chiffres clés : cartes sobres, comptage qui ralentit, un papa les présente. */
export const ChiffresScene: React.FC<SceneProps> = ({ scene, video }) => {
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
  const startOf = (i: number) => 22 + i * 10;
  // Chiffres tous dans la même couleur lisible ; la palette varie sur les pictogrammes.
  const numberColor = contrastRatio(video.palette.primary, WHITE) >= 3 ? video.palette.primary : video.palette.dark;
  const colors = [video.palette.primary, video.palette.secondary, video.palette.accent].map((col) =>
    contrastRatio(col, WHITE) >= 2 ? col : mix(col, video.palette.dark, 0.3),
  );

  return (
    <SceneBackdrop theme={theme} floorY={960}>
      <div style={{ position: "absolute", left: MARGIN_X, top: 140, width: 580 }}>
        <TextBlock title={scene.title} subtitle={scene.subtitle} ink={theme.ink} muted={theme.muted} accent={theme.accent} maxWidth={580} maxLines={3} titleSize={100} subtitleSize={42} delay={4} />
      </div>
      <Character look={cast.karim} c={c} x={430} y={1015} height={480} gesture="present" gestureAt={30} gaze={0.6} seed={50} appear={6} shadow={theme.shadow} />
      <div style={{ position: "absolute", left: AREA.x, top: AREA.top, width: AREA.w, height: AREA.h, display: "flex", alignItems: "center", gap }}>
        {figures.map((figure, i) => {
          const start = startOf(i);
          const p = enter(frame, start, 22);
          const count = interpolate(frame, [start + 6, start + 6 + COUNT_SECONDS * fps], [0, figure.value], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
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
                opacity: p,
                transform: `translateY(${(1 - p) * 40}px)`,
              }}
            >
              <div style={{ width: 84, height: 84, borderRadius: "50%", background: mix(color, WHITE, 0.87), display: "flex", alignItems: "center", justifyContent: "center" }}>
                <BadgeIcon kind={iconForText(figure.label, i)} color={color} accent={video.palette.accent === color ? video.palette.primary : video.palette.accent} size={50} />
              </div>
              <div
                style={{
                  marginTop: 16,
                  fontFamily: FONT_FAMILY,
                  fontWeight: 800,
                  fontSize: numberSize,
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                  color: numberColor,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
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
                  color: theme.muted,
                }}
              >
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </SceneBackdrop>
  );
};
