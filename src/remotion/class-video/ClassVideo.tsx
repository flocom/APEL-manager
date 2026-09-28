import { Audio } from "@remotion/media";
import React, { useCallback, useMemo } from "react";
import { AbsoluteFill, Sequence, useVideoConfig, type CalculateMetadataFunction } from "remotion";

import { darken } from "./colors";
import { SceneLayer, Sfx, TRANSITION_ORDER, type SceneProps, type TransitionKind } from "./components/scene";
import { ApelScene } from "./scenes/ApelScene";
import { BienfaitsScene } from "./scenes/BienfaitsScene";
import { ChiffresScene } from "./scenes/ChiffresScene";
import { FinScene } from "./scenes/FinScene";
import { IntroScene } from "./scenes/IntroScene";
import { MembresScene } from "./scenes/MembresScene";
import { AgendaScene } from "./scenes/AgendaScene";
import { BenevolatScene } from "./scenes/BenevolatScene";
import { DevenirMembreScene } from "./scenes/DevenirMembreScene";
import { LienScene } from "./scenes/LienScene";
import { SiteScene } from "./scenes/SiteScene";
import { FONT_FAMILY, sceneTheme } from "./theme";
import { computeClassVideoTimeline, transitionFrames, voiceOffsetFrames } from "./timeline";
import {
  CLASS_VIDEO_FPS,
  CLASS_VIDEO_HEIGHT,
  CLASS_VIDEO_WIDTH,
  type ClassVideoProps,
  type ClassVideoScene,
} from "./types";

export { CLASS_VIDEO_FPS, CLASS_VIDEO_HEIGHT, CLASS_VIDEO_WIDTH };

/** Musique : présente dès la première image (accroche), descente à la fin, baisse sous la voix. */
const MUSIC_FADE_IN_SECONDS = 0.08;
const MUSIC_FADE_OUT_SECONDS = 1.6;
const MUSIC_DUCK_LEVEL = 0.3;
const MUSIC_DUCK_RAMP_SECONDS = 0.3;

const SceneContent: React.FC<SceneProps> = (props) => {
  switch (props.scene.id) {
    case "intro":
      return <IntroScene {...props} />;
    case "apel":
      return <ApelScene {...props} />;
    case "agenda":
      return <AgendaScene {...props} />;
    case "site":
      return <SiteScene {...props} />;
    case "benevolat":
      return <BenevolatScene {...props} />;
    case "bienfaits":
      return <BienfaitsScene {...props} />;
    case "lien":
      return <LienScene {...props} />;
    case "membre":
      return <DevenirMembreScene {...props} />;
    case "chiffres":
      return <ChiffresScene {...props} />;
    case "membres":
      return <MembresScene {...props} />;
    case "fin":
      return <FinScene {...props} />;
  }
};

/**
 * Avance donnée à une scène qui entre (images) : quand la transition la
 * dévoile, elle est déjà composée (décor et personnages en place), ses
 * animations finissent de se jouer à l'écran.
 */
const SCENE_PREROLL = 9;

/**
 * Niveau de la musique pour chaque image (0…1, avant le volume choisi).
 * Calculé une fois : Remotion appelle le callback de volume à chaque image.
 */
function musicEnvelope(
  scenes: ClassVideoScene[],
  entries: { from: number }[],
  total: number,
  fps: number,
): Float32Array {
  const duck = new Float32Array(total).fill(1);
  const ramp = Math.max(1, Math.round(MUSIC_DUCK_RAMP_SECONDS * fps));
  const offset = voiceOffsetFrames(fps);
  scenes.forEach((scene, i) => {
    if (!scene.voice || !entries[i]) return;
    const start = entries[i].from + offset;
    const end = start + Math.ceil(scene.voice.durationInSeconds * fps);
    for (let f = Math.max(0, start - ramp); f < Math.min(total, end + ramp); f++) {
      const k = f < start ? (start - f) / ramp : f > end ? (f - end) / ramp : 0;
      const level = MUSIC_DUCK_LEVEL + (1 - MUSIC_DUCK_LEVEL) * Math.min(1, k);
      duck[f] = Math.min(duck[f], level);
    }
  });
  const fadeIn = Math.round(MUSIC_FADE_IN_SECONDS * fps);
  const fadeOut = Math.round(MUSIC_FADE_OUT_SECONDS * fps);
  for (let f = 0; f < total; f++) {
    const inK = Math.min(1, f / fadeIn);
    const outK = Math.min(1, (total - 1 - f) / fadeOut);
    duck[f] *= Math.max(0, Math.min(inK, outK));
  }
  return duck;
}

