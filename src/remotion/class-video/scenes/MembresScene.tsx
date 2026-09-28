import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { lighten, readableOn, tooClose, WHITE } from "../colors";
import { InitialsAvatar, Polaroid, SafeImg } from "../components/media";
import { bob, pop } from "../components/motion";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { fitFontSize, frenchSpaces, KineticTitle, Pill } from "../components/text";
import { MEMBRES_MAX } from "../timeline";
import { FONT_FAMILY, sceneTheme } from "../theme";
import type { ClassVideoMember } from "../types";

type Slot = { member: ClassVideoMember | null; extra: number };

/**
 * Membres : jusqu'à 4 en polaroïds, au-delà en bulles rondes sur deux rangées.
 * Au-delà de 12, la dernière bulle affiche « +N ».
 */
export const MembresScene: React.FC<SceneProps> = ({ scene, video, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "membres");
  const all = video.members;
  const slots: Slot[] =
    all.length > MEMBRES_MAX
      ? [...all.slice(0, MEMBRES_MAX - 1).map((m) => ({ member: m, extra: 0 })), { member: null, extra: all.length - (MEMBRES_MAX - 1) }]
      : all.map((m) => ({ member: m, extra: 0 }));
  const avatarColors = [video.palette.secondary, video.palette.accent, video.palette.primary].filter(
    (c) => !tooClose(c, WHITE),
  );
  const rolePillBg = theme.pop;
  const rolePillInk = readableOn(rolePillBg, video.palette.dark);
  const stagger = Math.max(3, Math.min(7, Math.round(40 / Math.max(1, slots.length))));
  const startOf = (i: number) => 16 + i * stagger;
  const usePolaroids = slots.length <= 4;

  const avatarFor = (slot: Slot, i: number, size: number) =>
    slot.member ? (
      slot.member.url ? (
        <SafeImg src={slot.member.url} fallback={lighten(video.palette.primary, 0.5)} />
      ) : (
        <InitialsAvatar
          name={slot.member.name}
          color={avatarColors[i % Math.max(1, avatarColors.length)] ?? video.palette.secondary}
          dark={video.palette.dark}
          size={size}
        />
      )
    ) : (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: theme.pop,
          color: readableOn(theme.pop, video.palette.dark),
          fontFamily: FONT_FAMILY,
          fontWeight: 900,
          fontSize: size * 0.34,
        }}
      >
        +{slot.extra}
      </div>
    );

  const rolePill = (role: string, size: number, delay: number) =>
    role.trim() ? (
      <Pill text={role} bg={rolePillBg} color={rolePillInk} delay={delay} fontSize={size} maxWidth={size * 11} />
    ) : null;

  let content: React.ReactNode;
  if (usePolaroids) {
    const w = slots.length <= 2 ? 440 : slots.length === 3 ? 400 : 360;
    const h = w * 1.2;
    content = (
      <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "flex-start", gap: 70 }}>
        {slots.map((slot, i) => {
          const p = pop(frame, fps, startOf(i), 140, 11);
          const rot = [-4, 3, -2, 4][i % 4];
          return (
            <div
              key={i}
              style={{
                width: w,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 22,
                transform: `translateY(${(1 - p) * 300 + bob(frame, fps, 7, 3, i * 1.3)}px) rotate(${rot * p + (1 - p) * rot * 4}deg) scale(${0.5 + 0.5 * p})`,
                opacity: Math.min(1, p * 2),
              }}
            >
              <div style={{ position: "relative", width: w, height: h }}>
                <Polaroid
                  width={w}
                  height={h}
                  tint={video.palette.secondary}
                  ink={video.palette.dark}
                  caption={slot.member ? frenchSpaces(slot.member.name) : ""}
                  captionSize={fitFontSize(slot.member?.name ?? "", w * 0.86, 1, 48, 28)}
                >
                  {avatarFor(slot, i, w)}
                </Polaroid>
              </div>
              {slot.member ? rolePill(slot.member.role, 36, startOf(i) + 8) : null}
            </div>
          );
        })}
      </div>
    );
  } else {
    const perRow = Math.ceil(slots.length / 2);
    const bubble = perRow <= 3 ? 250 : perRow === 4 ? 240 : 225;
    const colW = bubble + (perRow <= 3 ? 110 : perRow === 4 ? 70 : 44);
    const rows = [slots.slice(0, perRow), slots.slice(perRow)];
    content = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: perRow <= 4 ? 30 : 36 }}>
        {rows.map((row, r) => (
          <div key={r} style={{ display: "flex", flexDirection: "row", justifyContent: "center", gap: 26 }}>
            {row.map((slot, j) => {
              const i = r * perRow + j;
              const p = pop(frame, fps, startOf(i), 170, 10);
              const name = slot.member?.name ?? "";
              return (
                <div
                  key={i}
                  style={{
                    width: colW,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                    transform: `translateY(${bob(frame, fps, 6, 2.6, i * 0.9)}px) scale(${p})`,
                    opacity: Math.min(1, p * 2),
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      width: bubble,
                      height: bubble,
                      borderRadius: "50%",
                      overflow: "hidden",
                      border: "10px solid #ffffff",
                      boxSizing: "border-box",
                      boxShadow: "0 14px 28px rgba(0, 0, 0, 0.25)",
                      background: "#ffffff",
                    }}
                  >
                    {avatarFor(slot, i, bubble)}
                  </div>
                  {name ? (
                    <div
                      style={{
                        fontFamily: FONT_FAMILY,
                        fontWeight: 900,
                        fontSize: fitFontSize(name, colW, 1, bubble * 0.17, 24, 0.6),
                        color: theme.ink,
                        textShadow: `0 3px 0 ${theme.inkShadow}`,
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {name}
                    </div>
                  ) : null}
                  {slot.member?.role.trim() ? (
                    <div
                      style={{
                        padding: "6px 18px",
                        borderRadius: 999,
                        background: rolePillBg,
                        color: rolePillInk,
                        fontFamily: FONT_FAMILY,
                        fontWeight: 800,
                        fontSize: fitFontSize(slot.member.role, colW - 36, 1, bubble * 0.13, 20, 0.55),
                        whiteSpace: "nowrap",
                      }}
                    >
                      {slot.member.role}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  return (
    <SceneBackdrop theme={theme} seed={601 + index} shapeCount={10}>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 50 }}>
        <KineticTitle text={scene.title} color={theme.ink} shadow={theme.inkShadow} maxWidth={1600} maxSize={100} maxLines={1} delay={2} />
        <div style={{ height: 16 }} />
        <Pill text={scene.subtitle} bg={theme.pill} color={theme.pillInk} delay={10} fontSize={40} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingTop: usePolaroids ? 190 : 250 }}>
        {content}
      </AbsoluteFill>
      {slots.slice(0, 6).map((_, i) => (
        <Sfx key={i} src={video.sfx?.pop} at={startOf(i) + 1} volume={0.32} />
      ))}
    </SceneBackdrop>
  );
};
