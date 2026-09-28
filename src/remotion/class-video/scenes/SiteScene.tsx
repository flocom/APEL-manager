import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { Cursor, BrowserMockup, PhoneMockup } from "../components/devices";
import { GeoShapes } from "../components/decor";
import { Camera, EXPO_IN_OUT, Sheen } from "../components/finish";
import { snap } from "../components/motion";
import { SceneBackdrop, Sfx, type SceneProps } from "../components/scene";
import { TextBlock } from "../components/text";
import { illuColors, sceneTheme } from "../theme";
import { chapter, TextColumn } from "./common";

const BROWSER = { x: 770, y: 150, w: 980, h: 620 };
const PHONE = { x: 1625, y: 460, w: 270, h: 560 };
/** Images par caractère tapé dans la barre d'adresse. */
const TYPE_RATE = 1.6;

/**
 * « Tout est sur le site » : une fenêtre de navigateur où l'adresse se tape
 * lettre à lettre, le site se construit (en-tête avec le logo, bandeau,
 * cartes d'événements), le pointeur clique sur « Rejoindre », et le
 * téléphone montre la même chose en version mobile.
 */
export const SiteScene: React.FC<SceneProps> = ({ scene, video, durationInFrames, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = sceneTheme(video.palette, "site");
  const c = illuColors(video.palette);
  const url = video.siteLabel.trim();

  const winIn = Math.max(0, snap(frame, fps, 0, 200, 19));
  const typeStart = 10;
  const typed = url ? Math.max(0, Math.min(url.length, Math.floor((frame - typeStart) / TYPE_RATE))) : 0;
  const typeEnd = url ? typeStart + Math.ceil(url.length * TYPE_RATE) : 8;
  const caret = url.length > 0 && (typed < url.length || Math.floor(frame / 8) % 2 === 0);
  const pop = (at: number) => Math.max(0, Math.min(1, snap(frame, fps, at, 240, 20)));
  const header = pop(typeEnd + 2);
  const hero = pop(typeEnd + 6);
  const cards = [0, 1, 2].map((i) => pop(typeEnd + 11 + i * 4));

  // Pointeur : arrive du coin, se pose sur « Rejoindre », clique.
  const target = { x: BROWSER.x + BROWSER.w - 110, y: BROWSER.y + 62 + 34 };
  const moveAt = typeEnd + 14;
  const clickAt = moveAt + 18;
  const m = interpolate(frame, [moveAt, moveAt + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO_IN_OUT });
  const cursorX = interpolate(m, [0, 1], [BROWSER.x + BROWSER.w + 160, target.x]);
  const cursorY = interpolate(m, [0, 1], [BROWSER.y + BROWSER.h + 120, target.y]);
  const click = interpolate(frame, [clickAt, clickAt + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const press = Math.sin(Math.PI * Math.min(1, Math.max(0, (frame - clickAt) / 8)));

  const phoneIn = interpolate(frame, [typeEnd + 8, typeEnd + 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EXPO_IN_OUT });
  const phoneCards = [0, 1, 2].map((i) => pop(typeEnd + 20 + i * 4));

  return (
    <SceneBackdrop theme={theme} blob={{ x: 1260, y: 470, r: 470 }} durationInFrames={durationInFrames}>
      <Camera depth={0.6} durationInFrames={durationInFrames}>
        <GeoShapes
          shapes={[
            { kind: "disc", x: 1850, y: 120, r: 110, color: theme.shapes[0], at: 0 },
            { kind: "dots", x: 700, y: 860, cols: 4, rows: 2, gap: 30, r: 5, color: theme.shapes[2] ?? theme.shapes[0], at: 5 },
            { kind: "ring", x: 720, y: 170, r: 42, width: 6, color: theme.shapes[1] ?? theme.shapes[0], at: 8 },
          ]}
        />
      </Camera>
      <Camera depth={1} durationInFrames={durationInFrames}>
        <div
          style={{
            position: "absolute",
            left: BROWSER.x,
            top: BROWSER.y,
            width: BROWSER.w,
            height: BROWSER.h,
            transformOrigin: "30% 60%",
            transform: `perspective(2000px) rotateY(${(1 - winIn) * -28}deg) scale(${0.82 + 0.18 * winIn})`,
            opacity: Math.min(1, winIn * 3),
          }}
        >
          <BrowserMockup width={BROWSER.w} height={BROWSER.h} c={c} logoUrl={video.logoUrl} buttonLabel="Rejoindre" state={{ url: url.slice(0, typed), caret, header, hero, cards, press }} />
          <div style={{ position: "absolute", inset: 0, borderRadius: 22, overflow: "hidden" }}>
            <Sheen at={typeEnd + 20} width={180} opacity={0.35} />
          </div>
        </div>
        <div style={{ position: "absolute", left: PHONE.x, top: PHONE.y + (1 - phoneIn) * 560, transform: `rotate(${(1 - phoneIn) * 8 + 4}deg)` }}>
          <PhoneMockup width={PHONE.w} height={PHONE.h} c={c} logoUrl={video.logoUrl} cards={phoneCards} header={pop(typeEnd + 16)} />
        </div>
        {m > 0 ? <Cursor x={cursorX} y={cursorY} click={click} color={video.palette.dark} /> : null}
      </Camera>
      <Camera depth={0.3} durationInFrames={durationInFrames}>
        <TextColumn width={580}>
          <TextBlock
            title={scene.title}
            subtitle={scene.subtitle}
            ink={theme.ink}
            muted={theme.muted}
            accent={theme.accent}
            marker={{ color: theme.marker, ink: theme.markerInk }}
            maxWidth={580}
            maxLines={3}
            titleSize={112}
            subtitleSize={42}
            delay={3}
            eyebrow={chapter(index, video.associationName)}
          />
        </TextColumn>
      </Camera>
      <Sfx src={video.sfx?.pop} at={clickAt} volume={0.32} />
      <Sfx src={video.sfx?.pop} at={typeEnd + 11} volume={0.18} />
    </SceneBackdrop>
  );
};
