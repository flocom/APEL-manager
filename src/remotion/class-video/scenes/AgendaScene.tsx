import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { mix, readableOn, withAlpha, WHITE } from "../colors";
import { Character, makeCast } from "../components/characters";
import { GeoShapes } from "../components/decor";
import { Camera, QUINT_OUT, Sheen } from "../components/finish";
import { snap } from "../components/motion";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { fitFontSize, frenchSpaces, TextBlock } from "../components/text";
import { AGENDA_MAX_UPCOMING } from "../timeline";
import { FONT_FAMILY, illuColors, sceneTheme } from "../theme";
import type { ClassVideoEvent } from "../types";
import { chapter, MARGIN_X } from "./common";

const AREA = { x: 760, w: 1040 };
const COUNT_SECONDS = 1.1;

/** « samedi 18 octobre » → jour de la semaine, quantième, mois ; sinon null. */
export function splitDate(label: string): { weekday: string; day: string; month: string } | null {
  const m = label.trim().match(/^(\S+)\s+(\d{1,2}(?:er)?)\s+(.+)$/);
  return m ? { weekday: m[1], day: m[2], month: m[3] } : null;
}

/** Bloc date : jour de la semaine en capitales, grand quantième, mois. */
const DateBlock: React.FC<{ label: string; color: string; scale: number; align?: "left" | "center" }> = ({ label, color, scale, align = "center" }) => {
  const parts = splitDate(label);
  const common: React.CSSProperties = { fontFamily: FONT_FAMILY, color, textAlign: align, lineHeight: 1 };
  if (!parts) {
    return <div style={{ ...common, fontWeight: 800, fontSize: fitFontSize(label, 180 * scale, 3, 34 * scale, 16, 0.58) }}>{label}</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align === "center" ? "center" : "flex-start", gap: 6 * scale }}>
      <div style={{ ...common, fontWeight: 700, fontSize: 22 * scale, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.85 }}>{parts.weekday}</div>
      <div style={{ ...common, fontWeight: 900, fontSize: 96 * scale, letterSpacing: "-0.04em" }}>{parts.day}</div>
      <div style={{ ...common, fontWeight: 700, fontSize: 26 * scale }}>{parts.month}</div>
    </div>
  );
};

/**
 * Les rendez-vous de l'année : une page de calendrier géante qui compte
 * jusqu'au nombre total (ses pastilles s'allument au rythme du compteur),
 * le prochain rendez-vous en carte vedette avec une étiquette qui pulse,
 * et les suivants qui défilent le long d'une frise.
 */
