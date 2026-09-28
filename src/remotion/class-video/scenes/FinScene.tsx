import { QRCodeSVG } from "qrcode.react";
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

import { contrastRatio, NEAR_BLACK, readableOn, withAlpha, WHITE } from "../colors";
import { Character, handMeetPoint, makeCast } from "../components/characters";
import { GeoShapes } from "../components/decor";
import { Camera, Sheen } from "../components/finish";
import { snap } from "../components/motion";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { BODY_CHAR, fitFontSize, frenchSpaces, TextBlock } from "../components/text";
import { beatFrames } from "../timeline";
import { FONT_FAMILY, illuColors, sceneTheme } from "../theme";
import { LogoCard, MARGIN_X } from "./common";

/** Côté du QR code (px) : lisible depuis le fond d'une salle une fois projeté. */
const QR_SIZE = 380;
/** Marge blanche autour du code (zone de silence, plus de 4 modules). */
const QR_PAD = 52;

/**
 * Fin : l'appel à rejoindre l'association. Titre, sous-titre, l'adresse en
 * bouton, la cotisation si elle est publiée, un grand QR code vers la page
 * « Nous rejoindre » quand l'adresse du site est connue, et des familles qui
 * saluent.
 */
export const FinScene: React.FC<SceneProps> = ({ scene, video, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "fin");
  const c = illuColors(video.palette);
  const cast = makeCast(c, theme.bg);
  const join = video.joinLabel.trim();
  const url = video.joinUrl.trim();
  const fee = video.membershipFee?.trim() ?? "";
  const hasQr = url.length > 0;
  const ctaAt = 22;
  const ctaIn = Math.max(0, snap(frame, fps, ctaAt, 260, 18));
  const feeIn = Math.max(0, snap(frame, fps, ctaAt + 6, 260, 18));
  const qrIn = Math.max(0, snap(frame, fps, 12, 220, 18));
  const logoIn = Math.max(0, snap(frame, fps, 2, 240, 18));
  // Le bouton bat doucement la mesure.
  const beat = beatFrames(fps);
  const pulse = frame > ctaAt + 12 ? 1 + 0.025 * Math.max(0, Math.cos((2 * Math.PI * (frame % beat)) / beat)) ** 6 : 1;
  // Bouton blanc : texte dans la couleur principale si elle se lit dessus.
  const ctaInk = contrastRatio(video.palette.primary, WHITE) >= 4.5 ? video.palette.primary : video.palette.dark;
  const lightInk = theme.ink === WHITE;
  const textW = hasQr ? 900 : 860;
  const joinSize = fitFontSize(join, textW - 180, 1, 50, 28, 0.56);
  // Modules du QR : le plus foncé possible pour une lecture sûre.
  const qrInk = contrastRatio(video.palette.dark, WHITE) >= 12 ? video.palette.dark : NEAR_BLACK;
  const hands = handMeetPoint({ look: cast.jade, height: 300, x: 1350 }, { look: cast.claire, height: 440, x: 1510 }, 1005);
  const [s0, s1 = s0] = theme.shapes;

  return (
    <SceneBackdrop theme={theme} floorY={900} blob={hasQr ? { x: 1530, y: 460, r: 380 } : { x: 1440, y: 560, r: 400 }} durationInFrames={durationInFrames}>
      <Camera depth={0.6} durationInFrames={durationInFrames}>
        <GeoShapes
          shapes={[
            { kind: "disc", x: 1870, y: 80, r: 130, color: s0, at: 0 },
            { kind: "band", x: 420, y: 1030, w: 1100, h: 14, angle: -8, color: s1, at: 4, from: -1 },
            { kind: "dots", x: hasQr ? 1150 : 1080, y: 130, cols: 3, rows: 2, gap: 30, r: 5, color: s0, at: 8 },
          ]}
        />
      </Camera>
      <Camera depth={0.8} durationInFrames={durationInFrames}>
        {hasQr ? (
          <>
            <Character look={cast.claire} c={c} x={1170} y={1030} height={450} gesture="present" gestureAt={20} gaze={0.5} seed={62} appear={6} shadow={theme.shadow} groove={3} />
            <div
              style={{
                position: "absolute",
                left: 1300,
                top: 150,
                width: QR_SIZE + QR_PAD * 2,
                padding: `${QR_PAD}px ${QR_PAD}px 30px`,
                boxSizing: "border-box",
                borderRadius: 40,
                background: WHITE,
                boxShadow: "0 30px 60px rgba(0, 0, 0, 0.25)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 22,
                overflow: "hidden",
                transformOrigin: "50% 60%",
                transform: `perspective(1600px) rotateY(${(1 - qrIn) * 35}deg) scale(${0.7 + 0.3 * qrIn})`,
                opacity: Math.min(1, qrIn * 3),
              }}
            >
              <Sheen at={24} every={90} width={140} opacity={0.35} />
              <QRCodeSVG value={url} size={QR_SIZE} level="M" marginSize={0} fgColor={qrInk} bgColor={WHITE} style={{ display: "block" }} />
              <div style={{ fontFamily: FONT_FAMILY, fontWeight: 800, fontSize: 32, color: qrInk, letterSpacing: "-0.01em", textAlign: "center" }}>
                {/* Libellé fixe : il accompagne le code, quel que soit le réglage. */}
                Scannez pour nous rejoindre
              </div>
            </div>
            <Character look={cast.jade} c={c} x={1845} y={1040} height={300} gesture="cheer" gestureAt={26} mood="laugh" gaze={-0.5} seed={61} appear={10} shadow={theme.shadow} groove={4} />
          </>
        ) : (
          <>
            <Character look={cast.awa} c={c} x={1180} y={1000} height={450} gesture="wave" gestureAt={16} side="left" gaze={-0.3} seed={60} appear={4} shadow={theme.shadow} groove={3} />
            <Character look={cast.jade} c={c} x={1350} y={1005} height={300} mood="laugh" reachRight={hands} gaze={0.2} seed={61} appear={7} shadow={theme.shadow} groove={4} />
            <Character look={cast.claire} c={c} x={1510} y={1005} height={440} reachLeft={hands} gesture="wave" gestureAt={20} gaze={0} seed={62} appear={10} shadow={theme.shadow} groove={3} />
            <Character look={cast.karim} c={c} x={1700} y={1000} height={460} gesture="wave" gestureAt={24} side="right" gaze={-0.4} seed={63} appear={13} shadow={theme.shadow} groove={3} />
          </>
        )}
      </Camera>

      <Camera depth={0.25} durationInFrames={durationInFrames}>
        <div style={{ position: "absolute", left: MARGIN_X, top: 0, bottom: 0, width: textW, display: "flex", flexDirection: "column", justifyContent: "center", gap: 0 }}>
          {video.logoUrl ? (
            <div style={{ marginBottom: 40, alignSelf: "flex-start", transformOrigin: "0% 100%", transform: `scale(${logoIn})` }}>
              <LogoCard logoUrl={video.logoUrl} fallbackText={video.associationName} width={230} height={130} ink={video.palette.primary} fallbackBg={video.palette.light} />
            </div>
          ) : null}
          <TextBlock
            title={scene.title}
            subtitle={scene.subtitle}
            ink={theme.ink}
            muted={theme.muted}
            accent={theme.accent}
            marker={{ color: theme.marker, ink: theme.markerInk }}
            maxWidth={textW}
            maxLines={2}
            titleSize={140}
            delay={2}
          />
          {join ? (
            <div
              style={{
                marginTop: 50,
                alignSelf: "flex-start",
                display: "flex",
                alignItems: "center",
                gap: 22,
                padding: "22px 40px 22px 24px",
                borderRadius: 999,
                background: WHITE,
                boxShadow: "0 18px 40px rgba(0, 0, 0, 0.22)",
                opacity: Math.min(1, ctaIn * 3),
                position: "relative",
                overflow: "hidden",
                transformOrigin: "0% 50%",
                transform: `scale(${(0.6 + 0.4 * ctaIn) * pulse})`,
              }}
            >
              <Sheen at={ctaAt + 16} every={beat * 4} width={110} opacity={0.7} />
              <div style={{ width: joinSize * 1.5, height: joinSize * 1.5, borderRadius: "50%", background: video.palette.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width={joinSize * 0.8} height={joinSize * 0.8} viewBox="0 0 24 24" style={{ display: "block" }}>
                  <path d="M4 12 H19 M13 6 L19 12 L13 18" stroke={readableOn(video.palette.primary, video.palette.dark)} strokeWidth={2.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ fontFamily: FONT_FAMILY, fontWeight: 800, fontSize: joinSize, color: ctaInk, whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{join}</div>
            </div>
          ) : null}
          {fee ? (
            <div
              style={{
                marginTop: 24,
                alignSelf: "flex-start",
                padding: "14px 30px",
                borderRadius: 999,
                border: `3px solid ${lightInk ? withAlpha(WHITE, 0.7) : withAlpha(theme.ink, 0.45)}`,
                fontFamily: FONT_FAMILY,
                fontWeight: 500,
                fontSize: fitFontSize(`Adhésion : ${fee}`, 760, 1, 38, 24, BODY_CHAR),
                color: theme.ink,
                whiteSpace: "nowrap",
                opacity: Math.min(1, feeIn * 3),
                transformOrigin: "0% 50%",
                transform: `scale(${0.6 + 0.4 * feeIn})`,
              }}
            >
              {/* Seul autre libellé écrit en dur : le reste vient des réglages. */}
              <span style={{ fontWeight: 800 }}>Adhésion :</span> {frenchSpaces(fee)}
            </div>
          ) : null}
        </div>
      </Camera>
      <Sfx src={video.sfx?.sparkle} at={ctaAt} volume={0.4} />
      {hasQr ? <Sfx src={video.sfx?.pop} at={12} volume={0.3} /> : null}
    </SceneBackdrop>
  );
};
