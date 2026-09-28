import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { School } from "../components/illustrations";
import { pop } from "../components/motion";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { KineticTitle, Pill } from "../components/text";
import { illuColors, sceneTheme } from "../theme";

/** « L'APEL, c'est quoi ? » : l'école, une famille devant, du texte à droite. */
export const ApelScene: React.FC<SceneProps> = ({ scene, video, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "apel");
  const colors = illuColors(video.palette);
  const schoolIn = pop(frame, fps, 4, 140, 12);
  const familyIn = [22, 28, 34, 40].map((d) => pop(frame, fps, d, 180, 10));
  const title = scene.title.trim() || video.associationName;

  return (
    <SceneBackdrop theme={theme} seed={211 + index} shapeCount={12}>
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 90px", gap: 60 }}>
        <div
          style={{
            flex: "0 0 860px",
            transform: `translateY(${(1 - schoolIn) * 120}px) scale(${0.6 + 0.4 * schoolIn})`,
            transformOrigin: "50% 100%",
            opacity: Math.min(1, schoolIn * 2),
          }}
        >
          <School c={colors} t={frame / fps} size={860} familyIn={familyIn} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 40 }}>
          <KineticTitle
            text={title}
            color={theme.ink}
            shadow={theme.inkShadow}
            maxWidth={800}
            maxSize={124}
            maxLines={3}
            align="left"
            delay={10}
          />
          <Pill text={scene.subtitle} bg={theme.pill} color={theme.pillInk} delay={24} fontSize={46} maxWidth={800} />
        </div>
      </AbsoluteFill>
      <Sfx src={video.sfx?.pop} at={5} volume={0.45} />
    </SceneBackdrop>
  );
};