export const ClassVideo: React.FC<ClassVideoProps> = (props) => {
  const { fps } = useVideoConfig();
  const timeline = useMemo(() => computeClassVideoTimeline(props, fps), [props, fps]);
  const overlap = transitionFrames(fps);
  const envelope = useMemo(
    () => musicEnvelope(props.scenes, timeline.scenes, timeline.durationInFrames, fps),
    [props.scenes, timeline, fps],
  );
  const musicVolume = props.music?.volume ?? 0;
  const volumeAt = useCallback(
    (frame: number) => musicVolume * (envelope[Math.max(0, Math.min(envelope.length - 1, Math.round(frame)))] ?? 0),
    [envelope, musicVolume],
  );

  return (
    <AbsoluteFill style={{ background: "#ffffff", fontFamily: FONT_FAMILY, overflow: "hidden" }}>
      {timeline.scenes.map((entry, i) => {
        const scene = props.scenes[i];
        const next = props.scenes[i + 1];
        // Transitions variées, dans un ordre fixe (même vidéo à chaque rendu).
        const kindAt = (k: number): TransitionKind | null => (k <= 0 ? null : TRANSITION_ORDER[(k - 1) % TRANSITION_ORDER.length]);
        const kind = kindAt(i);
        const nextKind = next ? kindAt(i + 1) : null;
        return (
          <Sequence
            key={`${entry.id}-${i}`}
            from={entry.from}
            durationInFrames={entry.durationInFrames}
            premountFor={fps}
            name={entry.id}
          >
            <SceneLayer
              kind={kind}
              nextKind={nextKind}
              transitionFrames={overlap}
              durationInFrames={entry.durationInFrames}
              panelColors={panelColors(props.palette, scene.id)}
            >
              <Sequence from={i === 0 ? 0 : -SCENE_PREROLL} name={`Contenu ${entry.id}`}>
                <SceneContent scene={scene} video={props} durationInFrames={entry.durationInFrames + (i === 0 ? 0 : SCENE_PREROLL)} index={i} />
              </Sequence>
            </SceneLayer>
            {scene.voice ? (
              <Sequence
                from={voiceOffsetFrames(fps)}
                durationInFrames={Math.ceil(scene.voice.durationInSeconds * fps) + fps}
                layout="none"
                name={`Voix ${entry.id}`}
              >
                <Audio src={scene.voice.url} />
              </Sequence>
            ) : null}
            {i > 0 ? <Sfx src={props.sfx?.whoosh} at={0} volume={0.3} /> : null}
          </Sequence>
        );
      })}
      {props.music && props.music.url ? (
        <Audio src={props.music.url} loop loopVolumeCurveBehavior="extend" volume={volumeAt} />
      ) : null}
    </AbsoluteFill>
  );
};

/** Bandes du balayage d'entrée : accent, seconde couleur, puis la teinte de la scène qui arrive. */
function panelColors(palette: ClassVideoProps["palette"], id: ClassVideoScene["id"]): string[] {
  const theme = sceneTheme(palette, id);
  return [theme.marker, theme.shapes.find((c) => c !== theme.marker) ?? "#ffffff", darken(theme.bg, 0.12)];
}

/** À passer en `calculateMetadata` de la <Composition> ou du rendu web. */
export const calculateClassVideoMetadata: CalculateMetadataFunction<ClassVideoProps> = ({ props }) => {
  const timeline = computeClassVideoTimeline(props, CLASS_VIDEO_FPS);
  return {
    durationInFrames: timeline.durationInFrames,
    fps: CLASS_VIDEO_FPS,
    width: CLASS_VIDEO_WIDTH,
    height: CLASS_VIDEO_HEIGHT,
  };
};
