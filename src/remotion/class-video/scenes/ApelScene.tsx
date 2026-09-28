import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

import { WHITE } from "../colors";
import { Character, makeCast } from "../components/characters";
import { GeoShapes } from "../components/decor";
import { Camera } from "../components/finish";
import { snap } from "../components/motion";
import { SceneBackdrop, type SceneProps } from "../components/scene";
import { DeskItems, SpeechBubble, Table } from "../components/scenery";
import { TextBlock } from "../components/text";
import { illuColors, sceneTheme } from "../theme";
import { chapter, TextColumn } from "./common";

const FLOOR = 900;
const TABLE_TOP = 700;

/** « L'APEL, c'est vous » : des parents réunis autour d'une table, qui échangent. */
export const ApelScene: React.FC<SceneProps> = ({ scene, video, durationInFrames, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "apel");
  const c = illuColors(video.palette);
  const cast = makeCast(c, theme.bold ? theme.bg : undefined);
  const title = scene.title.trim() || video.associationName;
  const tableIn = Math.max(0, snap(frame, fps, 2, 220, 20));
  const bubble = (at: number) => {
    const p = Math.max(0, snap(frame, fps, at, 280, 16));
    return { transformOrigin: "20% 100%", transform: `scale(${p})` };
  };

  return (
    <SceneBackdrop theme={theme} floorY={FLOOR} blob={{ x: 1410, y: 540, r: 390 }} durationInFrames={durationInFrames}>
      <Camera depth={1} durationInFrames={durationInFrames}>
        <GeoShapes
          shapes={[
            { kind: "disc", x: 1860, y: 150, r: 100, color: theme.shapes[0], at: 0 },
            { kind: "dots", x: 960, y: 120, cols: 4, rows: 2, gap: 30, r: 5, color: theme.shapes[2] ?? theme.shapes[0], at: 4 },
            { kind: "ring", x: 1860, y: 820, r: 46, width: 6, color: theme.shapes[1] ?? theme.shapes[0], at: 8 },
          ]}
        />
        <div style={{ position: "absolute", inset: 0 }}>
          <Character look={cast.thomas} c={c} x={1180} y={880} height={475} gesture="hold" item="clipboard" itemColor={c.a} mood="talk" talkRange={[18, 50]} gaze={0.5} seed={5} appear={4} />
          <Character look={cast.awa} c={c} x={1400} y={880} height={465} gesture="talk" gestureAt={48} mood="talk" talkRange={[50, 100]} gaze={-0.4} tilt={-2} seed={6} appear={8} />
          <Character look={cast.karim} c={c} x={1620} y={880} height={480} item="mug" itemColor={WHITE} gesture="hold" gaze={-0.6} tilt={3} seed={7} appear={12} />
          <div style={{ position: "absolute", inset: 0, transformOrigin: "1410px 930px", transform: `scaleY(${tableIn})` }}>
            <Table x={1090} y={TABLE_TOP} width={640} c={c} cloth={WHITE} trim={c.aLight} />
            <DeskItems x={1150} y={TABLE_TOP - 118} width={520} c={c} />
          </div>
        </div>
        <div style={{ position: "absolute", left: 1000, top: 200, ...bubble(22) }}>
          <SpeechBubble x={0} y={0} width={120} color={WHITE} dots={c.a} />
        </div>
        <div style={{ position: "absolute", left: 1470, top: 180, ...bubble(50) }}>
          <SpeechBubble x={0} y={0} width={120} color={WHITE} dots={c.b} flip />
        </div>
      </Camera>
      <Camera depth={0.3} durationInFrames={durationInFrames}>
        <TextColumn width={760}>
          <TextBlock title={title} subtitle={scene.subtitle} ink={theme.ink} muted={theme.muted} accent={theme.accent} marker={{ color: theme.marker, ink: theme.markerInk }} maxWidth={760} maxLines={3} delay={4} eyebrow={chapter(index, video.associationName)} />
        </TextColumn>
      </Camera>
    </SceneBackdrop>
  );
};
