import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { contrastRatio, readableOn, WHITE } from "../colors";
import { ConfettiRain } from "../components/decor";
import { heartPath } from "../components/illustrations";
import { bob, pop, seeded } from "../components/motion";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { fitFontSize, KineticTitle, Pill } from "../components/text";
import { FONT_FAMILY, illuColors, sceneTheme } from "../theme";
import { LogoCard } from "./IntroScene";

/** Cœurs qui montent doucement depuis le bas de l'écran. */
const RisingHearts: React.FC<{ colors: string[]; count?: number }> = ({ colors, count = 9 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const rand = seeded(77);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: count }, (_, i) => {
        const x = 80 + rand() * (width - 160);
        const size = 50 + rand() * 60;
        const speed = 2.2 + rand() * 2;
        const delay = rand() * 60;
        const color = colors[i % colors.length];
        const travelled = (frame - delay) * speed;
        if (travelled < 0) return null;
        const y = height + 60 - (travelled % (height + 200));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x + bob(frame, fps, 24, 2.4, i),
              top: y,
              width: size,
              height: size,
              transform: `rotate(${bob(frame, fps, 12, 3, i)}deg)`,
              opacity: 0.9,
            }}
          >
            <svg width={size} height={size} viewBox="0 0 100 100">
              <path d={heartPath(50, 50, 40)} fill={color} />
            </svg>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Fin : « Merci ! », confettis, et l'adresse pour nous rejoindre. */
export const FinScene: React.FC<SceneProps> = ({ scene, video, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "fin");
  const colors = illuColors(video.palette);
  const ctaIn = pop(frame, fps, 34, 140, 10);
  const pulse = 1 + 0.035 * Math.max(0, Math.sin(((frame - 50) / fps) * Math.PI * 1.6));
  const ctaBg = WHITE;
  const ctaInk = contrastRatio(video.palette.primary, ctaBg) >= 4.5 ? video.palette.primary : video.palette.dark;
  const join = video.joinLabel.trim();
  const logoIn = pop(frame, fps, 2, 160, 12);

  return (
    <SceneBackdrop theme={theme} seed={709 + index} shapeCount={10}>
      <RisingHearts colors={[colors.c, colors.b, WHITE]} />
      <ConfettiRain colors={[...theme.shapes, WHITE]} count={70} delay={6} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 36 }}>
        {video.logoUrl ? (
          <div style={{ transform: `scale(${logoIn})`, marginBottom: 6 }}>
            <LogoCard
              logoUrl={video.logoUrl}
              fallbackText={video.associationName}
              width={330}
              height={186}
              ink={video.palette.primary}
              fallbackBg={video.palette.light}
            />
          </div>
        ) : null}
        <KineticTitle text={scene.title} color={theme.ink} shadow={theme.inkShadow} maxWidth={1600} maxSize={190} maxLines={1} delay={8} stagger={4} />
        <Pill text={scene.subtitle} bg={theme.pill} color={theme.pillInk} delay={20} fontSize={50} />
        {join ? (
          <div
            style={{
              marginTop: 18,
              display: "flex",
              alignItems: "center",
              gap: 28,
              padding: "26px 56px 26px 34px",
              borderRadius: 999,
              background: ctaBg,
              boxShadow: "0 14px 0 rgba(0, 0, 0, 0.16)",
              transform: `scale(${ctaIn * pulse}) rotate(${(1 - ctaIn) * -8}deg)`,
              opacity: Math.min(1, ctaIn * 2),
            }}
          >
            <div
              style={{
                width: 92,
                height: 92,
                borderRadius: "50%",
                background: video.palette.primary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width={62} height={62} viewBox="0 0 100 100">
                <path d={heartPath(50, 50, 38)} fill={readableOn(video.palette.primary, video.palette.dark)} />
              </svg>
            </div>
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontWeight: 900,
                fontSize: fitFontSize(join, 1300, 1, 72, 36),
                color: ctaInk,
                whiteSpace: "nowrap",
              }}
            >
              {join}
            </div>
          </div>
        ) : null}
      </AbsoluteFill>
      <Sfx src={video.sfx?.sparkle} at={10} volume={0.45} />
      {join ? <Sfx src={video.sfx?.pop} at={35} volume={0.45} /> : null}
    </SceneBackdrop>
  );
};
