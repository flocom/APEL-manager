import React from "react";
import { useCurrentFrame } from "remotion";

import { WHITE } from "../colors";
import { Character, makeCast } from "../components/characters";
import { enter } from "../components/motion";
import { SceneBackdrop, type SceneProps } from "../components/scene";
import { DeskItems, SpeechBubble, Table } from "../components/scenery";
import { TextBlock } from "../components/text";
import { illuColors, sceneTheme } from "../theme";
import { TextColumn } from "./common";

const FLOOR = 900;
const TABLE_TOP = 700;

/** « L'APEL, c'est vous » : des parents réunis autour d'une table, qui échangent. */
export const ApelScene: React.FC<SceneProps> = ({ scene, video }) => {
  const frame = useCurrentFrame();
  const theme = sceneTheme(video.palette, "apel");
  const c = illuColors(video.palette);
  const cast = makeCast(c, theme.bold ? theme.bg : undefined);
  const title = scene.title.trim() || video.associationName;
  const groupIn = enter(frame, 0, 26);
  const bubble = (at: number) => {
    const p = enter(frame, at, 16);
    return { opacity: p, transform: `translateY(${(1 - p) * 14}px) scale(${0.9 + 0.1 * p})` };
  };

  return (
    <SceneBackdrop theme={theme} floorY={FLOOR} blob={{ x: 1410, y: 540, r: 390 }}>
      <div style={{ position: "absolute", inset: 0, opacity: groupIn }}>
        <Character look={cast.thomas} c={c} x={1180} y={880} height={475} gesture="hold" item="clipboard" itemColor={c.a} mood="talk" talkRange={[24, 80]} gaze={0.5} seed={5} appear={0} />
        <Character look={cast.awa} c={c} x={1400} y={880} height={465} gesture="talk" gestureAt={84} mood="talk" talkRange={[90, 150]} gaze={-0.4} tilt={-2} seed={6} appear={4} />
        <Character look={cast.karim} c={c} x={1620} y={880} height={480} item="mug" itemColor={WHITE} gesture="hold" gaze={-0.6} tilt={3} seed={7} appear={8} />
        <Table x={1090} y={TABLE_TOP} width={640} c={c} cloth={WHITE} trim={c.aLight} />
        <DeskItems x={1150} y={TABLE_TOP - 118} width={520} c={c} />
      </div>
      <div style={{ position: "absolute", left: 1000, top: 200, ...bubble(26) }}>
        <SpeechBubble x={0} y={0} width={120} color={WHITE} dots={c.a} />
      </div>
      <div style={{ position: "absolute", left: 1470, top: 180, ...bubble(92) }}>
        <SpeechBubble x={0} y={0} width={120} color={WHITE} dots={c.b} flip />
      </div>
      <TextColumn width={760}>
        <TextBlock title={title} subtitle={scene.subtitle} ink={theme.ink} muted={theme.muted} accent={theme.accent} maxWidth={760} maxLines={3} delay={8} />
      </TextColumn>
    </SceneBackdrop>
  );
};
