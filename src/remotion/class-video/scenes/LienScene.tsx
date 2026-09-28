import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { mix, withAlpha, WHITE } from "../colors";
import { Character, handMeetPoint, makeCast } from "../components/characters";
import { GeoShapes } from "../components/decor";
import { Camera, glideIn, QUINT_OUT } from "../components/finish";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { Bush, School, SmallHeart, SpeechBubble, Tree } from "../components/scenery";
import { TextBlock } from "../components/text";
import { illuColors, sceneTheme } from "../theme";
import { chapter } from "./common";

const FLOOR = 900;
/** Arc qui relie la famille à l'école : début, point de contrôle, fin. */
const ARC = { x0: 420, y0: 640, cx: 960, cy: 250, x1: 1500, y1: 640 };

const arcPoint = (t: number) => ({
  x: (1 - t) ** 2 * ARC.x0 + 2 * (1 - t) * t * ARC.cx + t ** 2 * ARC.x1,
  y: (1 - t) ** 2 * ARC.y0 + 2 * (1 - t) * t * ARC.cy + t ** 2 * ARC.y1,
});

/**
 * « On est là pour vous » : le temps calme de la vidéo. Une famille à
 * gauche, l'école à droite, un arc chaleureux qui les relie et que
 * parcourent de petits cœurs ; au milieu, une bénévole de l'APEL discute
 * avec le parent, bulles à l'appui.
 */
export const LienScene: React.FC<SceneProps> = ({ scene, video, durationInFrames, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "lien");
  const c = illuColors(video.palette);
  const cast = makeCast(c);
  const arcIn = interpolate(frame, [10, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: QUINT_OUT });
  const schoolIn = glideIn(frame, 2, 24);
  const family = handMeetPoint({ look: cast.lina, height: 430, x: 300 }, { look: cast.jade, height: 290, x: 430 }, 1010);
  const bubble = (at: number) => {
    const p = glideIn(frame, at, 14);
    return { opacity: p, transformOrigin: "20% 100%", transform: `scale(${0.6 + 0.4 * p})` };
  };
  const t = frame / fps;

  return (
    <SceneBackdrop theme={theme} floorY={FLOOR} blob={{ x: 960, y: 560, r: 480 }} durationInFrames={durationInFrames}>
      <Camera depth={0.5} durationInFrames={durationInFrames}>
        <GeoShapes
          shapes={[
            { kind: "disc", x: 80, y: 130, r: 110, color: theme.shapes[0], at: 0 },
            { kind: "ring", x: 1840, y: 170, r: 44, width: 6, color: theme.shapes[1] ?? theme.shapes[0], at: 6 },
            { kind: "dots", x: 1700, y: 400, cols: 3, rows: 2, gap: 30, r: 5, color: theme.shapes[2] ?? theme.shapes[0], at: 10 },
          ]}
        />
      </Camera>
      <Camera depth={1} durationInFrames={durationInFrames}>
        <div style={{ position: "absolute", inset: 0, opacity: schoolIn, transform: `translateY(${(1 - schoolIn) * 30}px)` }}>
          <Tree x={1700} y={FLOOR - 300} width={190} c={c} variant={1} />
          <School x={1260} y={FLOOR - 350} width={560} c={c} />
          <Bush x={1220} y={FLOOR - 60} width={160} c={c} />
        </div>
        {/* Arc du lien, révélé de gauche à droite, parcouru par des cœurs. */}
        <div style={{ position: "absolute", inset: 0, clipPath: `polygon(0% 0%, ${(arcIn * 100).toFixed(2)}% 0%, ${(arcIn * 100).toFixed(2)}% 100%, 0% 100%)` }}>
          <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", left: 0, top: 0 }}>
            <path d={`M${ARC.x0} ${ARC.y0} Q${ARC.cx} ${ARC.cy} ${ARC.x1} ${ARC.y1}`} stroke={withAlpha(c.b, 0.18)} strokeWidth={46} fill="none" strokeLinecap="round" />
            <path d={`M${ARC.x0} ${ARC.y0} Q${ARC.cx} ${ARC.cy} ${ARC.x1} ${ARC.y1}`} stroke={c.b} strokeWidth={10} fill="none" strokeLinecap="round" strokeDasharray="2 22" />
          </svg>
        </div>
        {[0, 1, 2].map((k) => {
          const u = (t * 0.28 + k / 3) % 1;
          if (arcIn < u || frame < 30) return null;
          const p = arcPoint(u);
          const fade = Math.min(1, u * 6, (1 - u) * 6);
          return (
            <div key={k} style={{ position: "absolute", inset: 0, opacity: fade }}>
              <SmallHeart x={p.x - 22} y={p.y - 22} width={44} color={k === 1 ? c.c : c.b} />
            </div>
          );
        })}
        <Character look={cast.lina} c={c} x={300} y={1010} height={430} reachRight={family} gaze={0.6} tilt={2} mood="talk" talkRange={[18, 44]} seed={90} appear={2} shadow={theme.shadow} />
        <Character look={cast.jade} c={c} x={430} y={1015} height={290} reachLeft={family} gaze={0.4} seed={91} appear={5} shadow={theme.shadow} />
        <Character look={{ ...cast.claire, lanyard: c.b }} c={c} x={760} y={1010} height={430} gesture="talk" gestureAt={46} mood="talk" talkRange={[50, 90]} gaze={-0.6} tilt={-3} seed={92} appear={8} shadow={theme.shadow} />
        <div style={{ position: "absolute", left: 180, top: 470, ...bubble(16) }}>
          <SpeechBubble x={0} y={0} width={120} color={WHITE} dots={c.a} />
        </div>
        <div style={{ position: "absolute", left: 800, top: 470, ...bubble(48) }}>
          <div style={{ position: "relative", width: 130, height: 96 }}>
            <SpeechBubble x={0} y={0} width={130} color={WHITE} dots={WHITE} flip />
            <div style={{ position: "absolute", left: 43, top: 16 }}>
              <SmallHeart x={0} y={0} width={44} color={c.b} />
            </div>
          </div>
        </div>
      </Camera>
      <Camera depth={0.3} durationInFrames={durationInFrames}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 70, display: "flex", justifyContent: "center" }}>
          <TextBlock
            title={scene.title}
            subtitle={scene.subtitle}
            ink={theme.ink}
            muted={mix(theme.ink, theme.bg, 0.25)}
            accent={theme.accent}
            marker={{ color: theme.marker, ink: theme.markerInk }}
            maxWidth={1500}
            maxLines={1}
            titleSize={120}
            subtitleSize={44}
            align="center"
            gap={18}
            delay={4}
            eyebrow={chapter(index, video.associationName)}
          />
        </div>
      </Camera>
      <Sfx src={video.sfx?.pop} at={16} volume={0.18} />
      <Sfx src={video.sfx?.pop} at={48} volume={0.18} />
    </SceneBackdrop>
  );
};
