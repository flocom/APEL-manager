import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

import { withAlpha, WHITE } from "../colors";
import { Character, makeCast } from "../components/characters";
import { GeoShapes } from "../components/decor";
import { Camera, Sheen } from "../components/finish";
import { snap } from "../components/motion";
import { Lightbulb, MeetingCalendar } from "../components/objects";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { DeskItems, Table } from "../components/scenery";
import { BODY_CHAR, fitFontSize, frenchSpaces, TextBlock } from "../components/text";
import { FONT_FAMILY, illuColors, sceneTheme } from "../theme";
import { chapter, MARGIN_X } from "./common";

const TABLE_TOP = 710;

/**
 * « Devenez membre » : une réunion autour d'une table ; une idée s'allume
 * au-dessus d'une maman, les mains se lèvent pour voter, un calendrier de
 * réunions se coche. La cotisation, si elle est publiée, en pastille sobre.
 */
export const DevenirMembreScene: React.FC<SceneProps> = ({ scene, video, durationInFrames, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "membre");
  const c = illuColors(video.palette);
  const cast = makeCast(c, theme.bg);
  const pop = (at: number, stiffness = 240) => Math.max(0, snap(frame, fps, at, stiffness, 18));
  const bulbIn = pop(20, 280);
  const bulbGlow = frame > 20 ? 0.75 + 0.25 * Math.sin(((frame - 20) / fps) * Math.PI * 2) : 0;
  const calIn = pop(8, 200);
  const marked = Math.min(3, Math.max(0, Math.floor((frame - 24) / 8) + 1));
  const tableIn = pop(0, 200);
  const fee = video.membershipFee?.trim() ?? "";
  const feeIn = pop(30);

  return (
    <SceneBackdrop theme={theme} floorY={900} blob={{ x: 1440, y: 520, r: 450 }} durationInFrames={durationInFrames}>
      <Camera depth={0.6} durationInFrames={durationInFrames}>
        <GeoShapes
          shapes={[
            { kind: "disc", x: 1080, y: 1000, r: 90, color: theme.shapes[0], at: 0 },
            { kind: "ring", x: 1100, y: 170, r: 44, width: 6, color: theme.shapes[0], at: 4 },
            { kind: "dots", x: 90, y: 930, cols: 4, rows: 2, gap: 30, r: 5, color: withAlpha(WHITE, 0.8), at: 7 },
          ]}
        />
      </Camera>
      <Camera depth={1} durationInFrames={durationInFrames}>
        <div
          style={{
            position: "absolute",
            left: 1600,
            top: 80,
            transformOrigin: "50% 0%",
            transform: `perspective(1200px) rotateX(${(1 - calIn) * -60}deg) rotate(4deg) scale(${0.8 + 0.2 * calIn})`,
            opacity: Math.min(1, calIn * 3),
          }}
        >
          <div style={{ position: "absolute", left: 0, top: 10, width: 230, height: 202, borderRadius: 22, boxShadow: "0 22px 40px rgba(0, 0, 0, 0.25)" }} />
          <MeetingCalendar size={230} c={c} marked={marked} />
        </div>
        <Character look={cast.thomas} c={c} x={1230} y={890} height={470} gesture="raise" gestureAt={36} gaze={0.3} seed={100} appear={4} shadow={theme.shadow} groove={2} />
        <Character look={cast.awa} c={c} x={1450} y={890} height={460} gesture="talk" gestureAt={14} mood="talk" talkRange={[14, 44]} gaze={-0.2} seed={101} appear={7} shadow={theme.shadow} groove={2} />
        <Character look={cast.karim} c={c} x={1670} y={890} height={480} gesture="raise" gestureAt={42} side="left" mood="laugh" gaze={-0.5} seed={102} appear={10} shadow={theme.shadow} groove={2} />
        <div style={{ position: "absolute", left: 1450 - 75, top: 230, width: 150, height: 150, transformOrigin: "50% 100%", transform: `scale(${bulbIn}) rotate(${(1 - bulbIn) * -20}deg)` }}>
          <Lightbulb size={150} c={c} glow={bulbGlow} />
        </div>
        <div style={{ position: "absolute", inset: 0, transformOrigin: "1450px 930px", transform: `scaleY(${tableIn})` }}>
          <Table x={1130} y={TABLE_TOP} width={640} c={c} cloth={WHITE} trim={c.cLight} />
          <DeskItems x={1190} y={TABLE_TOP - 118} width={520} c={c} />
        </div>
      </Camera>
      <Camera depth={0.3} durationInFrames={durationInFrames}>
        <div style={{ position: "absolute", left: MARGIN_X, top: 0, bottom: 0, width: 700, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <TextBlock
            title={scene.title}
            subtitle={scene.subtitle}
            ink={theme.ink}
            muted={theme.muted}
            accent={theme.accent}
            marker={{ color: theme.marker, ink: theme.markerInk }}
            maxWidth={700}
            maxLines={3}
            titleSize={130}
            subtitleSize={44}
            delay={3}
            eyebrow={chapter(index, video.associationName)}
          />
          {fee ? (
            <div
              style={{
                marginTop: 36,
                alignSelf: "flex-start",
                position: "relative",
                overflow: "hidden",
                padding: "14px 30px",
                borderRadius: 999,
                border: `3px solid ${withAlpha(theme.ink, 0.6)}`,
                fontFamily: FONT_FAMILY,
                fontWeight: 500,
                fontSize: fitFontSize(`Adhésion : ${fee}`, 640, 1, 36, 24, BODY_CHAR),
                color: theme.ink,
                whiteSpace: "nowrap",
                opacity: Math.min(1, feeIn * 3),
                transformOrigin: "0% 50%",
                transform: `scale(${0.7 + 0.3 * feeIn})`,
              }}
            >
              {/* Seul libellé écrit en dur de la pastille. */}
              <span style={{ fontWeight: 800 }}>Adhésion :</span> {frenchSpaces(fee)}
              <Sheen at={44} width={90} opacity={0.4} />
            </div>
          ) : null}
        </div>
      </Camera>
      <Sfx src={video.sfx?.sparkle} at={20} volume={0.3} />
      <Sfx src={video.sfx?.pop} at={36} volume={0.2} />
      <Sfx src={video.sfx?.pop} at={42} volume={0.2} />
    </SceneBackdrop>
  );
};
