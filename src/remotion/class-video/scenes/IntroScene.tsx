import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { withAlpha } from "../colors";
import { Character, makeCast } from "../components/characters";
import { GeoShapes } from "../components/decor";
import { Camera, EXPO_IN_OUT, Sheen } from "../components/finish";
import { snap } from "../components/motion";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { Bush, Cloud, School, Tree } from "../components/scenery";
import { AccentBar, splitWords, Subtitle, Title } from "../components/text";
import { illuColors, pickContrasting, sceneTheme } from "../theme";
import { LogoCard, MARGIN_X } from "./common";

export { LogoCard, shortName } from "./common";

const FLOOR = 880;
/** Fin de la signature du logo : le titre claque à ce moment-là. */
const STING_END = 26;
const CARD_W = 420;
const CARD_H = 236;
const SLOT = { x: MARGIN_X, y: 120, w: 270 };

/**
 * Ouverture : signature animée du logo (il surgit au centre, des anneaux
 * s'en échappent, un reflet le balaie), puis il file se ranger en haut à
 * gauche pendant que le titre d'accroche claque mot par mot, mot clé
 * surligné, et que l'école et les familles surgissent.
 */
export const IntroScene: React.FC<SceneProps> = ({ scene, video, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "intro");
  const c = illuColors(video.palette);
  const cast = makeCast(c, theme.bg);
  const title = scene.title.trim() || video.associationName;
  const subtitle = scene.subtitle.trim() || video.schoolName;
  const words = splitWords(title).length;
  const at = STING_END;
  const schoolIn = Math.max(0, snap(frame, fps, at + 4, 200, 20));
  const drift = (frame / fps) * 10;
  const roof = pickContrasting(theme.bg, [video.palette.secondary, c.aDark, c.ink]);
  const marker = { color: theme.marker, ink: theme.markerInk };

  // Signature : le logo surgit au centre puis rejoint sa place.
  const pop = Math.max(0, snap(frame, fps, 0, 200, 16));
  const move = interpolate(frame, [at - 6, at + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO_IN_OUT });
  const slotScale = SLOT.w / CARD_W;
  const cx = interpolate(move, [0, 1], [960, SLOT.x + (CARD_W * slotScale) / 2]);
  const cy = interpolate(move, [0, 1], [520, SLOT.y + (CARD_H * slotScale) / 2]);
  const cardScale = pop * interpolate(move, [0, 1], [1, slotScale]);

  return (
    <SceneBackdrop theme={theme} floorY={FLOOR} blob={{ x: 1400, y: 600, r: 430 }} durationInFrames={durationInFrames}>
      <Camera depth={0.7} durationInFrames={durationInFrames}>
        <GeoShapes
          delay={at}
          shapes={[
            { kind: "disc", x: 1820, y: 120, r: 150, color: theme.shapes[0], at: 0 },
            { kind: "ring", x: 1040, y: 170, r: 46, width: 6, color: theme.shapes[0], at: 5 },
            { kind: "dots", x: 1700, y: 430, cols: 3, rows: 3, gap: 30, r: 5, color: withAlpha("#ffffff", 0.8), at: 8 },
          ]}
        />
        <Cloud x={1150 + drift} y={250} width={180} color="#ffffff" style={{ opacity: 0.85 * Math.min(1, schoolIn) }} />
        <div style={{ position: "absolute", inset: 0, transformOrigin: "1400px 880px", transform: `scale(${schoolIn})` }}>
          <Tree x={960} y={FLOOR - 320} width={210} c={c} />
          <Tree x={1690} y={FLOOR - 290} width={190} c={c} variant={1} />
          <School x={1000} y={FLOOR - 500} width={800} c={c} roof={roof} />
          <Bush x={960} y={FLOOR - 66} width={180} c={c} />
          <Bush x={1650} y={FLOOR - 60} width={160} c={c} />
        </div>
        <Character look={cast.claire} c={c} x={1150} y={990} height={430} appear={at + 8} reachRight={{ x: 52, y: -160, rel: true }} gaze={0.4} seed={1} shadow={theme.shadow} groove={3} />
        <Character look={cast.lea} c={c} x={1250} y={995} height={280} appear={at + 11} reachLeft={{ x: -48, y: -155, rel: true }} gaze={-0.3} tilt={-3} mood="laugh" seed={2} shadow={theme.shadow} groove={4} />
        <Character look={cast.noah} c={c} x={1560} y={995} height={290} appear={at + 15} gaze={0.5} seed={3} shadow={theme.shadow} gesture="cheer" gestureAt={at + 30} groove={4} />
        <Character look={cast.karim} c={c} x={1700} y={990} height={440} walk={{ from: 2150, at: at + 4, duration: 24 }} gaze={-0.5} seed={4} shadow={theme.shadow} gesture="wave" gestureAt={at + 28} side="right" groove={3} />
      </Camera>

      <Camera depth={0.3} durationInFrames={durationInFrames}>
        <div style={{ position: "absolute", left: MARGIN_X, top: 330, width: 860, display: "flex", flexDirection: "column", gap: 26 }}>
          <AccentBar color={theme.accent} delay={at} />
          <Title text={title} color={theme.ink} maxWidth={860} maxSize={148} maxLines={3} delay={at + 2} mode="slam" marker={marker} />
          <Subtitle text={subtitle} color={theme.muted} maxWidth={820} size={50} delay={at + 12 + words * 4} />
        </div>
      </Camera>

      {/* Anneaux qui s'échappent du logo pendant la signature. */}
      {[0, 5, 10].map((d) => {
        const k = interpolate(frame, [d, d + 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        if (k <= 0 || k >= 1) return null;
        const r = 180 + k * 520;
        return (
          <div
            key={d}
            style={{
              position: "absolute",
              left: 960 - r,
              top: 520 - r,
              width: r * 2,
              height: r * 2,
              borderRadius: "50%",
              border: `3px solid ${withAlpha("#ffffff", 0.7 * (1 - k))}`,
              boxSizing: "border-box",
            }}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          left: cx - CARD_W / 2,
          top: cy - CARD_H / 2,
          width: CARD_W,
          height: CARD_H,
          borderRadius: 36,
          boxShadow: `0 ${30 * (1 - move) + 10}px ${60 * (1 - move) + 24}px rgba(0, 0, 0, 0.25)`,
          transform: `scale(${cardScale})`,
        }}
      >
        <div style={{ position: "relative", width: CARD_W, height: CARD_H, borderRadius: 36, overflow: "hidden" }}>
          <LogoCard logoUrl={video.logoUrl} fallbackText={video.associationName} width={CARD_W} height={CARD_H} ink={video.palette.primary} fallbackBg={video.palette.light} />
          <Sheen at={8} width={120} opacity={0.7} />
        </div>
      </div>
      <Sfx src={video.sfx?.sparkle} at={0} volume={0.45} />
      <Sfx src={video.sfx?.whoosh} at={at - 6} volume={0.25} />
    </SceneBackdrop>
  );
};
