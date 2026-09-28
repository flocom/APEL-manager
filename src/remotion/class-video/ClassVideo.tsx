import { Audio } from "@remotion/media";
import React, { useCallback, useMemo } from "react";
import { AbsoluteFill, Sequence, useVideoConfig, type CalculateMetadataFunction } from "remotion";

import { SceneLayer, Sfx, TRANSITION_ORDER, type SceneProps } from "./components/scene";
import { ApelScene } from "./scenes/ApelScene";
import { BienfaitsScene } from "./scenes/BienfaitsScene";
import { ChiffresScene } from "./scenes/ChiffresScene";
import { FinScene } from "./scenes/FinScene";
import { IntroScene } from "./scenes/IntroScene";
import { MembresScene } from "./scenes/MembresScene";
import { PillarScene } from "./scenes/PillarScene";
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

/** Musique : montée au début, descente à la fin, et baisse sous la voix. */
const MUSIC_FADE_IN_SECONDS = 1.2;
const MUSIC_FADE_OUT_SECONDS = 2.2;
const MUSIC_DUCK_LEVEL = 0.3;
const MUSIC_DUCK_RAMP_SECONDS = 0.3;

const SceneContent: React.FC<SceneProps> = (props) => {
  switch (props.scene.id) {
    case "intro":
      return <IntroScene {...props} />;
    case "apel":
      return <ApelScene {...props} />;
    case "vie":
    case "sourire":
    case "souvenirs":
    case "rassembler":
      return <PillarScene {...props} pillar={props.scene.id} />;
    case "bienfaits":
      return <BienfaitsScene {...props} />;
    case "chiffres":
      return <ChiffresScene {...props} />;
    case "membres":
      return <MembresScene {...props} />;
    case "fin":
      return <FinScene {...props} />;
  }
};

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
    <AbsoluteFill style={{ background: props.palette.primary, fontFamily: FONT_FAMILY, overflow: "hidden" }}>
      {timeline.scenes.map((entry, i) => {
        const scene = props.scenes[i];
        const next = props.scenes[i + 1];
        const kind = i === 0 ? null : TRANSITION_ORDER[(i - 1) % TRANSITION_ORDER.length];
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
              transitionFrames={overlap}
              durationInFrames={entry.durationInFrames}
              exits={Boolean(next)}
              bandColor={sceneTheme(props.palette, scene.id).pop}
            >
              <SceneContent scene={scene} video={props} durationInFrames={entry.durationInFrames} index={i} />
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
            {i > 0 ? <Sfx src={props.sfx?.whoosh} at={0} volume={0.35} /> : null}
          </Sequence>
        );
      })}
      {props.music && props.music.url ? (
        <Audio src={props.music.url} loop loopVolumeCurveBehavior="extend" volume={volumeAt} />
      ) : null}
    </AbsoluteFill>
  );
};

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
