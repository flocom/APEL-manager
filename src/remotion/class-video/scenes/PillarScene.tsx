import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

import { withAlpha, WHITE } from "../colors";
import { Character, handMeetPoint, makeCast, type Look } from "../components/characters";
import { Sparkles } from "../components/decor";
import { enter, glide } from "../components/motion";
import { SceneBackdrop, type SceneProps } from "../components/scene";
import { Bunting, Coach, HeartOutline, SmallHeart, Stand, Table, Tree, Treats } from "../components/scenery";
import { TextBlock } from "../components/text";
import { illuColors, sceneTheme, type IlluColors, type SceneTheme } from "../theme";
import type { ClassVideoSceneId } from "../types";
import { TextColumn } from "./common";

type PillarId = Extract<ClassVideoSceneId, "vie" | "sourire" | "souvenirs" | "rassembler">;

type PillarArt = React.FC<{ c: IlluColors; theme: SceneTheme }>;

/** « Donner vie » : un stand de fête qu'on installe, fanions, carton, ballon. */
const VieArt: PillarArt = ({ c, theme }) => {
  const frame = useCurrentFrame();
  const cast = makeCast(c, theme.bold ? theme.bg : undefined);
  const buntingIn = glide(frame, 10, 36);
  const standIn = glide(frame, 0, 30);
  return (
    <>
      <div style={{ position: "absolute", inset: 0, opacity: buntingIn, transform: `translateY(${(1 - buntingIn) * -80}px)` }}>
        <Bunting x={780} y={30} width={1200} colors={[c.a, c.c, c.b, c.aLight]} count={13} sag={60} />
      </div>
      <div style={{ position: "absolute", inset: 0, opacity: standIn, transform: `translateY(${(1 - standIn) * 30}px)` }}>
        <Stand x={1040} y={880 - 433} width={640} c={c} stripe={c.a} />
      </div>
      <Character look={cast.lina} c={c} x={1250} y={900} height={440} reachRight={{ x: 1370, y: 560 }} gaze={0.4} tilt={-4} seed={8} appear={6} shadow={theme.shadow} />
      <Character look={cast.thomas} c={c} x={1480} y={900} height={450} gesture="talk" gestureAt={40} mood="talk" talkRange={[40, 100]} gaze={-0.3} seed={9} appear={10} shadow={theme.shadow} />
      <div style={{ position: "absolute", inset: 0, opacity: standIn }}>
        <Table x={1080} y={675} width={560} c={c} cloth={WHITE} trim={c.cLight} />
        <Treats x={1170} y={675 - 124} width={380} c={c} />
      </div>
      <Character look={cast.noah} c={c} x={930} y={995} height={290} item="balloon" itemColor={c.b} gesture="balloon" gaze={0.6} tilt={4} seed={10} appear={14} shadow={theme.shadow} />
      <Character look={cast.karim} c={c} x={1780} y={990} height={445} carry="box" carryColor={c.a} walk={{ from: 2200, at: 12, duration: 64 }} gaze={-0.5} seed={11} shadow={theme.shadow} />
    </>
  );
};

