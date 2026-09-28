import React from "react";
import { Easing, useCurrentFrame, useVideoConfig } from "remotion";

import { withAlpha, WHITE } from "../colors";
import { Character, handMeetPoint, makeCast, type Look } from "../components/characters";
import { GeoShapes, Sparkles, type GeoShape } from "../components/decor";
import { Camera } from "../components/finish";
import { progress, snap } from "../components/motion";
import { SceneBackdrop, type SceneProps } from "../components/scene";
import { Bunting, Coach, HeartOutline, SmallHeart, Stand, Table, Tree, Treats } from "../components/scenery";
import { TextBlock } from "../components/text";
import { illuColors, sceneTheme, type IlluColors, type SceneTheme } from "../theme";
import type { ClassVideoSceneId } from "../types";
import { chapter, TextColumn } from "./common";

type PillarId = Extract<ClassVideoSceneId, "vie" | "sourire" | "souvenirs" | "rassembler">;

type PillarArt = React.FC<{ c: IlluColors; theme: SceneTheme }>;

/** Apparition « pop » d'un décor autour d'un point d'ancrage (px). */
function usePop(delay: number, stiffness = 220, damping = 19) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return Math.max(0, snap(frame, fps, delay, stiffness, damping));
}

/** « Donner vie » : un stand de fête qu'on installe, fanions, carton, ballon. */
const VieArt: PillarArt = ({ c, theme }) => {
  const frame = useCurrentFrame();
  const cast = makeCast(c, theme.bold ? theme.bg : undefined);
  const buntingIn = progress(frame, 6, 18, Easing.bezier(0.16, 1, 0.3, 1));
  const standIn = usePop(0);
  const flags = [...theme.shapes, WHITE].filter((col, i, all) => all.indexOf(col) === i);
  return (
    <>
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - buntingIn) * -260}px)` }}>
        <Bunting x={780} y={30} width={1200} colors={flags} count={13} sag={60} />
      </div>
      <div style={{ position: "absolute", inset: 0, transformOrigin: "1360px 880px", transform: `scale(${standIn})` }}>
        <Stand x={1040} y={880 - 433} width={640} c={c} stripe={c.a} />
      </div>
      <Character look={cast.lina} c={c} x={1250} y={900} height={440} reachRight={{ x: 1370, y: 560 }} gaze={0.4} tilt={-4} seed={8} appear={5} shadow={theme.shadow} />
      <Character look={cast.thomas} c={c} x={1480} y={900} height={450} gesture="cheer" gestureAt={30} mood="laugh" gaze={-0.3} seed={9} appear={8} shadow={theme.shadow} groove={3} />
      <div style={{ position: "absolute", inset: 0, transformOrigin: "1360px 880px", transform: `scale(${standIn})` }}>
        <Table x={1080} y={675} width={560} c={c} cloth={WHITE} trim={c.cLight} />
        <Treats x={1170} y={675 - 124} width={380} c={c} />
      </div>
      <Character look={cast.noah} c={c} x={930} y={995} height={290} item="balloon" itemColor={theme.shapes[0]} gesture="balloon" gaze={0.6} tilt={4} seed={10} appear={12} shadow={theme.shadow} groove={4} />
      <Character look={cast.karim} c={c} x={1780} y={990} height={445} carry="box" carryColor={c.a} walk={{ from: 2200, at: 4, duration: 26 }} gaze={-0.5} seed={11} shadow={theme.shadow} />
    </>
  );
};

/** « Faire sourire » : un goûter, un plateau de gâteaux, des enfants qui rient. */
const SourireArt: PillarArt = ({ c, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cast = makeCast(c, theme.bold ? theme.bg : undefined);
  const tableIn = usePop(2);
  const hearts = [
    { x: 880, y: 450, w: 64, d: 24 },
    { x: 940, y: 350, w: 44, d: 30 },
    { x: 730, y: 300, w: 50, d: 36 },
  ];
  return (
    <>
      {hearts.map((h, i) => {
        const p = Math.max(0, snap(frame, fps, h.d, 300, 16));
        const rise = Math.max(0, ((frame - h.d) / fps) * 22);
        return (
          <div key={i} style={{ position: "absolute", inset: 0, transformOrigin: `${h.x + h.w / 2}px ${h.y + h.w / 2}px`, transform: `translateY(${-rise}px) scale(${p})` }}>
            <SmallHeart x={h.x} y={h.y} width={h.w} color={i === 1 ? c.c : c.b} />
          </div>
        );
      })}
      <div style={{ position: "absolute", inset: 0, transformOrigin: "275px 900px", transform: `scale(${tableIn})` }}>
        <Table x={40} y={700} width={470} c={c} cloth={WHITE} trim={c.bLight} />
        <Treats x={90} y={700 - 128} width={390} c={c} />
      </div>
      <Character look={cast.awa} c={c} x={600} y={985} height={540} carry="tray" carryColor={c.c} mood="laugh" tilt={3} gaze={0.5} seed={12} appear={4} shadow={theme.shadow} />
      <Character look={cast.jade} c={c} x={860} y={1005} height={345} gesture="cheer" gestureAt={16} mood="laugh" tilt={-4} gaze={-0.5} seed={13} appear={8} shadow={theme.shadow} groove={5} />
      <Character look={cast.hugo} c={c} x={330} y={1020} height={340} item="cupcake" itemColor={c.b} gesture="hold" mood="laugh" gaze={0.6} tilt={5} seed={14} appear={11} shadow={theme.shadow} groove={4} />
    </>
  );
};

/** « Créer des souvenirs » : le car de la sortie scolaire, l'enseignante et la classe. */
const SouvenirsArt: PillarArt = ({ c, theme }) => {
  const frame = useCurrentFrame();
  const cast = makeCast(c, theme.bold ? theme.bg : undefined);
  // Le car arrive vite et freine (sortie quintique).
  const coachIn = progress(frame, 0, 18, Easing.bezier(0.16, 1, 0.3, 1));
  const brake = Math.sin(Math.min(1, Math.max(0, (frame - 14) / 10)) * Math.PI) * 1.2;
  const withBag = (look: Look, color: string): Look => ({ ...look, backpack: color });
  return (
    <>
      <Tree x={1640} y={900 - 380} width={250} c={c} variant={1} />
      <Tree x={960} y={900 - 340} width={230} c={c} />
      <div style={{ position: "absolute", inset: 0, transformOrigin: "1450px 900px", transform: `translateX(${(1 - coachIn) * 1000}px) rotate(${-brake}deg)` }}>
        <Coach x={1040} y={900 - 320} width={820} c={c} />
      </div>
      <Character look={cast.teacher} c={c} x={990} y={1000} height={450} gesture="hold" item="clipboard" itemColor={c.b} gaze={0.5} mood="talk" talkRange={[30, 60]} seed={15} appear={12} shadow={theme.shadow} />
      <Character look={withBag(cast.lea, c.b)} c={c} x={1190} y={1010} height={275} gaze={-0.4} seed={16} appear={16} mood="laugh" shadow={theme.shadow} groove={4} />
      <Character look={withBag(cast.noah, c.c)} c={c} x={1350} y={1010} height={290} gaze={-0.2} seed={17} appear={19} gesture="cheer" gestureAt={34} mood="laugh" shadow={theme.shadow} groove={4} />
      <Character look={withBag(cast.ines, c.a)} c={c} x={1510} y={1010} height={295} gaze={-0.3} seed={18} appear={22} shadow={theme.shadow} groove={4} />
      <Character look={withBag(cast.hugo, c.b)} c={c} x={1670} y={1010} height={280} gesture="wave" gestureAt={30} side="right" gaze={-0.5} seed={19} appear={25} shadow={theme.shadow} groove={4} />
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
  const heartIn = progress(frame, 12, 34, Easing.bezier(0.16, 1, 0.3, 1));
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
      <Sparkles color={theme.accent} seed={23} count={4} delay={30} box={{ x: 520, y: 330, w: 880, h: 160 }} size={42} opacity={0.9} />
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
            appear={3 + order * 3}
            shadow={theme.shadow}
            groove={4}
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
export const PillarScene: React.FC<SceneProps & { pillar: PillarId }> = ({ scene, video, pillar, durationInFrames, index }) => {
  const theme = sceneTheme(video.palette, pillar);
  const c = illuColors(video.palette);
  const marker = { color: theme.marker, ink: theme.markerInk };
  const [s0, s1 = s0, s2 = s1] = theme.shapes;
  const eyebrow = chapter(index, video.associationName);
  const cam = (depth: number, children: React.ReactNode) => (
    <Camera depth={depth} durationInFrames={durationInFrames}>
      {children}
    </Camera>
  );

  if (pillar === "rassembler") {
    return (
      <SceneBackdrop theme={theme} floorY={900} durationInFrames={durationInFrames}>
        {cam(
          0.6,
          <GeoShapes
            shapes={[
              { kind: "band", x: 180, y: 120, w: 700, h: 14, angle: -18, color: s0, at: 0, from: -1 },
              { kind: "band", x: 1760, y: 170, w: 640, h: 14, angle: -18, color: s1, at: 3 },
              { kind: "dots", x: 1680, y: 520, cols: 3, rows: 3, gap: 30, r: 5, color: s0, at: 8 },
              { kind: "ring", x: 220, y: 600, r: 46, width: 6, color: s1, at: 10 },
            ]}
          />,
        )}
        {cam(1, <RassemblerArt c={c} theme={theme} />)}
        {cam(
          0.3,
          <div style={{ position: "absolute", left: 0, right: 0, top: 70, display: "flex", justifyContent: "center" }}>
            <TextBlock title={scene.title} subtitle={scene.subtitle} ink={theme.ink} muted={theme.muted} accent={theme.accent} marker={marker} maxWidth={1500} maxLines={1} titleSize={140} align="center" gap={20} delay={4} eyebrow={eyebrow} />
          </div>,
        )}
      </SceneBackdrop>
    );
  }

  const textRight = pillar === "sourire";
  const Art = pillar === "vie" ? VieArt : pillar === "sourire" ? SourireArt : SouvenirsArt;
  const blob = pillar === "vie" ? { x: 1360, y: 560, r: 400 } : pillar === "sourire" ? { x: 540, y: 560, r: 420 } : { x: 1400, y: 620, r: 420 };
  const floorY = pillar === "vie" ? 880 : pillar === "sourire" ? 880 : 900;
  const shapes: GeoShape[] =
    pillar === "vie"
      ? [
          { kind: "disc", x: 1870, y: 700, r: 110, color: s1, at: 2 },
          { kind: "ring", x: 1000, y: 150, r: 44, width: 6, color: s0, at: 4 },
          { kind: "dots", x: 150, y: 920, cols: 4, rows: 2, gap: 30, r: 5, color: s0, at: 6 },
        ]
      : pillar === "sourire"
        ? [
            { kind: "disc", x: 70, y: 140, r: 140, color: s1, at: 0 },
            { kind: "band", x: 1500, y: 1000, w: 900, h: 14, angle: -12, color: s2, at: 4 },
            { kind: "ring", x: 1800, y: 170, r: 46, width: 6, color: s0, at: 8 },
          ]
        : [
            { kind: "band", x: 1500, y: 90, w: 1000, h: 14, angle: -12, color: s0, at: 0 },
            { kind: "disc", x: 110, y: 990, r: 110, color: s1, at: 4 },
            { kind: "dots", x: 900, y: 150, cols: 3, rows: 3, gap: 30, r: 5, color: s0, at: 8 },
          ];
  return (
    <SceneBackdrop theme={theme} floorY={floorY} blob={blob} durationInFrames={durationInFrames}>
      {cam(0.6, <GeoShapes shapes={shapes} />)}
      {cam(1, <Art c={c} theme={theme} />)}
      {cam(
        0.3,
        <TextColumn side={textRight ? "right" : "left"} width={textRight ? 760 : 740}>
          <TextBlock title={scene.title} subtitle={scene.subtitle} ink={theme.ink} muted={theme.muted} accent={theme.accent} marker={marker} maxWidth={textRight ? 760 : 740} maxLines={3} delay={4} eyebrow={eyebrow} />
        </TextColumn>,
      )}
    </SceneBackdrop>
  );
};
