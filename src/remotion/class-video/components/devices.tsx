import React from "react";

import { darken, mix, readableOn, withAlpha, WHITE } from "../colors";
import type { IlluColors } from "../theme";
import { FONT_FAMILY } from "../theme";
import { SafeImg } from "./media";

/**
 * Maquettes d'écrans (navigateur, téléphone) et pointeur : une version
 * abstraite du site de l'association — en-tête avec le logo, bouton
 * « Rejoindre », cartes d'événements — que la scène « site » anime en
 * passant des taux de progression (0 → 1). Purement présentationnel.
 */

/** Barre de texte abstraite (ligne de contenu). */
const Bar: React.FC<{ w: number | string; h?: number; color: string; style?: React.CSSProperties }> = ({ w, h = 12, color, style }) => (
  <div style={{ width: w, height: h, borderRadius: h / 2, background: color, ...style }} />
);

/** Carte d'événement du site : bandeau illustré, pastille de date, lignes de texte. */
const EventCard: React.FC<{ c: IlluColors; tone: string; p: number; w: number; h: number; compact?: boolean }> = ({ c, tone, p, w, h, compact }) => (
  <div
    style={{
      width: w,
      height: h,
      borderRadius: compact ? 14 : 16,
      background: WHITE,
      boxShadow: "0 10px 24px rgba(15, 25, 40, 0.10)",
      overflow: "hidden",
      opacity: Math.min(1, p * 2),
      transform: `translateY(${(1 - p) * 30}px) scale(${0.9 + 0.1 * p})`,
      display: "flex",
      flexDirection: compact ? "row" : "column",
      flexShrink: 0,
    }}
  >
    <div style={{ position: "relative", flex: compact ? `0 0 ${h}px` : `0 0 ${h * 0.46}px`, background: mix(tone, WHITE, 0.55) }}>
      <div style={{ position: "absolute", left: "18%", bottom: "12%", width: "34%", height: "46%", borderRadius: "50%", background: mix(tone, WHITE, 0.25) }} />
      <div style={{ position: "absolute", right: "14%", top: "18%", width: "22%", height: "30%", borderRadius: "50%", background: WHITE, opacity: 0.7 }} />
      {compact ? null : (
        <div style={{ position: "absolute", left: 10, top: 10, padding: "4px 10px", borderRadius: 8, background: c.c, fontFamily: FONT_FAMILY, fontWeight: 800, fontSize: 13, color: readableOn(c.c, c.ink) }}>
          ●
        </div>
      )}
    </div>
    <div style={{ flex: 1, padding: compact ? "12px 12px" : "14px 14px", display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
      <Bar w="80%" h={compact ? 10 : 12} color={mix(c.ink, WHITE, 0.75)} />
      <Bar w="55%" h={compact ? 8 : 10} color={mix(c.ink, WHITE, 0.87)} />
      {compact ? null : <Bar w="35%" h={10} color={mix(tone, WHITE, 0.3)} style={{ marginTop: 4 }} />}
    </div>
  </div>
);

/** Petit logo dans l'en-tête du site (image, ou pastille de couleur sans logo). */
const SiteLogo: React.FC<{ logoUrl: string | null; c: IlluColors; h: number }> = ({ logoUrl, c, h }) => (
  <div style={{ width: h * 2.2, height: h, borderRadius: 8, overflow: "hidden", background: logoUrl ? WHITE : c.a, display: "flex", alignItems: "center", justifyContent: "center" }}>
    {logoUrl ? <SafeImg src={logoUrl} fallback={c.aLight} fit="contain" /> : <div style={{ width: h * 0.5, height: h * 0.5, borderRadius: "50%", background: WHITE }} />}
  </div>
);

/** Icône de cadenas (barre d'adresse). */
const Lock: React.FC<{ color: string }> = ({ color }) => (
  <svg width={16} height={20} viewBox="0 0 16 20" style={{ display: "block", flexShrink: 0 }}>
    <rect x={1} y={8} width={14} height={11} rx={3} fill={color} />
    <path d="M4 8 V6 a4 4 0 0 1 8 0 V8" stroke={color} strokeWidth={2.4} fill="none" />
  </svg>
);

export type BrowserState = {
  /** Texte déjà tapé dans la barre d'adresse. */
  url: string;
  /** Curseur de saisie visible (clignote). */
  caret: boolean;
  /** Apparition de l'en-tête, du bandeau, des cartes (0 → 1). */
  header: number;
  hero: number;
  cards: number[];
  /** Appui sur le bouton « Rejoindre » (0 → 1 → 0). */
  press: number;
};

/** Fenêtre de navigateur affichant une version stylisée du site. 1000 × 640 conseillé. */
export const BrowserMockup: React.FC<{ width: number; height: number; c: IlluColors; logoUrl: string | null; state: BrowserState; buttonLabel: string }> = ({
  width,
  height,
  c,
  logoUrl,
  state,
  buttonLabel,
}) => {
  const chrome = 62;
  const ink = c.ink;
  const tones = [c.a, c.b, c.c];
  const btn = c.a;
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        borderRadius: 22,
        background: WHITE,
        overflow: "hidden",
        boxShadow: "0 40px 80px rgba(10, 20, 35, 0.22), 0 6px 18px rgba(10, 20, 35, 0.10)",
      }}
    >
      {/* Barre du navigateur */}
      <div style={{ height: chrome, background: "#eef1f5", display: "flex", alignItems: "center", padding: "0 22px", gap: 10 }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((col) => (
          <div key={col} style={{ width: 14, height: 14, borderRadius: 7, background: col }} />
        ))}
        <div
          style={{
            marginLeft: 26,
            flex: 1,
            maxWidth: width * 0.56,
            height: 44,
            borderRadius: 22,
            background: WHITE,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 18px",
            border: "1px solid rgba(15, 25, 40, 0.08)",
            boxSizing: "border-box",
          }}
        >
          <Lock color={mix(ink, WHITE, 0.45)} />
          <div style={{ fontFamily: FONT_FAMILY, fontWeight: 700, fontSize: 25, color: ink, whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{state.url}</div>
          <div style={{ width: 2.5, height: 24, background: c.a, opacity: state.caret ? 1 : 0, marginLeft: -6 }} />
        </div>
        <div style={{ flex: 1 }} />
        <Bar w={70} h={10} color="#d6dbe2" />
      </div>
      {/* En-tête du site */}
      <div style={{ height: 78, display: "flex", alignItems: "center", padding: "0 30px", gap: 26, opacity: state.header, transform: `translateY(${(1 - state.header) * -12}px)` }}>
        <SiteLogo logoUrl={logoUrl} c={c} h={46} />
        <div style={{ display: "flex", gap: 18, flex: 1 }}>
          {[70, 88, 62].map((w) => (
            <Bar key={w} w={w} h={11} color={mix(ink, WHITE, 0.8)} />
          ))}
        </div>
        <div
          style={{
            padding: "12px 26px",
            borderRadius: 14,
            background: state.press > 0 ? darken(btn, 0.18 * state.press) : btn,
            color: readableOn(btn, ink),
            fontFamily: FONT_FAMILY,
            fontWeight: 800,
            fontSize: 20,
            transform: `scale(${1 - 0.07 * state.press})`,
            boxShadow: `0 ${8 - 6 * state.press}px 18px ${withAlpha(btn, 0.35)}`,
          }}
        >
          {buttonLabel}
        </div>
      </div>
      {/* Bandeau d'accueil */}
      <div
        style={{
          margin: "0 30px",
          height: height * 0.3,
          borderRadius: 18,
          background: `linear-gradient(120deg, ${c.a} 0%, ${mix(c.a, c.b, 0.35)} 100%)`,
          position: "relative",
          overflow: "hidden",
          opacity: state.hero,
          transform: `scale(${0.96 + 0.04 * state.hero})`,
        }}
      >
        <div style={{ position: "absolute", right: -40, top: -50, width: 260, height: 260, borderRadius: "50%", background: withAlpha(WHITE, 0.14) }} />
        <div style={{ position: "absolute", right: 90, bottom: -70, width: 180, height: 180, borderRadius: "50%", background: withAlpha(c.c, 0.85) }} />
        <div style={{ position: "absolute", left: 36, top: 42, display: "flex", flexDirection: "column", gap: 14 }}>
          <Bar w={340} h={26} color={WHITE} />
          <Bar w={240} h={26} color={withAlpha(WHITE, 0.85)} />
          <Bar w={180} h={14} color={withAlpha(WHITE, 0.6)} style={{ marginTop: 10 }} />
        </div>
      </div>
      {/* Cartes d'événements */}
      <div style={{ display: "flex", gap: 22, padding: "26px 30px 0" }}>
        {state.cards.map((p, i) => (
          <EventCard key={i} c={c} tone={tones[i % tones.length]} p={p} w={(width - 60 - 22 * (state.cards.length - 1)) / state.cards.length} h={height - chrome - 78 - height * 0.3 - 52} />
        ))}
      </div>
    </div>
  );
};

/** Téléphone : même site en version mobile (cartes empilées). 300 × 610 conseillé. */
export const PhoneMockup: React.FC<{ width: number; height: number; c: IlluColors; logoUrl: string | null; cards: number[]; header: number }> = ({ width, height, c, logoUrl, cards, header }) => {
  const bezel = 14;
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        borderRadius: 52,
        background: "#1b2230",
        padding: bezel,
        boxSizing: "border-box",
        boxShadow: "0 40px 70px rgba(10, 20, 35, 0.35)",
      }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 40, background: "#f6f8fb", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: "50%", top: 12, width: 90, height: 24, marginLeft: -45, borderRadius: 12, background: "#1b2230" }} />
        <div style={{ padding: "54px 16px 0", display: "flex", flexDirection: "column", gap: 14, opacity: header }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SiteLogo logoUrl={logoUrl} c={c} h={34} />
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {[0, 1, 2].map((k) => (
                <Bar key={k} w={24} h={4} color={c.ink} />
              ))}
            </div>
          </div>
          <div style={{ height: 120, borderRadius: 16, background: `linear-gradient(120deg, ${c.a}, ${mix(c.a, c.b, 0.35)})`, padding: 16, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 9 }}>
            <Bar w="80%" h={14} color={WHITE} />
            <Bar w="55%" h={14} color={withAlpha(WHITE, 0.85)} />
            <div style={{ marginTop: "auto", width: 90, height: 26, borderRadius: 9, background: c.c }} />
          </div>
          {cards.map((p, i) => (
            <EventCard key={i} c={c} tone={[c.b, c.c, c.a][i % 3]} p={p} w={width - bezel * 2 - 32} h={84} compact />
          ))}
        </div>
      </div>
    </div>
  );
};

/** Pointeur de souris, avec l'onde du clic. */
export const Cursor: React.FC<{ x: number; y: number; click: number; color?: string; size?: number }> = ({ x, y, click, color = "#1b2230", size = 46 }) => (
  <div style={{ position: "absolute", left: x, top: y, width: size, height: size }}>
    {click > 0 && click < 1 ? (
      <div
        style={{
          position: "absolute",
          left: -40 * click,
          top: -40 * click,
          width: 80 * click,
          height: 80 * click,
          borderRadius: "50%",
          border: `4px solid ${withAlpha(WHITE, 1 - click)}`,
          boxSizing: "border-box",
          boxShadow: `0 0 0 3px ${withAlpha(color, 0.35 * (1 - click))}`,
        }}
      />
    ) : null}
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ position: "absolute", left: 0, top: 0, transform: `scale(${1 - 0.12 * Math.sin(Math.PI * Math.min(1, click * 3))})`, transformOrigin: "10% 10%" }}>
      <path d="M3 2 L3 19 L7.5 14.8 L10.6 21.5 L13.6 20.2 L10.6 13.6 L16.8 13.6 Z" fill={WHITE} stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  </div>
);