export const AgendaScene: React.FC<SceneProps> = ({ scene, video, durationInFrames, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "agenda");
  const c = illuColors(video.palette);
  const cast = makeCast(c, theme.bg);
  const { total, next } = video.agenda;
  const upcoming = video.agenda.upcoming.slice(0, AGENDA_MAX_UPCOMING);
  const hasRow = upcoming.length > 0;
  const topY = hasRow ? 110 : 300;

  // Page de calendrier et compteur.
  const pageIn = Math.max(0, snap(frame, fps, 2, 240, 18));
  const countStart = 8;
  const countEnd = countStart + Math.round(COUNT_SECONDS * fps);
  const count = Math.round(
    interpolate(frame, [countStart, countEnd], [0, Math.max(0, total)], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }),
  );
  const bump = 1 + 0.12 * Math.sin(Math.PI * Math.min(1, Math.max(0, (frame - countEnd) / 9)));
  const pageW = 330;
  const pageX = next ? AREA.x : AREA.x + (AREA.w - pageW) / 2;
  const dots = Math.min(12, Math.max(0, total));

  // Carte vedette.
  const cardIn = Math.max(0, snap(frame, fps, 12, 220, 19));
  const pulse = (frame % 30) / 30;

  // Frise des rendez-vous suivants.
  const lineP = interpolate(frame, [24, 44], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: QUINT_OUT });
  const gap = 20;
  const cardW = (AREA.w - gap * (AGENDA_MAX_UPCOMING - 1)) / AGENDA_MAX_UPCOMING;
  const rowW = upcoming.length * cardW + (upcoming.length - 1) * gap;
  const rowX = AREA.x + (AREA.w - rowW) / 2;
  const accentOnWhite = c.a;

  return (
    <SceneBackdrop theme={theme} floorY={960} blob={{ x: 1300, y: 480, r: 470 }} durationInFrames={durationInFrames}>
      <Camera depth={0.6} durationInFrames={durationInFrames}>
        <GeoShapes
          shapes={[
            { kind: "disc", x: 1870, y: 1010, r: 120, color: theme.shapes[0], at: 0 },
            { kind: "ring", x: 700, y: 120, r: 40, width: 6, color: theme.shapes[0], at: 4 },
            { kind: "dots", x: 90, y: 900, cols: 4, rows: 2, gap: 30, r: 5, color: withAlpha(WHITE, 0.8), at: 6 },
          ]}
        />
      </Camera>
      <Camera depth={0.3} durationInFrames={durationInFrames}>
        <div style={{ position: "absolute", left: MARGIN_X, top: 130, width: 580 }}>
          <TextBlock
            title={scene.title}
            subtitle={scene.subtitle}
            ink={theme.ink}
            muted={theme.muted}
            accent={theme.accent}
            marker={{ color: theme.marker, ink: theme.markerInk }}
            maxWidth={580}
            maxLines={3}
            titleSize={110}
            subtitleSize={42}
            delay={3}
            eyebrow={chapter(index, video.associationName)}
          />
        </div>
      </Camera>
      <Camera depth={1} durationInFrames={durationInFrames}>
        <Character look={cast.claire} c={c} x={350} y={1015} height={420} gesture="present" gestureAt={14} gaze={0.6} seed={70} appear={4} shadow={theme.shadow} groove={3} />

        {/* Page de calendrier géante */}
        <div
          style={{
            position: "absolute",
            left: pageX,
            top: topY,
            width: pageW,
            height: 380,
            borderRadius: 30,
            background: WHITE,
            overflow: "hidden",
            boxShadow: "0 30px 60px rgba(0, 0, 0, 0.22)",
            transformOrigin: "50% 0%",
            transform: `perspective(1400px) rotateX(${(1 - pageIn) * -50}deg) scale(${0.8 + 0.2 * pageIn})`,
            opacity: Math.min(1, pageIn * 3),
          }}
        >
          <div style={{ height: 70, background: accentOnWhite, display: "flex", alignItems: "center", justifyContent: "center", gap: 120 }}>
            {[0, 1].map((k) => (
              <div key={k} style={{ width: 22, height: 22, borderRadius: 11, background: mix(accentOnWhite, "#000000", 0.35) }} />
            ))}
          </div>
          <div
            style={{
              marginTop: 18,
              textAlign: "center",
              fontFamily: FONT_FAMILY,
              fontWeight: 900,
              fontSize: String(count).length > 2 ? 150 : 190,
              lineHeight: 1,
              letterSpacing: "-0.05em",
              color: accentOnWhite,
              transform: `scale(${bump})`,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {count}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, padding: "18px 40px 0" }}>
            {Array.from({ length: dots }, (_, i) => {
              const on = count >= Math.ceil(((i + 1) / dots) * total);
              return <div key={i} style={{ width: 22, height: 22, borderRadius: 11, background: on ? video.palette.accent : mix(c.ink, WHITE, 0.88), transform: `scale(${on ? 1 : 0.8})` }} />;
            })}
          </div>
          <Sheen at={countEnd + 2} width={120} opacity={0.6} />
        </div>

        {/* Prochain rendez-vous */}
        {next ? (
          <FeaturedCard event={next} x={AREA.x + pageW + 30} y={topY} w={AREA.w - pageW - 30} h={380} p={cardIn} pulse={pulse} c={c} accent={video.palette.accent} dark={video.palette.dark} sheenAt={30} />
        ) : null}

        {/* Frise des suivants */}
        {hasRow ? (
          <>
            <div style={{ position: "absolute", left: rowX, top: 560, width: rowW, height: 4, borderRadius: 2, background: withAlpha(WHITE, 0.55), transformOrigin: "0% 50%", transform: `scaleX(${lineP})` }} />
            {upcoming.map((event, i) => {
              const d = 30 + i * 6;
              const p = Math.max(0, snap(frame, fps, d, 240, 18));
              const x = rowX + i * (cardW + gap);
              return (
                <React.Fragment key={i}>
                  <div
                    style={{
                      position: "absolute",
                      left: x + cardW / 2 - 12,
                      top: 550,
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      background: WHITE,
                      border: `6px solid ${video.palette.accent}`,
                      boxSizing: "border-box",
                      transform: `scale(${p})`,
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: x,
                      top: 600,
                      width: cardW,
                      height: 270,
                      borderRadius: 24,
                      background: WHITE,
                      boxShadow: "0 20px 40px rgba(0, 0, 0, 0.18)",
                      padding: "22px 20px",
                      boxSizing: "border-box",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 14,
                      overflow: "hidden",
                      opacity: Math.min(1, p * 3),
                      transformOrigin: "50% 0%",
                      transform: `perspective(1200px) rotateX(${(1 - p) * 60}deg) translateY(${(1 - p) * 30}px)`,
                    }}
                  >
                    <DateBlock label={event.dateLabel} color={i % 2 ? c.b : c.a} scale={0.72} />
                    <div
                      style={{
                        fontFamily: FONT_FAMILY,
                        fontWeight: 700,
                        fontSize: fitFontSize(frenchSpaces(event.title), cardW - 40, 3, 29, 18, 0.56),
                        lineHeight: 1.18,
                        color: c.ink,
                        textAlign: "center",
                      }}
                    >
                      {frenchSpaces(event.title)}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </>
        ) : null}
      </Camera>
      <Sfx src={video.sfx?.pop} at={2} volume={0.25} />
      <Sfx src={video.sfx?.sparkle} at={countEnd} volume={0.3} />
      {next ? <Sfx src={video.sfx?.pop} at={12} volume={0.28} /> : null}
      {hasRow ? <Sfx src={video.sfx?.pop} at={30} volume={0.22} /> : null}
    </SceneBackdrop>
  );
};

/** Carte vedette du prochain rendez-vous : bloc date coloré, étiquette pulsée, titre. */
const FeaturedCard: React.FC<{
  event: ClassVideoEvent;
  x: number;
  y: number;
  w: number;
  h: number;
  p: number;
  pulse: number;
  c: ReturnType<typeof illuColors>;
  accent: string;
  dark: string;
  sheenAt: number;
}> = ({ event, x, y, w, h, p, pulse, c, accent, dark, sheenAt }) => {
  const title = frenchSpaces(event.title);
  const blockW = 230;
  const textW = w - blockW - 70;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: 30,
        background: WHITE,
        overflow: "hidden",
        display: "flex",
        boxShadow: "0 34px 70px rgba(0, 0, 0, 0.25)",
        opacity: Math.min(1, p * 3),
        transformOrigin: "0% 50%",
        transform: `perspective(1600px) rotateY(${(1 - p) * 40}deg) scale(${0.85 + 0.15 * p})`,
      }}
    >
      <div style={{ flex: `0 0 ${blockW}px`, background: `linear-gradient(160deg, ${mix(c.a, WHITE, 0.12)}, ${mix(c.a, "#000000", 0.18)})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <DateBlock label={event.dateLabel} color={WHITE} scale={1} />
      </div>
      <div style={{ flex: 1, padding: "40px 34px", display: "flex", flexDirection: "column", gap: 22, justifyContent: "center" }}>
        <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 12, padding: "10px 20px 10px 16px", borderRadius: 999, background: accent }}>
          <div style={{ position: "relative", width: 14, height: 14 }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: 7, background: readableOn(accent, dark) }} />
            <div
              style={{
                position: "absolute",
                left: -9 * pulse,
                top: -9 * pulse,
                width: 14 + 18 * pulse,
                height: 14 + 18 * pulse,
                borderRadius: "50%",
                border: `3px solid ${withAlpha(readableOn(accent, dark), 1 - pulse)}`,
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ fontFamily: FONT_FAMILY, fontWeight: 800, fontSize: 22, letterSpacing: "0.08em", textTransform: "uppercase", color: readableOn(accent, dark), whiteSpace: "nowrap" }}>
            {/* Libellé fixe de l'étiquette. */}
            Prochain rendez-vous
          </div>
        </div>
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: 800, fontSize: fitFontSize(title, textW, 3, 50, 26, 0.58), lineHeight: 1.1, letterSpacing: "-0.02em", color: c.ink }}>{title}</div>
      </div>
      <Sheen at={sheenAt} width={140} opacity={0.5} />
    </div>
  );
};
