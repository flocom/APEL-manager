import React from "react";
import { useCurrentFrame } from "remotion";

import { contrastRatio, readableOn, withAlpha, WHITE } from "../colors";
import { Character, handMeetPoint, makeCast } from "../components/characters";
import { Sparkles } from "../components/decor";
import { enter } from "../components/motion";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { BODY_CHAR, fitFontSize, frenchSpaces, TextBlock } from "../components/text";
import { FONT_FAMILY, illuColors, sceneTheme } from "../theme";
import { LogoCard, MARGIN_X } from "./common";

/**
 * Fin : l'appel à rejoindre l'association. Titre, sous-titre, l'adresse en
 * bouton, la cotisation si elle est publiée, et des familles qui saluent.
 */
export const FinScene: React.FC<SceneProps> = ({ scene, video }) => {
  const frame = useCurrentFrame();
  const theme = sceneTheme(video.palette, "fin");
  const c = illuColors(video.palette);
  const cast = makeCast(c, theme.bold ? theme.bg : undefined);
  const join = video.joinLabel.trim();
  const fee = video.membershipFee?.trim() ?? "";
  const ctaAt = 34;
  const ctaIn = enter(frame, ctaAt, 22);
  const feeIn = enter(frame, ctaAt + 12, 22);
  const logoIn = enter(frame, 2, 22);
  // Bouton blanc : texte dans la couleur principale si elle se lit dessus.
  const ctaInk = contrastRatio(video.palette.primary, WHITE) >= 4.5 ? video.palette.primary : video.palette.dark;
  const lightInk = theme.ink === WHITE;
  const joinSize = fitFontSize(join, 700, 1, 50, 28, 0.56);
  const hands = handMeetPoint({ look: cast.jade, height: 300, x: 1350 }, { look: cast.claire, height: 440, x: 1510 }, 1005);

  return (
    <SceneBackdrop theme={theme} floorY={900} blob={{ x: 1440, y: 560, r: 400 }}>
      <Sparkles color={theme.accent} seed={71} count={4} delay={30} box={{ x: 1120, y: 150, w: 640, h: 220 }} size={32} opacity={0.85} />
      <Character look={cast.awa} c={c} x={1180} y={1000} height={450} gesture="wave" gestureAt={20} side="left" gaze={-0.3} seed={60} appear={4} shadow={theme.shadow} />
      <Character look={cast.jade} c={c} x={1350} y={1005} height={300} mood="laugh" reachRight={hands} gaze={0.2} seed={61} appear={8} shadow={theme.shadow} />
      <Character look={cast.claire} c={c} x={1510} y={1005} height={440} reachLeft={hands} gesture="wave" gestureAt={28} gaze={0} seed={62} appear={10} shadow={theme.shadow} />
      <Character look={cast.karim} c={c} x={1700} y={1000} height={460} gesture="wave" gestureAt={36} side="right" gaze={-0.4} seed={63} appear={14} shadow={theme.shadow} />

      <div style={{ position: "absolute", left: MARGIN_X, top: 0, bottom: 0, width: 860, display: "flex", flexDirection: "column", justifyContent: "center", gap: 0 }}>
        {video.logoUrl ? (
          <div style={{ opacity: logoIn, marginBottom: 48, alignSelf: "flex-start" }}>
            <LogoCard logoUrl={video.logoUrl} fallbackText={video.associationName} width={250} height={140} ink={video.palette.primary} fallbackBg={video.palette.light} />
          </div>
        ) : null}
        <TextBlock title={scene.title} subtitle={scene.subtitle} ink={theme.ink} muted={theme.muted} accent={theme.accent} maxWidth={860} maxLines={2} titleSize={120} delay={6} />
        {join ? (
          <div
            style={{
              marginTop: 56,
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: 22,
              padding: "22px 40px 22px 24px",
              borderRadius: 999,
              background: WHITE,
              boxShadow: "0 18px 40px rgba(0, 0, 0, 0.18)",
              opacity: ctaIn,
              transform: `translateY(${(1 - ctaIn) * 24}px)`,
            }}
          >
            <div style={{ width: joinSize * 1.5, height: joinSize * 1.5, borderRadius: "50%", background: video.palette.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width={joinSize * 0.8} height={joinSize * 0.8} viewBox="0 0 24 24" style={{ display: "block" }}>
                <path d="M4 12 H19 M13 6 L19 12 L13 18" stroke={readableOn(video.palette.primary, video.palette.dark)} strokeWidth={2.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: joinSize, color: ctaInk, whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{join}</div>
          </div>
        ) : null}
        {fee ? (
          <div
            style={{
              marginTop: 26,
              alignSelf: "flex-start",
              padding: "14px 30px",
              borderRadius: 999,
              border: `3px solid ${lightInk ? withAlpha(WHITE, 0.6) : withAlpha(theme.ink, 0.4)}`,
              fontFamily: FONT_FAMILY,
              fontWeight: 500,
              fontSize: fitFontSize(`Adhésion : ${fee}`, 760, 1, 36, 24, BODY_CHAR),
              color: theme.ink,
              whiteSpace: "nowrap",
              opacity: feeIn,
              transform: `translateY(${(1 - feeIn) * 18}px)`,
            }}
          >
            {/* Seul libellé écrit en dur : le reste vient des réglages. */}
            <span style={{ fontWeight: 700 }}>Adhésion :</span> {frenchSpaces(fee)}
          </div>
        ) : null}
      </div>
      <Sfx src={video.sfx?.pop} at={ctaAt + 1} volume={0.22} />
      <Sfx src={video.sfx?.sparkle} at={ctaAt + 14} volume={0.35} />
    </SceneBackdrop>
  );
};
