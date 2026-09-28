import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { mix, readableOn, withAlpha, WHITE } from "../colors";
import { Character, handMeetPoint, makeCast, SKIN_TONES } from "../components/characters";
import { GeoShapes } from "../components/decor";
import { Cursor } from "../components/devices";
import { Camera, EXPO_IN_OUT, Sheen } from "../components/finish";
import { snap } from "../components/motion";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { TextBlock } from "../components/text";
import { FONT_FAMILY, illuColors, sceneTheme } from "../theme";
import { chapter, TextColumn } from "./common";

const CARD = { x: 1150, y: 100, w: 640, h: 470 };
/** Créneaux d'exemple (illustration d'un planning de bénévoles). */
const SLOTS = ["9:00 – 10:00", "10:00 – 11:00", "11:00 – 12:00", "14:00 – 15:00", "15:00 – 16:00", "16:00 – 17:00"];
const PICK = 3;

/** Petit avatar rond (visage et cheveux) pour la rangée des inscrits. */
const MiniAvatar: React.FC<{ skin: string; hair: string; bg: string; size: number }> = ({ skin, hair, bg, size }) => (
  <svg width={size} height={size} viewBox="0 0 60 60" style={{ display: "block" }}>
    <circle cx={30} cy={30} r={30} fill={bg} />
    <circle cx={30} cy={62} r={20} fill={mix(bg, "#000000", 0.25)} />
    <circle cx={30} cy={30} r={14} fill={skin} />
    <path d="M16 30 C15 18 22 13 30 13 C38 13 45 18 44 30 C40 24 34 22 30 22 C25 22 20 25 16 30 Z" fill={hair} />
  </svg>
);

/**
 * « Venez prêter main-forte » : un planning de créneaux qui s'allument l'un
 * après l'autre, le pointeur en choisit un (coche), d'autres parents
 * rejoignent la liste ; en bas, deux parents se serrent la main.
 */
