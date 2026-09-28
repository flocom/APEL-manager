import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

import { Character, makeCast } from "../components/characters";
import { enter, glide } from "../components/motion";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { Bush, Cloud, School, Tree } from "../components/scenery";
import { AccentBar, Subtitle, Title } from "../components/text";
import { illuColors, sceneTheme } from "../theme";
import { LogoCard, TextColumn } from "./common";

export { LogoCard, shortName } from "./common";

const FLOOR = 870;

/** Ouverture : l'école, des familles qui arrivent, le logo et le nom de l'association. */
export const IntroScene: React.FC<SceneProps> = ({ scene, video }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "intro");
  const c = illuColors(video.palette);
  const cast = makeCast(c, theme.bold ? theme.bg : undefined);
  const title = scene.title.trim() || video.associationName;
  const subtitle = scene.subtitle.trim() || video.schoolName;
  const schoolIn = glide(frame, 2, 40);
  const cardIn = enter(frame, 6, 24);
  const drift = (frame / fps) * 6;
  const walk = (from: number, at: number) => ({ from, at, duration: 70 });

  return (
    <SceneBackdrop theme={theme} floorY={FLOOR}>
      <Cloud x={1080 + drift} y={120} width={220} color="#ffffff" />
      <Cloud x={1640 - drift * 0.7} y={200} width={170} color="#ffffff" style={{ opacity: 0.8 }} />
      <div style={{ position: "absolute", inset: 0, opacity: schoolIn, transform: `translateY(${(1 - schoolIn) * 30}px)` }}>
        <Tree x={850} y={FLOOR - 330} width={220} c={c} />
        <Tree x={1690} y={FLOOR - 300} width={200} c={c} variant={1} />
        <School x={940} y={FLOOR - 540} width={868} c={c} />
        <Bush x={900} y={FLOOR - 70} width={190} c={c} />
        <Bush x={1650} y={FLOOR - 64} width={170} c={c} />
      </div>

      {/* Une maman et sa fille arrivent par la gauche, main dans la main ; un papa et son fils par la droite. */}
      <Character look={cast.claire} c={c} x={1110} y={985} height={430} walk={walk(760, 8)} reachRight={{ x: 52, y: -160, rel: true }} gaze={0.4} seed={1} shadow={theme.shadow} />
      <Character look={cast.lea} c={c} x={1210} y={990} height={280} walk={walk(860, 8)} reachLeft={{ x: -48, y: -155, rel: true }} gaze={-0.3} tilt={-3} seed={2} shadow={theme.shadow} />
      <Character look={cast.noah} c={c} x={1560} y={990} height={290} walk={walk(2000, 16)} gaze={0.5} seed={3} shadow={theme.shadow} gesture="wave" gestureAt={80} side="left" />
      <Character look={cast.karim} c={c} x={1690} y={985} height={440} walk={walk(2140, 16)} gaze={-0.5} seed={4} shadow={theme.shadow} gesture="wave" gestureAt={62} side="right" />

      <TextColumn width={680}>
        <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
          <div style={{ opacity: cardIn, transform: `translateY(${(1 - cardIn) * 20}px)`, alignSelf: "flex-start" }}>
            <LogoCard logoUrl={video.logoUrl} fallbackText={video.associationName} width={380} height={214} ink={video.palette.primary} fallbackBg={video.palette.light} />
          </div>
          <div style={{ height: 6 }} />
          <AccentBar color={theme.accent} delay={16} />
          <Title text={title} color={theme.ink} maxWidth={680} maxSize={108} maxLines={3} delay={20} />
          <Subtitle text={subtitle} color={theme.muted} maxWidth={660} size={46} delay={32} />
        </div>
      </TextColumn>
      <Sfx src={video.sfx?.pop} at={7} volume={0.25} />
    </SceneBackdrop>
  );
};
