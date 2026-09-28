import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { darken, lighten, readableOn, tooClose } from "../colors";
import { Twinkles } from "../components/decor";
import { BadgeIcon, iconForText } from "../components/illustrations";
import { bob, pop } from "../components/motion";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { fitFontSize, frenchSpaces, KineticTitle, Pill } from "../components/text";
import { CHIFFRES_MAX } from "../timeline";
import { FONT_FAMILY, illuColors, sceneTheme } from "../theme";

/** 12500 → « 12 500 » (espace insécable, sans dépendre d'Intl). */
export function formatFigure(value: number): string {
  const rounded = Math.round(Math.max(0, value));
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

const COUNT_SECONDS = 1.7;

export const ChiffresScene: React.FC<SceneProps> = ({ scene, video, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "chiffres");
  const colors = illuColors(video.palette);
  const figures = video.figures.slice(0, CHIFFRES_MAX);
  const circle = figures.length <= 2 ? 460 : 420;
  const badgeColors = [video.palette.primary, video.palette.secondary, video.palette.accent, video.palette.dark].filter(
    (c) => !tooClose(c, theme.bg),
  );
  const startOf = (i: number) => 18 + i * 12;
  const countEnd = startOf(figures.length - 1) + 6 + Math.round(COUNT_SECONDS * fps);

  return (
    <SceneBackdrop theme={theme} seed={503 + index} shapeCount={12}>
      <Twinkles color={theme.pop} seed={29} count={9} delay={countEnd - 6} box={{ x: 120, y: 260, w: 1680, h: 640 }} size={54} />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 70 }}>
        <KineticTitle text={scene.title} color={theme.ink} shadow={theme.inkShadow} maxWidth={1600} maxSize={120} maxLines={1} delay={2} />
        <div style={{ height: 22 }} />
        <Pill text={scene.subtitle} bg={theme.pill} color={theme.pillInk} delay={10} fontSize={42} />
      </AbsoluteFill>
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 90, paddingTop: 190 }}>
        {figures.map((figure, i) => {
          const start = startOf(i);
          const p = pop(frame, fps, start, 150, 10);
          const count = interpolate(frame, [start + 6, start + 6 + COUNT_SECONDS * fps], [0, figure.value], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
          const done = frame >= start + 6 + COUNT_SECONDS * fps;
          const bump = done ? 1 + 0.08 * Math.max(0, 1 - (frame - (start + 6 + COUNT_SECONDS * fps)) / 8) : 1;
          const bg = badgeColors[i % Math.max(1, badgeColors.length)] ?? video.palette.primary;
          const ink = readableOn(bg, video.palette.dark);
          const finalText = formatFigure(figure.value);
          const numberSize = Math.min(170, (circle * 0.78) / (Math.max(2, finalText.length) * 0.62));
          return (
            <div
              key={i}
              style={{
                width: circle + 40,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 34,
                transform: `translateY(${bob(frame, fps, 8, 2.8, i * 1.7)}px)`,
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: circle,
                  height: circle,
                  transform: `scale(${p * bump}) rotate(${(1 - p) * (i % 2 ? 20 : -20)}deg)`,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    background: darken(bg, 0.2),
                    transform: "translate(0px, 18px)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    background: `linear-gradient(160deg, ${lighten(bg, 0.16)}, ${bg})`,
                    border: "10px solid #ffffff",
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: ink,
                    fontFamily: FONT_FAMILY,
                    fontWeight: 900,
                    fontSize: numberSize,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {formatFigure(count)}
                </div>
                <div
                  style={{
                    position: "absolute",
                    right: -6,
                    top: -6,
                    width: 140,
                    height: 140,
                    borderRadius: "50%",
                    background: "#ffffff",
                    boxShadow: "0 8px 0 rgba(0, 0, 0, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transform: `scale(${pop(frame, fps, start + 8, 200, 10)})`,
                  }}
                >
                  <BadgeIcon kind={iconForText(figure.label, i)} c={colors} size={96} t={frame / fps} />
                </div>
              </div>
              <div
                style={{
                  maxWidth: circle + 40,
                  textAlign: "center",
                  fontFamily: FONT_FAMILY,
                  fontWeight: 800,
                  fontSize: fitFontSize(frenchSpaces(figure.label), circle + 40, 2, 50, 30),
                  lineHeight: 1.12,
                  color: theme.ink,
                  opacity: Math.min(1, pop(frame, fps, start + 10) * 1.5),
                }}
              >
                {frenchSpaces(figure.label)}
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
      {figures.map((_, i) => (
        <Sfx key={i} src={video.sfx?.pop} at={startOf(i) + 1} volume={0.4} />
      ))}
      {figures.length > 0 ? <Sfx src={video.sfx?.sparkle} at={countEnd - 2} volume={0.45} /> : null}
    </SceneBackdrop>
  );
};
