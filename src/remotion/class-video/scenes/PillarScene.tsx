import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { darken, withAlpha } from "../colors";
import { Twinkles } from "../components/decor";
import { Balloons, Camera, Friends, Smiley } from "../components/illustrations";
import { bob, pop, progress } from "../components/motion";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { KineticTitle, Pill } from "../components/text";
import { illuColors, sceneTheme } from "../theme";
import type { ClassVideoSceneId } from "../types";

type PillarId = Extract<ClassVideoSceneId, "vie" | "sourire" | "souvenirs" | "rassembler">;

const PILLAR_ORDER: PillarId[] = ["vie", "sourire", "souvenirs", "rassembler"];

/**
 * Un des quatre piliers : grande pastille blanche avec son illustration,
 * titre énorme à côté. L'illustration change de côté d'un pilier à l'autre.
 */
export const PillarScene: React.FC<SceneProps & { pillar: PillarId }> = ({ scene, video, index, pillar }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, pillar);
  const colors = illuColors(video.palette);
  const t = frame / fps;
  const order = PILLAR_ORDER.indexOf(pillar);
  const iconLeft = order % 2 === 0;
  const badgeIn = pop(frame, fps, 2, 150, 10);
  const badge = 640;
  const float = bob(frame, fps, 10, 3);

  const illustration = (() => {
    switch (pillar) {
      case "vie":
        return <Balloons c={colors} t={t} size={590} />;
      case "sourire":
        return <Smiley c={colors} t={t} size={480} open={progress(frame, 14, 34)} />;
      case "souvenirs": {
        const flash = Math.max(0, 1 - Math.abs(frame - 26) / 7);
        return <Camera c={colors} t={t} size={580} flash={flash} print={progress(frame, 30, 62)} />;
      }
      case "rassembler":
        return <Friends c={colors} t={t} size={580} />;
    }
  })();

  const badgeBlock = (
    <div
      style={{
        position: "relative",
        flex: `0 0 ${badge}px`,
        height: badge,
        transform: `translateY(${float}px) scale(${badgeIn}) rotate(${(1 - badgeIn) * (iconLeft ? -25 : 25)}deg)`,
      }}
    >
      {/* Anneau décalé de couleur vive, puis la pastille blanche. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: theme.pop,
          transform: `translate(${iconLeft ? 26 : -26}px, 26px)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: "#ffffff",
          boxShadow: `0 20px 40px ${withAlpha(darken(theme.bg, 0.5), 0.3)}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {illustration}
      </div>
    </div>
  );

  const textBlock = (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 40 }}>
      <KineticTitle
        text={scene.title}
        color={theme.ink}
        shadow={theme.inkShadow}
        maxWidth={900}
        maxSize={150}
        maxLines={3}
        align="left"
        delay={10}
      />
      <Pill text={scene.subtitle} bg={theme.pill} color={theme.pillInk} delay={22} fontSize={48} maxWidth={880} />
    </div>
  );

  return (
    <SceneBackdrop theme={theme} seed={307 + index * 13} shapeCount={12}>
      <Twinkles
        color={theme.ink === "#ffffff" ? "#ffffff" : theme.pop}
        seed={17 + order}
        count={7}
        delay={16}
        box={iconLeft ? { x: 80, y: 120, w: 760, h: 840 } : { x: 1080, y: 120, w: 760, h: 840 }}
      />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 130px", gap: 110 }}>
        {iconLeft ? badgeBlock : textBlock}
        {iconLeft ? textBlock : badgeBlock}
      </AbsoluteFill>
      <Sfx src={video.sfx?.pop} at={3} volume={0.5} />
      {pillar === "souvenirs" ? <Sfx src={video.sfx?.sparkle} at={24} volume={0.3} /> : null}
    </SceneBackdrop>
  );
};
