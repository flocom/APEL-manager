import { QRCodeSVG } from "qrcode.react";
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

import { contrastRatio, mix, NEAR_BLACK, withAlpha, WHITE } from "../colors";
import { Character, handMeetPoint, makeCast } from "../components/characters";
import { GeoShapes } from "../components/decor";
import { Camera, Sheen } from "../components/finish";
import { snap } from "../components/motion";
import { HelpIcon, MemberIcon } from "../components/objects";
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
 * Fin : les deux portes d'entrée — « Devenir membre » et « Prêter
 * main-forte » — en grandes tuiles, « Tout est sur » l'adresse du site, la
 * cotisation, le QR code vers la page « Nous rejoindre », et le mot de la
 * fin (titre et sous-titre de la scène). Tient assez longtemps pour scanner.
 */
export const FinScene: React.FC<SceneProps> = ({ scene, video, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "fin");
  const c = illuColors(video.palette);
  const cast = makeCast(c, theme.bg);
  const url = video.joinUrl.trim();
  const site = video.siteLabel.trim() || video.joinLabel.trim();
  const fee = video.membershipFee?.trim() ?? "";
  const hasQr = url.length > 0;
  const pop = (at: number, stiffness = 240) => Math.max(0, snap(frame, fps, at, stiffness, 18));
  const tilesAt = 16;
  const siteIn = pop(tilesAt + 14);
  const feeIn = pop(tilesAt + 18);
  const qrIn = pop(10, 200);
  const logoIn = pop(2);
  const beat = beatFrames(fps);
  const pulse = (k: number) => (frame > tilesAt + 20 ? 1 + 0.02 * Math.max(0, Math.cos((2 * Math.PI * ((frame + k * 8) % (beat * 2))) / (beat * 2))) ** 8 : 1);
  const qrInk = contrastRatio(video.palette.dark, WHITE) >= 12 ? video.palette.dark : NEAR_BLACK;
  const textW = hasQr ? 960 : 1000;
  const tileW = hasQr ? 480 : 500;
  const tiles = [
    { label: "Devenir membre", icon: <MemberIcon size={92} color={video.palette.primary} accent={video.palette.secondary} />, tint: video.palette.primary },
    { label: "Prêter main‑forte", icon: <HelpIcon size={92} color={video.palette.primary} accent={video.palette.secondary} />, tint: video.palette.secondary },
  ];
  const hands = handMeetPoint({ look: cast.jade, height: 300, x: 1490 }, { look: cast.claire, height: 430, x: 1640 }, 1005);
  const [s0, s1 = s0] = theme.shapes;

  return (
    <SceneBackdrop theme={theme} floorY={910} blob={hasQr ? { x: 1560, y: 460, r: 380 } : { x: 1500, y: 560, r: 400 }} durationInFrames={durationInFrames}>
      <Camera depth={0.6} durationInFrames={durationInFrames}>
        <GeoShapes
          shapes={[
            { kind: "disc", x: 1880, y: 80, r: 120, color: s0, at: 0 },
            { kind: "band", x: 420, y: 1040, w: 1100, h: 14, angle: -6, color: s1, at: 4, from: -1 },
            { kind: "dots", x: 1170, y: 110, cols: 3, rows: 2, gap: 30, r: 5, color: s0, at: 8 },
          ]}
        />
      </Camera>
      <Camera depth={0.8} durationInFrames={durationInFrames}>
        {hasQr ? (
          <>
            <Character look={cast.claire} c={c} x={1225} y={1040} height={380} gesture="present" gestureAt={20} gaze={0.5} seed={62} appear={6} shadow={theme.shadow} groove={3} />
            <div
              style={{
                position: "absolute",
                left: 1330,
                top: 160,
                width: QR_SIZE + QR_PAD * 2,
                padding: `${QR_PAD}px ${QR_PAD}px 28px`,
                boxSizing: "border-box",
                borderRadius: 40,
                background: WHITE,
                boxShadow: "0 30px 60px rgba(0, 0, 0, 0.28)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 20,
                overflow: "hidden",
                transformOrigin: "50% 60%",
                transform: `perspective(1600px) rotateY(${(1 - qrIn) * 35}deg) scale(${0.7 + 0.3 * qrIn})`,
                opacity: Math.min(1, qrIn * 3),
              }}
            >
              <QRCodeSVG value={url} size={QR_SIZE} level="M" marginSize={0} fgColor={qrInk} bgColor={WHITE} style={{ display: "block" }} />
              <div style={{ fontFamily: FONT_FAMILY, fontWeight: 800, fontSize: 31, color: qrInk, letterSpacing: "-0.01em", textAlign: "center", lineHeight: 1.15 }}>
                {/* Libellé fixe : il accompagne le code, quel que soit le réglage. */}
                Scannez pour nous rejoindre
              </div>
              <Sheen at={26} every={120} width={130} opacity={0.3} />
            </div>
          </>
        ) : (
          <>
            <Character look={cast.awa} c={c} x={1340} y={1000} height={440} gesture="wave" gestureAt={16} side="left" gaze={-0.3} seed={60} appear={4} shadow={theme.shadow} groove={3} />
            <Character look={cast.jade} c={c} x={1490} y={1005} height={300} mood="laugh" reachRight={hands} gaze={0.2} seed={61} appear={7} shadow={theme.shadow} groove={4} />
            <Character look={cast.claire} c={c} x={1640} y={1005} height={430} reachLeft={hands} gesture="wave" gestureAt={20} gaze={0} seed={62} appear={10} shadow={theme.shadow} groove={3} />
            <Character look={cast.karim} c={c} x={1805} y={1000} height={450} gesture="wave" gestureAt={24} side="right" gaze={-0.4} seed={63} appear={13} shadow={theme.shadow} groove={3} />
          </>
        )}
      </Camera>

      <Camera depth={0.25} durationInFrames={durationInFrames}>
        <div style={{ position: "absolute", left: MARGIN_X, top: 0, bottom: 0, width: textW, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {video.logoUrl ? (
            <div style={{ marginBottom: 34, alignSelf: "flex-start", transformOrigin: "0% 100%", transform: `scale(${logoIn})` }}>
              <LogoCard logoUrl={video.logoUrl} fallbackText={video.associationName} width={200} height={112} ink={video.palette.primary} fallbackBg={video.palette.light} />
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
            maxLines={1}
            titleSize={140}
            subtitleSize={44}
            gap={20}
            delay={2}
          />
          {/* Les deux appels à l'action. */}
          <div style={{ display: "flex", gap: 26, marginTop: 44 }}>
            {tiles.map((tile, i) => {
              const p = pop(tilesAt + i * 5, 220);
              return (
                <div
                  key={tile.label}
                  style={{
                    position: "relative",
                    width: tileW,
                    height: 190,
                    borderRadius: 34,
                    background: WHITE,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    gap: 22,
                    padding: "0 30px 0 24px",
                    boxSizing: "border-box",
                    boxShadow: "0 24px 50px rgba(0, 0, 0, 0.22)",
                    opacity: Math.min(1, p * 3),
                    transformOrigin: "50% 100%",
                    transform: `perspective(1400px) rotateX(${(1 - p) * 55}deg) translateY(${(1 - p) * 40}px) scale(${pulse(i)})`,
                  }}
                >
                  <div style={{ flex: "0 0 124px", height: 124, borderRadius: 34, background: mix(tile.tint, WHITE, 0.86), display: "flex", alignItems: "center", justifyContent: "center" }}>{tile.icon}</div>
                  <div style={{ flex: 1, fontFamily: FONT_FAMILY, fontWeight: 800, fontSize: fitFontSize(tile.label, tileW - 200, 2, 46, 28, 0.6), lineHeight: 1.08, letterSpacing: "-0.02em", color: c.ink }}>
                    {/* Libellés fixes des deux appels. */}
                    {tile.label}
                  </div>
                  <svg width={30} height={30} viewBox="0 0 24 24" style={{ display: "block", flexShrink: 0 }}>
                    <path d="M5 12 H18 M12 6 L18 12 L12 18" stroke={tile.tint} strokeWidth={2.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <Sheen at={tilesAt + 12 + i * 5} every={beat * 8} width={110} opacity={0.55} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 34, flexWrap: "wrap" }}>
            {site ? (
              <div style={{ fontFamily: FONT_FAMILY, fontSize: 40, color: theme.ink, opacity: Math.min(1, siteIn * 3), transform: `translateY(${(1 - siteIn) * 16}px)`, whiteSpace: "nowrap" }}>
                <span style={{ fontWeight: 500 }}>Tout est sur </span>
                <span style={{ position: "relative", fontWeight: 800, display: "inline-block" }}>
                  {site}
                  <span style={{ position: "absolute", left: 0, right: 0, bottom: -4, height: 6, borderRadius: 3, background: theme.marker, transformOrigin: "0% 50%", transform: `scaleX(${pop(tilesAt + 20)})` }} />
                </span>
              </div>
            ) : null}
            {fee ? (
              <div
                style={{
                  padding: "10px 24px",
                  borderRadius: 999,
                  border: `3px solid ${withAlpha(WHITE, 0.7)}`,
                  fontFamily: FONT_FAMILY,
                  fontWeight: 500,
                  fontSize: fitFontSize(`Adhésion : ${fee}`, 520, 1, 32, 22, BODY_CHAR),
                  color: theme.ink,
                  whiteSpace: "nowrap",
                  opacity: Math.min(1, feeIn * 3),
                  transformOrigin: "0% 50%",
                  transform: `scale(${0.7 + 0.3 * feeIn})`,
                }}
              >
                <span style={{ fontWeight: 800 }}>Adhésion :</span> {frenchSpaces(fee)}
              </div>
            ) : null}
          </div>
        </div>
      </Camera>
      <Sfx src={video.sfx?.pop} at={10} volume={0.28} />
      <Sfx src={video.sfx?.sparkle} at={tilesAt} volume={0.4} />
      <Sfx src={video.sfx?.pop} at={tilesAt + 5} volume={0.25} />
    </SceneBackdrop>
  );
};