/** « Faire sourire » : un goûter, un plateau de gâteaux, des enfants qui rient. */
const SourireArt: PillarArt = ({ c, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cast = makeCast(c, theme.bold ? theme.bg : undefined);
  const hearts = [
    { x: 880, y: 450, w: 58, d: 40 },
    { x: 930, y: 360, w: 40, d: 54 },
    { x: 740, y: 310, w: 44, d: 66 },
  ];
  return (
    <>
      {hearts.map((h, i) => {
        const p = enter(frame, h.d, 24);
        const rise = ((frame - h.d) / fps) * 16;
        return (
          <div key={i} style={{ position: "absolute", inset: 0, opacity: p * 0.9, transform: `translateY(${-Math.max(0, rise)}px)` }}>
            <SmallHeart x={h.x} y={h.y} width={h.w} color={i === 1 ? c.c : c.b} />
          </div>
        );
      })}
      <Table x={40} y={700} width={470} c={c} cloth={WHITE} trim={c.bLight} />
      <Treats x={90} y={700 - 128} width={390} c={c} />
      <Character look={cast.awa} c={c} x={600} y={985} height={540} carry="tray" carryColor={c.c} mood="laugh" tilt={3} gaze={0.5} seed={12} appear={0} shadow={theme.shadow} />
      <Character look={cast.jade} c={c} x={860} y={1005} height={345} gesture="cheer" gestureAt={18} mood="laugh" tilt={-4} gaze={-0.5} seed={13} appear={6} shadow={theme.shadow} />
      <Character look={cast.hugo} c={c} x={330} y={1020} height={340} item="cupcake" itemColor={c.b} gesture="hold" mood="laugh" gaze={0.6} tilt={5} seed={14} appear={10} shadow={theme.shadow} />
    </>
  );
};

/** « Créer des souvenirs » : le car de la sortie scolaire, l'enseignante et la classe. */
const SouvenirsArt: PillarArt = ({ c, theme }) => {
  const frame = useCurrentFrame();
  const cast = makeCast(c, theme.bold ? theme.bg : undefined);
  const coachIn = glide(frame, 0, 44);
  const withBag = (look: Look, color: string): Look => ({ ...look, backpack: color });
  return (
    <>
      <Tree x={1640} y={900 - 380} width={250} c={c} variant={1} />
      <Tree x={960} y={900 - 340} width={230} c={c} />
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${(1 - coachIn) * 900}px)` }}>
        <Coach x={1040} y={900 - 320} width={820} c={c} />
      </div>
      <Character look={cast.teacher} c={c} x={990} y={1000} height={450} gesture="hold" item="clipboard" itemColor={c.b} gaze={0.5} mood="talk" talkRange={[50, 95]} seed={15} appear={20} shadow={theme.shadow} />
      <Character look={withBag(cast.lea, c.b)} c={c} x={1190} y={1010} height={275} gaze={-0.4} seed={16} appear={30} shadow={theme.shadow} />
      <Character look={withBag(cast.noah, c.c)} c={c} x={1350} y={1010} height={290} gaze={-0.2} seed={17} appear={36} mood="laugh" shadow={theme.shadow} />
      <Character look={withBag(cast.ines, c.a)} c={c} x={1510} y={1010} height={295} gaze={-0.3} seed={18} appear={42} shadow={theme.shadow} />
      <Character look={withBag(cast.hugo, c.b)} c={c} x={1670} y={1010} height={280} gesture="wave" gestureAt={60} side="right" gaze={-0.5} seed={19} appear={48} shadow={theme.shadow} />
    </>
  );
};

/** Aligne les personnages côte à côte ; renvoie leurs positions et les points où les mains se rejoignent. */
function holdHandsLine(people: { look: Look; height: number }[], centerIndex: number, centerX: number, feetY: number) {
  const gap = (a: Look, b: Look) => (a.build === "adult" && b.build === "adult" ? 178 : 196);
  const xs = [0];
  for (let i = 1; i < people.length; i++) xs.push(xs[i - 1] + gap(people[i - 1].look, people[i].look));
  const shift = centerX - xs[centerIndex];
  const pos = xs.map((x) => x + shift);
  const meet = pos.slice(1).map((x, i) => handMeetPoint({ ...people[i], x: pos[i] }, { ...people[i + 1], x }, feetY));
  return { pos, meet };
}

/** « Rassembler » : familles et équipe éducative côte à côte, un grand cœur derrière. */
const RassemblerArt: PillarArt = ({ c, theme }) => {
  const frame = useCurrentFrame();
  const cast = makeCast(c, theme.bold ? theme.bg : undefined);
  const feetY = 1025;
  const people = [
    { look: cast.karim, height: 470 },
    { look: cast.noah, height: 320 },
    { look: cast.claire, height: 460 },
    { look: cast.teacher, height: 480 },
    { look: cast.thomas, height: 475 },
    { look: cast.jade, height: 315 },
    { look: cast.awa, height: 465 },
  ];
  const { pos, meet } = holdHandsLine(people, 3, 960, feetY);
  const heartIn = glide(frame, 20, 50);
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath: `polygon(0% ${100 - heartIn * 100}%, 100% ${100 - heartIn * 100}%, 100% 100%, 0% 100%)`,
        }}
      >
        <HeartOutline x={960 - 380} y={330} width={760} color={withAlpha(WHITE, 0.18)} strokeWidth={14} />
      </div>
      <Sparkles color={theme.accent} seed={23} count={4} delay={46} box={{ x: 520, y: 330, w: 880, h: 160 }} size={42} opacity={0.8} />
      {people.map((p, i) => {
        const order = Math.abs(i - 3);
        return (
          <Character
            key={i}
            look={p.look}
            c={c}
            x={pos[i]}
            y={feetY}
            height={p.height}
            reachLeft={i > 0 ? meet[i - 1] : undefined}
            reachRight={i < people.length - 1 ? meet[i] : undefined}
            gaze={(i - 3) * -0.15}
            mood={i === 1 || i === 5 ? "laugh" : "smile"}
            tilt={(i - 3) * -1.2}
            seed={30 + i}
            appear={4 + order * 5}
            shadow={theme.shadow}
          />
        );
      })}
    </>
  );
};

/**
 * Un des quatre piliers : une petite scène illustrée avec des personnages et
 * le texte à côté (au-dessus pour « rassembler », sur la couleur pleine).
 */
export const PillarScene: React.FC<SceneProps & { pillar: PillarId }> = ({ scene, video, pillar }) => {
  const theme = sceneTheme(video.palette, pillar);
  const c = illuColors(video.palette);

  if (pillar === "rassembler") {
    return (
      <SceneBackdrop theme={theme} floorY={900}>
        <RassemblerArt c={c} theme={theme} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 96, display: "flex", justifyContent: "center" }}>
          <TextBlock title={scene.title} subtitle={scene.subtitle} ink={theme.ink} muted={theme.muted} accent={theme.accent} maxWidth={1400} maxLines={1} titleSize={110} align="center" gap={24} delay={6} />
        </div>
      </SceneBackdrop>
    );
  }

  const textRight = pillar === "sourire";
  const Art = pillar === "vie" ? VieArt : pillar === "sourire" ? SourireArt : SouvenirsArt;
  const blob = pillar === "vie" ? { x: 1360, y: 560, r: 400 } : pillar === "sourire" ? { x: 540, y: 560, r: 420 } : { x: 1400, y: 620, r: 420 };
  const floorY = pillar === "vie" ? 880 : pillar === "sourire" ? 880 : 900;
  return (
    <SceneBackdrop theme={theme} floorY={floorY} blob={blob}>
      <Art c={c} theme={theme} />
      <TextColumn side={textRight ? "right" : "left"} width={textRight ? 760 : 720}>
        <TextBlock title={scene.title} subtitle={scene.subtitle} ink={theme.ink} muted={theme.muted} accent={theme.accent} maxWidth={textRight ? 760 : 720} maxLines={3} delay={8} />
      </TextColumn>
    </SceneBackdrop>
  );
};