export const BenevolatScene: React.FC<SceneProps> = ({ scene, video, durationInFrames, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "benevolat");
  const c = illuColors(video.palette);
  const cast = makeCast(c, theme.bg);
  const pop = (at: number, stiffness = 240) => Math.max(0, snap(frame, fps, at, stiffness, 19));

  const cardIn = pop(2, 200);
  const colW = (CARD.w - 60 - 20) / 2;
  const slotPos = (i: number) => ({ x: CARD.x + 30 + (i % 2) * (colW + 20), y: CARD.y + 110 + Math.floor(i / 2) * 84 });
  const sweepAt = 14;
  const pickAt = 44;
  const moveAt = 26;
  const target = slotPos(PICK);
  const m = interpolate(frame, [moveAt, moveAt + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO_IN_OUT });
  const cursorX = interpolate(m, [0, 1], [CARD.x + CARD.w + 120, target.x + colW * 0.62]);
  const cursorY = interpolate(m, [0, 1], [CARD.y + CARD.h + 140, target.y + 34]);
  const click = interpolate(frame, [pickAt, pickAt + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const picked = pop(pickAt, 300);
  const primary = video.palette.primary;
  const onPrimary = readableOn(primary, video.palette.dark);

  // Poignée de main : les deux mains se rejoignent puis secouent un peu.
  const a = { look: cast.karim, height: 440, x: 1330 };
  const b = { look: cast.awa, height: 430, x: 1560 };
  const meet = handMeetPoint(a, b, 1010);
  const shake = frame > 40 ? Math.sin(((frame - 40) / fps) * Math.PI * 5) * 7 * Math.max(0, 1 - (frame - 40) / 40) : 0;
  const hands = { x: meet.x, y: meet.y - 40 + shake };

  const avatars = [
    { skin: SKIN_TONES[1], hair: "#4e3222", bg: mix(c.b, WHITE, 0.6) },
    { skin: SKIN_TONES[4], hair: "#221915", bg: mix(c.c, WHITE, 0.5) },
    { skin: SKIN_TONES[0], hair: "#c9a063", bg: mix(c.a, WHITE, 0.6) },
  ];

  return (
    <SceneBackdrop theme={theme} floorY={900} blob={{ x: 1460, y: 520, r: 440 }} durationInFrames={durationInFrames}>
      <Camera depth={0.6} durationInFrames={durationInFrames}>
        <GeoShapes
          shapes={[
            { kind: "disc", x: 1080, y: 980, r: 90, color: theme.shapes[0], at: 0 },
            { kind: "ring", x: 1860, y: 660, r: 44, width: 6, color: theme.shapes[0], at: 4 },
            { kind: "dots", x: 1000, y: 120, cols: 3, rows: 3, gap: 30, r: 5, color: withAlpha(WHITE, 0.8), at: 7 },
          ]}
        />
      </Camera>
      <Camera depth={1} durationInFrames={durationInFrames}>
        <Character look={a.look} c={c} x={a.x} y={1010} height={a.height} reachRight={hands} gaze={0.6} tilt={3} mood="laugh" seed={80} appear={6} shadow={theme.shadow} groove={3} />
        <Character look={b.look} c={c} x={b.x} y={1010} height={b.height} reachLeft={hands} gaze={-0.6} tilt={-2} seed={81} appear={9} shadow={theme.shadow} groove={3} />
        <Character look={cast.jade} c={c} x={1770} y={1015} height={290} gesture="cheer" gestureAt={50} mood="laugh" gaze={-0.5} seed={82} appear={14} shadow={theme.shadow} groove={4} />

        {/* Planning des créneaux */}
        <div
          style={{
            position: "absolute",
            left: CARD.x,
            top: CARD.y,
            width: CARD.w,
            height: CARD.h,
            borderRadius: 30,
            background: WHITE,
            overflow: "hidden",
            boxShadow: "0 34px 70px rgba(0, 0, 0, 0.25)",
            opacity: Math.min(1, cardIn * 3),
            transformOrigin: "50% 100%",
            transform: `perspective(1600px) rotateX(${(1 - cardIn) * 40}deg) scale(${0.85 + 0.15 * cardIn})`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "30px 30px 0" }}>
            <svg width={46} height={46} viewBox="0 0 46 46" style={{ display: "block" }}>
              <rect x={3} y={8} width={40} height={35} rx={8} fill={primary} />
              <rect x={3} y={8} width={40} height={11} rx={5} fill={mix(primary, "#000000", 0.25)} />
              <rect x={12} y={2} width={5} height={12} rx={2.5} fill={c.ink} />
              <rect x={29} y={2} width={5} height={12} rx={2.5} fill={c.ink} />
              <rect x={10} y={25} width={8} height={7} rx={2} fill={WHITE} />
              <rect x={22} y={25} width={8} height={7} rx={2} fill={WHITE} opacity={0.6} />
            </svg>
            {[0, 1, 2].map((k) => (
              <div key={k} style={{ width: k === 0 ? 120 : 90, height: 16, borderRadius: 8, background: k === 0 ? mix(c.ink, WHITE, 0.2) : mix(c.ink, WHITE, 0.85) }} />
            ))}
          </div>
          {SLOTS.map((label, i) => {
            const p = pop(6 + i * 2);
            const lit = interpolate(frame, [sweepAt + i * 3, sweepAt + i * 3 + 5, sweepAt + i * 3 + 10], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const isPick = i === PICK;
            const fill = isPick ? picked : 0;
            const pos = slotPos(i);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: pos.x - CARD.x,
                  top: pos.y - CARD.y,
                  width: colW,
                  height: 66,
                  borderRadius: 18,
                  boxSizing: "border-box",
                  border: `3px solid ${fill > 0.5 ? primary : lit > 0.05 ? mix(video.palette.accent, WHITE, 1 - lit) : mix(c.ink, WHITE, 0.86)}`,
                  background: fill > 0 ? mix(WHITE, primary, fill) : WHITE,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "0 20px",
                  opacity: Math.min(1, p * 3),
                  transform: `translateY(${(1 - p) * 20}px) scale(${isPick ? 1 + 0.06 * Math.sin(Math.PI * Math.min(1, Math.max(0, (frame - pickAt) / 10))) : 1})`,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    border: `3px solid ${fill > 0.5 ? onPrimary : mix(c.ink, WHITE, 0.7)}`,
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: fill > 0.5 ? onPrimary : "transparent",
                  }}
                >
                  {fill > 0.5 ? (
                    <svg width={18} height={18} viewBox="0 0 24 24" style={{ display: "block", transform: `scale(${picked})` }}>
                      <path d="M4 12.5 L10 18 L20 6" stroke={primary} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </div>
                <div style={{ fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: 25, color: fill > 0.5 ? onPrimary : c.ink, whiteSpace: "nowrap" }}>{label}</div>
              </div>
            );
          })}
          {/* D'autres parents rejoignent la liste. */}
          <div style={{ position: "absolute", left: 30, bottom: 26, display: "flex", alignItems: "center" }}>
            {avatars.map((av, i) => {
              const p = pop(pickAt + 8 + i * 4, 300);
              return (
                <div key={i} style={{ marginLeft: i ? -14 : 0, borderRadius: "50%", border: "4px solid #ffffff", transform: `scale(${p})` }}>
                  <MiniAvatar {...av} size={56} />
                </div>
              );
            })}
            <div
              style={{
                marginLeft: 14,
                width: 140,
                height: 14,
                borderRadius: 7,
                background: mix(c.ink, WHITE, 0.82),
                transformOrigin: "0% 50%",
                transform: `scaleX(${pop(pickAt + 20)})`,
              }}
            />
          </div>
          <Sheen at={pickAt + 4} width={140} opacity={0.5} />
        </div>
        {m > 0 ? <Cursor x={cursorX} y={cursorY} click={click} color={video.palette.dark} /> : null}
      </Camera>
      <Camera depth={0.3} durationInFrames={durationInFrames}>
        <TextColumn width={640}>
          <TextBlock
            title={scene.title}
            subtitle={scene.subtitle}
            ink={theme.ink}
            muted={theme.muted}
            accent={theme.accent}
            marker={{ color: theme.marker, ink: theme.markerInk }}
            maxWidth={640}
            maxLines={3}
            titleSize={124}
            subtitleSize={44}
            delay={3}
            eyebrow={chapter(index, video.associationName)}
          />
        </TextColumn>
      </Camera>
      <Sfx src={video.sfx?.pop} at={pickAt} volume={0.35} />
      <Sfx src={video.sfx?.pop} at={pickAt + 8} volume={0.18} />
    </SceneBackdrop>
  );
};
