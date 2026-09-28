import React from "react";
import { useCurrentFrame } from "remotion";

import { contrastRatio, mix, WHITE } from "../colors";
import { initials, SafeImg } from "../components/media";
import { enter } from "../components/motion";
import { SceneBackdrop, type SceneProps } from "../components/scene";
import { BODY_CHAR, fitFontSize, TextBlock } from "../components/text";
import { MEMBRES_MAX } from "../timeline";
import { FONT_FAMILY, sceneTheme } from "../theme";
import type { ClassVideoMember } from "../types";
import { MARGIN_X, TextColumn } from "./common";

type Slot = { member: ClassVideoMember | null; extra: number };

/**
 * L'équipe : portraits ronds (photo ou initiales sur une teinte douce),
 * prénom et rôle. Jusqu'à trois à côté du titre, au-delà en grille sous le
 * titre ; après 12, la dernière pastille affiche « +N ».
 */
export const MembresScene: React.FC<SceneProps> = ({ scene, video }) => {
  const frame = useCurrentFrame();
  const theme = sceneTheme(video.palette, "membres");
  const all = video.members;
  const slots: Slot[] =
    all.length > MEMBRES_MAX
      ? [...all.slice(0, MEMBRES_MAX - 1).map((m) => ({ member: m, extra: 0 })), { member: null, extra: all.length - (MEMBRES_MAX - 1) }]
      : all.map((m) => ({ member: m, extra: 0 }));
  const tints = [video.palette.primary, video.palette.secondary, video.palette.accent].map((col) =>
    contrastRatio(col, WHITE) >= 3 ? col : mix(col, video.palette.dark, 0.45),
  );
  const side = slots.length <= 3;
  const perRow = side ? slots.length : slots.length <= 4 ? slots.length : slots.length <= 8 ? Math.ceil(slots.length / 2) : 6;
  const avatar = side ? (slots.length <= 2 ? 270 : 230) : perRow <= 4 ? (slots.length <= 4 ? 230 : 180) : 150;
  const colW = side ? avatar + 90 : Math.min(360, 1640 / perRow);
  const startOf = (i: number) => 18 + i * Math.max(3, Math.min(8, Math.round(36 / Math.max(1, slots.length))));

  const portrait = (slot: Slot, i: number) => {
    const p = enter(frame, startOf(i), 22);
    const color = tints[i % tints.length];
    const name = slot.member?.name.trim() ?? "";
    const role = slot.member?.role.trim() ?? "";
    const nameSize = fitFontSize(name, colW - 10, 1, avatar * 0.17 + 4, 22, 0.6);
    return (
      <div key={i} style={{ width: colW, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
        <div
          style={{
            position: "relative",
            width: avatar,
            height: avatar,
            borderRadius: "50%",
            overflow: "hidden",
            border: `${Math.round(avatar * 0.035)}px solid #ffffff`,
            boxSizing: "border-box",
            boxShadow: "0 16px 36px rgba(15, 25, 40, 0.14)",
            background: mix(color, WHITE, 0.84),
            marginBottom: 14,
          }}
        >
          {slot.member?.url ? (
            <SafeImg src={slot.member.url} fallback={mix(color, WHITE, 0.7)} />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: FONT_FAMILY,
                fontWeight: 700,
                fontSize: avatar * (slot.member ? 0.34 : 0.28),
                letterSpacing: "0.01em",
                color,
              }}
            >
              {slot.member ? initials(slot.member.name) : `+${slot.extra}`}
            </div>
          )}
        </div>
        {name ? (
          <div style={{ fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: nameSize, color: theme.ink, whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{name}</div>
        ) : null}
        {role ? (
          <div
            style={{
              fontFamily: FONT_FAMILY,
              fontWeight: 500,
              fontSize: fitFontSize(role, colW - 10, 1, Math.max(24, avatar * 0.12 + 6), 18, BODY_CHAR),
              color: theme.muted,
              whiteSpace: "nowrap",
            }}
          >
            {role}
          </div>
        ) : null}
      </div>
    );
  };

  if (side) {
    return (
      <SceneBackdrop theme={theme} blob={{ x: 1330, y: 540, r: 420 }}>
        <TextColumn width={640}>
          <TextBlock title={scene.title} subtitle={scene.subtitle} ink={theme.ink} muted={theme.muted} accent={theme.accent} maxWidth={640} maxLines={3} delay={4} />
        </TextColumn>
        <div style={{ position: "absolute", left: 860, right: MARGIN_X - 40, top: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
          {slots.map(portrait)}
        </div>
      </SceneBackdrop>
    );
  }

  const rows = [slots.slice(0, perRow), slots.slice(perRow)].filter((r) => r.length > 0);
  return (
    <SceneBackdrop theme={theme}>
      <div style={{ position: "absolute", left: MARGIN_X, top: 100, width: 1640 }}>
        <TextBlock title={scene.title} subtitle={scene.subtitle} ink={theme.ink} muted={theme.muted} accent={theme.accent} maxWidth={1400} maxLines={1} titleSize={96} subtitleSize={42} gap={22} delay={4} />
      </div>
      <div style={{ position: "absolute", left: MARGIN_X, right: MARGIN_X, top: 400, bottom: 50, display: "flex", flexDirection: "column", justifyContent: "center", gap: rows.length > 1 ? 34 : 0 }}>
        {rows.map((row, r) => (
          <div key={r} style={{ display: "flex", justifyContent: "center" }}>
            {row.map((slot, j) => portrait(slot, r * perRow + j))}
          </div>
        ))}
      </div>
    </SceneBackdrop>
  );
};
