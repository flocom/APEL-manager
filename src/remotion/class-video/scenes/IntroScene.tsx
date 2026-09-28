import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { withAlpha } from "../colors";
import { Character, makeCast } from "../components/characters";
import { GeoShapes, Sparkles } from "../components/decor";
import { Camera, EXPO_IN_OUT, Sheen } from "../components/finish";
import { snap } from "../components/motion";
import { Silhouette } from "../components/objects";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { AccentBar, splitWords, Title } from "../components/text";
import { illuColors, sceneTheme } from "../theme";
import { LogoCard, MARGIN_X } from "./common";

export { LogoCard, shortName } from "./common";

const FLOOR = 880;
/** Fin de la signature du logo : le titre claque à ce moment-là. */
const STING_END = 26;
const CARD_W = 420;
const CARD_H = 236;
const SLOT = { x: MARGIN_X, y: 110, w: 250 };
/** Place vide dans la rangée de parents, que « vous » vient occuper. */
const SPOT_X = 1470;

/**
 * Ouverture en deux temps. Signature du logo (il surgit au centre, des
 * anneaux s'en échappent, un reflet le balaie), puis il file se ranger
 * pendant que le titre claque (« L'APEL, c'est nous. »). Un temps plus tard,
 * le sous-titre frappe à son tour (« Et ça peut être vous. », mot clé
 * surligné) : la place vide dans la rangée de parents se remplit.
 */
export const IntroScene: React.FC<SceneProps> = ({ scene, video, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "intro");
  const c = illuColors(video.palette);
  const cast = makeCast(c, theme.bg);
  const title = scene.title.trim() || video.associationName;
  const subtitle = scene.subtitle.trim() || video.schoolName;
  const at = STING_END;
  const words = splitWords(title).length;
  // Second temps, calé sur la mesure suivante (un temps = 15 images à 30 i/s).
  const punch = Math.max(at + 30, Math.ceil((at + 8 + words * 4) / 15) * 15 + 15);
  const marker = { color: theme.marker, ink: theme.markerInk };

  // Signature : le logo surgit au centre puis rejoint sa place.
  const pop = Math.max(0, snap(frame, fps, 0, 200, 16));
  const move = interpolate(frame, [at - 6, at + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO_IN_OUT });
  const slotScale = SLOT.w / CARD_W;
  const cx = interpolate(move, [0, 1], [960, SLOT.x + (CARD_W * slotScale) / 2]);
  const cy = interpolate(move, [0, 1], [520, SLOT.y + (CARD_H * slotScale) / 2]);
  const cardScale = pop * interpolate(move, [0, 1], [1, slotScale]);

  // La silhouette s'efface quand le nouveau parent arrive.
  const spotIn = Math.max(0, snap(frame, fps, at + 14, 220, 20));
  const spotOut = interpolate(frame, [punch - 2, punch + 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const burst = interpolate(frame, [punch, punch + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lookAt = (x: number) => (frame < punch + 6 ? Math.max(-1, Math.min(1, (SPOT_X - x) / 250)) : 0);

  return (
    <SceneBackdrop theme={theme} floorY={FLOOR} blob={{ x: 1380, y: 600, r: 440 }} durationInFrames={durationInFrames}>
      <Camera depth={0.6} durationInFrames={durationInFrames}>
        <GeoShapes
          delay={at}
          shapes={[
            { kind: "disc", x: 1820, y: 110, r: 140, color: theme.shapes[0], at: 0 },
            { kind: "ring", x: 1030, y: 190, r: 44, width: 6, color: theme.shapes[0], at: 5 },
            { kind: "dots", x: 1700, y: 380, cols: 3, rows: 3, gap: 30, r: 5, color: withAlpha("#ffffff", 0.8), at: 8 },
            { kind: "band", x: 1500, y: 1030, w: 900, h: 14, angle: -8, color: theme.shapes[1] ?? theme.shapes[0], at: 10 },
          ]}
        />
      </Camera>
      <Camera depth={1} durationInFrames={durationInFrames}>
        <div style={{ position: "absolute", left: SPOT_X - 80, top: 1000 - 440, width: 160, height: 420, opacity: spotOut, transformOrigin: "50% 100%", transform: `scale(${spotIn})` }}>
          <Silhouette width={160} height={420} color="#ffffff" />
        </div>
        {burst > 0 && burst < 1 ? (
          <div
            style={{
              position: "absolute",
              left: SPOT_X - 60 - burst * 200,
              top: 780 - 60 - burst * 200,
              width: 120 + burst * 400,
              height: 120 + burst * 400,
              borderRadius: "50%",
              border: `6px solid ${withAlpha(theme.marker, 1 - burst)}`,
              boxSizing: "border-box",
            }}
          />
        ) : null}
        <Character look={cast.karim} c={c} x={1110} y={1000} height={440} appear={at + 6} gaze={lookAt(1110)} seed={4} shadow={theme.shadow} groove={3} gesture="wave" gestureAt={punch + 10} side="left" />
        <Character look={cast.claire} c={c} x={1290} y={1005} height={430} appear={at + 9} gaze={lookAt(1290)} seed={1} shadow={theme.shadow} groove={3} gesture="cheer" gestureAt={punch + 4} />
        <Character look={cast.awa} c={c} x={SPOT_X} y={1000} height={440} appear={punch} mood="laugh" seed={2} shadow={theme.shadow} groove={4} gesture="wave" gestureAt={punch + 8} side="right" />
        <Character look={cast.thomas} c={c} x={1650} y={1000} height={450} appear={at + 12} gaze={lookAt(1650)} seed={3} shadow={theme.shadow} groove={3} />
        <Sparkles color={theme.marker} seed={9} count={5} delay={punch + 2} box={{ x: SPOT_X - 170, y: 470, w: 340, h: 160 }} size={36} />
      </Camera>

      <Camera depth={0.3} durationInFrames={durationInFrames}>
        <div style={{ position: "absolute", left: MARGIN_X, top: 320, width: 880, display: "flex", flexDirection: "column", gap: 24 }}>
          <AccentBar color={theme.accent} delay={at} />
          <Title text={title} color={theme.ink} maxWidth={880} maxSize={140} maxLines={2} delay={at + 2} mode="slam" />
          <Title text={subtitle} color={theme.ink} maxWidth={880} maxSize={104} maxLines={2} delay={punch} mode="slam" marker={marker} />
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
      <Sfx src={video.sfx?.sparkle} at={punch} volume={0.35} />
    </SceneBackdrop>
  );
};
