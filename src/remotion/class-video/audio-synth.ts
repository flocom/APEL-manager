/**
 * Synthèse audio en TypeScript pur : pas de WebAudio ni de DOM, pour tourner
 * pareil dans le navigateur (éditeur) et sous Node (tests). Tout est généré
 * par le code, donc libre de droits.
 *
 * - renderMusicWav : petite boucle joyeuse (ukulélé, basse douce, marimba,
 *   glockenspiel, claps et shaker) sur la grille I–V–vi–IV.
 * - renderSfxWav : bruitages courts (pop, whoosh, étincelle).
 *
 * Le rendu est déterministe : même graine → mêmes octets.
 */

export const SYNTH_SAMPLE_RATE = 44100;
const SR = SYNTH_SAMPLE_RATE;

export type SfxKind = "pop" | "whoosh" | "sparkle";

export type MusicOptions = {
  /** Durée voulue ; arrondie au multiple de 4 mesures supérieur (boucle propre). */
  seconds: number;
  /** Graine : change la tonalité et quelques variations. */
  seed?: number;
  /** Tempo, 112 par défaut (entraînant sans être speed). */
  bpm?: number;
};

// ---------------------------------------------------------------------------
// Utilitaires

/** Générateur pseudo-aléatoire rapide et reproductible. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// Table de sinus : bien plus rapide que Math.sin dans les boucles audio.
const TABLE_BITS = 13;
const TABLE_SIZE = 1 << TABLE_BITS;
const TABLE_MASK = TABLE_SIZE - 1;
const SINE = new Float32Array(TABLE_SIZE + 1);
for (let i = 0; i <= TABLE_SIZE; i++) SINE[i] = Math.sin((2 * Math.PI * i) / TABLE_SIZE);

/** Sinus d'une phase exprimée en tours (1 = 2π), interpolé. */
function sinTurns(phase: number): number {
  const x = (phase - Math.floor(phase)) * TABLE_SIZE;
  const i = x | 0;
  const f = x - i;
  return SINE[i & TABLE_MASK] + (SINE[(i & TABLE_MASK) + 1] - SINE[i & TABLE_MASK]) * f;
}

/** Filtre biquad (formules RBJ), mono. */
class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(type: "lowpass" | "highpass" | "bandpass", freq: number, q: number) {
    this.set(type, freq, q);
  }

  set(type: "lowpass" | "highpass" | "bandpass", freq: number, q: number) {
    const w = (2 * Math.PI * Math.min(freq, SR * 0.45)) / SR;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    let b0: number;
    let b1: number;
    let b2: number;
    if (type === "lowpass") {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
    } else if (type === "highpass") {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Bus stéréo circulaire : ce qui dépasse de la fin revient au début (boucle sans couture). */
class LoopBus {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly send: Float32Array;

  constructor(readonly length: number) {
    this.left = new Float32Array(length);
    this.right = new Float32Array(length);
    this.send = new Float32Array(length);
  }

  /**
   * Ajoute `samples` à partir de `start`, avec un gain, un panoramique
   * (-1 gauche, +1 droite) et un envoi vers la réverbération.
   */
  add(samples: Float32Array, start: number, gain: number, pan: number, reverb: number, maxLength = samples.length) {
    const len = Math.min(samples.length, maxLength);
    const fade = Math.min(len, 256);
    // Panoramique à puissance constante.
    const angle = ((pan + 1) * Math.PI) / 4;
    const gl = Math.cos(angle) * gain;
    const gr = Math.sin(angle) * gain;
    const gs = reverb * gain;
    const n = this.length;
    let idx = ((start % n) + n) % n;
    for (let i = 0; i < len; i++) {
      let s = samples[i];
      if (i > len - fade) s *= (len - i) / fade;
      this.left[idx] += s * gl;
      this.right[idx] += s * gr;
      this.send[idx] += s * gs;
      idx++;
      if (idx === n) idx = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Instruments (chaque note est pré-calculée puis mixée)

/** Corde pincée Karplus-Strong accordée finement (retard fractionnaire). */
function pluck(freq: number, seconds: number, brightness: number, rng: Rng): Float32Array {
  const len = Math.floor(seconds * SR);
  const out = new Float32Array(len);
  // La moyenne sur deux échantillons ajoute un demi-échantillon de retard.
  const period = SR / freq - 0.5;
  const excLen = Math.ceil(period) + 2;
  const exc = new Float32Array(excLen);
  let smooth = 0;
  for (let i = 0; i < excLen; i++) {
    const noise = rng() * 2 - 1;
    smooth += (noise - smooth) * brightness;
    exc[i] = smooth;
  }
  // Position de pincement : on retranche une copie retardée (moins « nasal »).
  const pickDelay = Math.max(1, Math.round(excLen * 0.18));
  for (let i = excLen - 1; i >= pickDelay; i--) exc[i] -= exc[i - pickDelay] * 0.85;
  const t60 = 1.1 + 180 / freq;
  const g = Math.pow(0.001, 1 / (freq * t60));
  let prev = 0;
  for (let n = 0; n < len; n++) {
    let y = n < excLen ? exc[n] : 0;
    const pos = n - period;
    if (pos >= 1) {
      const i0 = Math.floor(pos);
      const f = pos - i0;
      const d = out[i0] * (1 - f) + (i0 + 1 < n ? out[i0 + 1] : 0) * f;
      y += g * 0.5 * (d + prev);
      prev = d;
    }
    out[n] = y;
  }
  // Normalisation douce (la sortie KS dépend de l'excitation aléatoire).
  let peak = 0;
  for (let n = 0; n < Math.min(len, excLen * 4); n++) peak = Math.max(peak, Math.abs(out[n]));
  const k = peak > 0 ? 0.6 / peak : 0;
  const release = Math.floor(0.05 * SR);
  for (let n = 0; n < len; n++) {
    out[n] *= k;
    if (n > len - release) out[n] *= (len - n) / release;
  }
  return out;
}

/** Marimba en FM : attaque boisée qui s'éteint vite, corps sinusoïdal. */
function marimba(freq: number, seconds: number): Float32Array {
  const len = Math.floor(seconds * SR);
  const out = new Float32Array(len);
  const dc = freq / SR;
  const dm = (freq * 4) / SR;
  const decay = Math.exp(-1 / (SR * (0.35 + 60 / freq)));
  const idxDecay = Math.exp(-1 / (SR * 0.018));
  let pc = 0;
  let pm = 0;
  let amp = 1;
  let index = 2.2;
  for (let n = 0; n < len; n++) {
    const attack = n < 88 ? n / 88 : 1;
    const mod = sinTurns(pm) * index;
    out[n] = (sinTurns(pc + mod / (2 * Math.PI)) * 0.8 + sinTurns(pc * 2) * 0.12 * amp) * amp * attack;
    pc += dc;
    pm += dm;
    amp *= decay;
    index *= idxDecay;
  }
  return out;
}

/** Glockenspiel en FM (rapport inharmonique 3,5) : son de clochette. */
function glock(freq: number, seconds: number, brightness = 1.4): Float32Array {
  const len = Math.floor(seconds * SR);
  const out = new Float32Array(len);
  const dc = freq / SR;
  const dm = (freq * 3.5) / SR;
  const decay = Math.exp(-1 / (SR * 0.55));
  const idxDecay = Math.exp(-1 / (SR * 0.08));
  let pc = 0;
  let pm = 0;
  let amp = 1;
  let index = brightness;
  for (let n = 0; n < len; n++) {
    const attack = n < 44 ? n / 44 : 1;
    out[n] = sinTurns(pc + (sinTurns(pm) * index) / (2 * Math.PI)) * amp * attack;
    pc += dc;
    pm += dm;
    amp *= decay;
    index *= idxDecay;
  }
  return out;
}

/** Basse douce : sinus + un peu d'harmoniques, attaque feutrée. */
function softBass(freq: number, seconds: number): Float32Array {
  const len = Math.floor(seconds * SR);
  const out = new Float32Array(len);
  const d = freq / SR;
  const decay = Math.exp(-1 / (SR * 0.9));
  const release = Math.floor(0.04 * SR);
  let p = 0;
  let amp = 1;
  for (let n = 0; n < len; n++) {
    const attack = n < 220 ? n / 220 : 1;
    const rel = n > len - release ? (len - n) / release : 1;
    out[n] = (sinTurns(p) + sinTurns(p * 2) * 0.28 + sinTurns(p * 3) * 0.08) * amp * attack * rel;
    p += d;
    amp *= decay;
  }
  return out;
}

/** Nappe très discrète (deux sinus désaccordés par note) pour lier le tout. */
function padChord(freqs: number[], seconds: number): Float32Array {
  const len = Math.floor(seconds * SR);
  const out = new Float32Array(len);
  const att = Math.floor(0.35 * SR);
  const rel = Math.floor(0.4 * SR);
  for (const f of freqs) {
    const d1 = (f * 1.003) / SR;
    const d2 = (f * 0.997) / SR;
    let p1 = 0;
    let p2 = 0.37;
    for (let n = 0; n < len; n++) {
      const env = Math.min(1, n / att, (len - n) / rel);
      out[n] += (sinTurns(p1) + sinTurns(p2)) * 0.5 * env;
      p1 += d1;
      p2 += d2;
    }
  }
  return out;
}

function kick(): Float32Array {
  const len = Math.floor(0.22 * SR);
  const out = new Float32Array(len);
  let p = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 48 + 70 * Math.exp(-t * 40);
    const amp = Math.exp(-t * 18) * (n < 30 ? n / 30 : 1);
    out[n] = sinTurns(p) * amp;
    p += f / SR;
  }
  return out;
}

function clap(rng: Rng): Float32Array {
  const len = Math.floor(0.2 * SR);
  const out = new Float32Array(len);
  const bp = new Biquad("bandpass", 1500, 0.9);
  const hp = new Biquad("highpass", 500, 0.7);
  const bursts = [0, 0.009, 0.019];
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    let env = Math.exp(-(t - 0.025) * 28) * 0.7;
    for (const b of bursts) if (t >= b && t < b + 0.009) env = Math.max(env, Math.exp(-(t - b) * 250));
    out[n] = hp.process(bp.process((rng() * 2 - 1) * env)) * 2.2;
  }
  return out;
}

function shaker(rng: Rng, accent: number): Float32Array {
  const len = Math.floor(0.08 * SR);
  const out = new Float32Array(len);
  const hp = new Biquad("highpass", 6500, 0.8);
  const lp = new Biquad("lowpass", 12000, 0.7);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = Math.min(1, t / 0.006) * Math.exp(-t * (accent > 0.7 ? 45 : 70));
    out[n] = lp.process(hp.process((rng() * 2 - 1) * env)) * accent;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Réverbération (Freeverb simplifié) et mastering

class Comb {
  private buf: Float32Array;
  private i = 0;
  private store = 0;
  constructor(size: number, private feedback: number, private damp: number) {
    this.buf = new Float32Array(size);
  }
  process(x: number): number {
    const y = this.buf[this.i];
    this.store = y * (1 - this.damp) + this.store * this.damp;
    this.buf[this.i] = x + this.store * this.feedback;
    if (++this.i >= this.buf.length) this.i = 0;
    return y;
  }
}

class Allpass {
  private buf: Float32Array;
  private i = 0;
  constructor(size: number) {
    this.buf = new Float32Array(size);
  }
  process(x: number): number {
    const b = this.buf[this.i];
    const y = -x + b;
    this.buf[this.i] = x + b * 0.5;
    if (++this.i >= this.buf.length) this.i = 0;
    return y;
  }
}

/**
 * Ajoute la réverbération de `send` à `left`/`right`. On fait deux passages
 * sur la boucle et on ne garde que le second : la queue de fin retombe au
 * début, comme si la musique tournait depuis toujours.
 */
function applyLoopReverb(left: Float32Array, right: Float32Array, send: Float32Array, wet: number, loop = true) {
  const scale = SR / 44100;
  const make = (spread: number) => ({
    combs: [1116, 1188, 1277, 1356].map((s) => new Comb(Math.round((s + spread) * scale), 0.8, 0.3)),
    alls: [556, 441].map((s) => new Allpass(Math.round((s + spread) * scale))),
  });
  const l = make(0);
  const r = make(23);
  const n = send.length;
  const run = (ch: ReturnType<typeof make>, x: number) => {
    let y = 0;
    for (const c of ch.combs) y += c.process(x);
    for (const a of ch.alls) y = a.process(y);
    return y;
  };
  const passes = loop ? 2 : 1;
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < n; i++) {
      const x = send[i] * 0.12;
      const yl = run(l, x);
      const yr = run(r, x);
      if (pass === passes - 1) {
        left[i] += yl * wet;
        right[i] += yr * wet;
      }
    }
  }
}

/** Normalise sous le plafond, avec une saturation douce pour les rares crêtes. */
function master(left: Float32Array, right: Float32Array, ceiling: number) {
  // Retire une éventuelle composante continue.
  for (const ch of [left, right]) {
    let mean = 0;
    for (let i = 0; i < ch.length; i++) mean += ch[i];
    mean /= ch.length || 1;
    for (let i = 0; i < ch.length; i++) ch[i] -= mean;
  }
  // On cale le niveau sur le 99,9e centile plutôt que sur la crête absolue,
  // puis on arrondit les quelques crêtes restantes (tanh) sous le plafond.
  const hist = new Uint32Array(1024);
  let count = 0;
  for (const ch of [left, right]) {
    for (let i = 0; i < ch.length; i += 3) {
      hist[Math.min(1023, Math.floor(Math.abs(ch[i]) * 256))]++;
      count++;
    }
  }
  let acc = 0;
  let p999 = 1 / 256;
  for (let b = 0; b < 1024; b++) {
    acc += hist[b];
    if (acc >= count * 0.999) {
      p999 = (b + 1) / 256;
      break;
    }
  }
  const gain = (ceiling * 0.8) / p999;
  for (const ch of [left, right]) {
    for (let i = 0; i < ch.length; i++) {
      const x = ch[i] * gain;
      ch[i] = Math.abs(x) < ceiling * 0.8 ? x : Math.sign(x) * (ceiling * 0.8 + ceiling * 0.2 * Math.tanh((Math.abs(x) - ceiling * 0.8) / (ceiling * 0.2)));
    }
  }
}

// ---------------------------------------------------------------------------
// Écriture WAV

/** Encode des canaux flottants (-1…1) en WAV PCM 16 bits little-endian. */
export function encodeWav(channels: Float32Array[], sampleRate = SR): Uint8Array {
  const numChannels = channels.length;
  const frames = channels[0]?.length ?? 0;
  const dataBytes = frames * numChannels * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
      offset += 2;
    }
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Musique

type Note = [beat: number, semitone: number, beats: number];

/*
 * Mélodie écrite à la main (demi-tons au-dessus de la tonique, octave 5),
 * une mesure par ligne, sur la grille I–V–vi–IV répétée.
 * Partie A : chantonnante ; partie B : plus haute, doublée au glockenspiel.
 */
const MELODY_A: Note[][] = [
  [[0, 4, 0.5], [0.5, 7, 0.5], [1, 12, 1], [2, 11, 0.5], [2.5, 12, 0.5], [3, 7, 1]],
  [[0, 2, 0.5], [0.5, 7, 0.5], [1, 11, 1], [2, 9, 0.5], [2.5, 11, 0.5], [3, 14, 1]],
  [[0, 12, 0.5], [0.5, 11, 0.5], [1, 9, 1], [2, 4, 1], [3, 9, 0.5], [3.5, 7, 0.5]],
  [[0, 5, 1], [1, 9, 0.5], [1.5, 7, 0.5], [2, 5, 0.5], [2.5, 4, 0.5], [3, 2, 1]],
  [[0, 4, 0.5], [0.5, 7, 0.5], [1, 12, 1], [2, 11, 0.5], [2.5, 12, 0.5], [3, 7, 1]],
  [[0, 2, 0.5], [0.5, 7, 0.5], [1, 11, 1], [2, 9, 0.5], [2.5, 11, 0.5], [3, 14, 1]],
  [[0, 9, 0.5], [0.5, 12, 0.5], [1, 16, 1], [2, 12, 1], [3, 9, 1]],
  [[0, 12, 1.5], [1.5, 9, 0.5], [2, 9, 1], [3, 7, 1]],
];

const MELODY_B: Note[][] = [
  [[0, 16, 1.5], [1.5, 14, 0.5], [2, 12, 1], [3, 7, 1]],
  [[0, 14, 1.5], [1.5, 12, 0.5], [2, 11, 1], [3, 7, 1]],
  [[0, 12, 1], [1, 11, 0.5], [1.5, 12, 0.5], [2, 16, 1], [3, 14, 1]],
  [[0, 12, 1.5], [1.5, 9, 0.5], [2, 5, 1], [3, 9, 1]],
  [[0, 16, 1.5], [1.5, 14, 0.5], [2, 12, 1], [3, 16, 1]],
  [[0, 19, 1.5], [1.5, 17, 0.5], [2, 14, 1], [3, 11, 1]],
  [[0, 12, 1], [1, 11, 0.5], [1.5, 9, 0.5], [2, 4, 1], [3, 9, 1]],
  [[0, 9, 1], [1, 7, 1], [2, 5, 0.5], [2.5, 4, 0.5], [3, 2, 1]],
];

/** Accords de ukulélé (cordes sol-do-mi-la), en demi-tons au-dessus de do 4. */
const UKE_CHORDS: number[][] = [
  [7, 0, 4, 12], // I   (do)
  [7, 2, 7, 11], // V   (sol)
  [9, 0, 4, 9], // vi  (la mineur)
  [9, 0, 5, 9], // IV  (fa)
];
/** Fondamentale de chaque accord (demi-tons) et sa quinte, pour la basse. */
const BASS_ROOTS = [0, 7, 9, 5];
const PAD_CHORDS = [
  [0, 4, 7],
  [-1, 2, 7],
  [0, 4, 9],
  [0, 5, 9],
];

/** Coup de gratte « île » : bas, bas-haut, haut-bas-haut (en temps). */
const STRUM: [beat: number, down: boolean, velocity: number][] = [
  [0, true, 1],
  [1, true, 0.8],
  [1.5, false, 0.55],
  [2.5, false, 0.6],
  [3, true, 0.85],
  [3.5, false, 0.55],
];

/** Tonalités possibles (décalage depuis do), choisies par la graine. */
const KEYS = [0, 2, -3, -5, -2];

export function renderMusicWav({ seconds, seed = 1, bpm = 112 }: MusicOptions): Uint8Array {
  const rng = mulberry32(seed * 7919 + 13);
  const key = KEYS[(Math.abs(Math.floor(seed)) + KEYS.length - 1) % KEYS.length];
  const beat = 60 / Math.max(60, Math.min(160, bpm));
  const bar = beat * 4;
  const patternBars = 16;
  const patternLength = Math.round(patternBars * bar * SR);
  const bus = new LoopBus(patternLength);
  // Léger swing sur les croches : c'est ce qui rend la boucle sautillante.
  const swing = 0.08 * beat;
  const at = (barIndex: number, beatPos: number) => {
    const frac = beatPos % 1;
    const swung = Math.abs(frac - 0.5) < 1e-6 ? swing : 0;
    return Math.round((barIndex * bar + beatPos * beat + swung) * SR);
  };

  // Caches de notes : une corde pincée coûte cher, on la réutilise.
  const pluckCache = new Map<string, Float32Array>();
  const getPluck = (midi: number, variant: number) => {
    const k = `${midi}:${variant}`;
    let p = pluckCache.get(k);
    if (!p) {
      p = pluck(midiToFreq(midi), 1.4, 0.55 + variant * 0.12, mulberry32(midi * 31 + variant * 977 + seed));
      pluckCache.set(k, p);
    }
    return p;
  };
  const noteCache = new Map<string, Float32Array>();
  const cached = (k: string, make: () => Float32Array) => {
    let v = noteCache.get(k);
    if (!v) {
      v = make();
      noteCache.set(k, v);
    }
    return v;
  };

  const kickSample = kick();
  const claps = [clap(rng), clap(rng)];
  const shakers = [shaker(rng, 1), shaker(rng, 0.55), shaker(rng, 0.4)];
  const ukeBase = 60 + key;
  const melodyBase = 72 + key;
  const bassBase = 36 + key + (key < 0 ? 12 : 0);

  for (let b = 0; b < patternBars; b++) {
    const chord = b % 4;
    const sectionB = b >= 8;

    // Ukulélé : chaque coup étouffe le précédent.
    STRUM.forEach(([pos, down, vel], si) => {
      const start = at(b, pos);
      const nextPos = si + 1 < STRUM.length ? STRUM[si + 1][0] : 4;
      const ring = at(b, nextPos) - start + Math.round(0.06 * SR);
      const strings = UKE_CHORDS[chord].map((s) => ukeBase + s);
      const order = down ? strings : [...strings].reverse().slice(0, 3);
      order.forEach((midi, i) => {
        const offset = Math.round(i * (down ? 0.011 : 0.008) * SR);
        const human = 0.9 + rng() * 0.2;
        bus.add(getPluck(midi, down ? 0 : 1), start + offset, 0.2 * vel * human, -0.25 + i * 0.05, 0.12, ring + (down ? 0 : -offset));
      });
    });

    // Basse : fondamentale, rebond, quinte.
    const root = bassBase + BASS_ROOTS[chord];
    const bassNotes: [number, number, number][] = [
      [0, root, 1.4],
      [1.5, root, 0.45],
      [2, root + 7 > bassBase + 14 ? root - 5 : root + 7, 0.9],
      [3, root, 0.9],
    ];
    for (const [pos, midi, len] of bassNotes) {
      const s = cached(`bass:${midi}:${len}`, () => softBass(midiToFreq(midi), len * beat));
      bus.add(s, at(b, pos), pos === 0 ? 0.42 : 0.3, 0, 0);
    }

    // Nappe discrète.
    const pad = cached(`pad:${chord}`, () => padChord(PAD_CHORDS[chord].map((s) => midiToFreq(60 + key + s)), bar));
    bus.add(pad, at(b, 0), 0.035, 0, 0.3);

    // Mélodie.
    const phrase = sectionB ? MELODY_B[b - 8] : MELODY_A[b];
    for (const [pos, semi, len] of phrase) {
      const midi = melodyBase + semi;
      const m = cached(`mar:${midi}`, () => marimba(midiToFreq(midi), 1.2));
      const ring = Math.round(Math.max(len * beat + 0.25, 0.4) * SR);
      bus.add(m, at(b, pos), sectionB ? 0.2 : 0.24, 0.2, 0.3, ring);
      if (sectionB) {
        const gl = cached(`gl:${midi + 12}`, () => glock(midiToFreq(midi + 12), 1.6));
        bus.add(gl, at(b, pos), 0.07, 0.35, 0.45);
      }
    }
    // Petites clochettes en fin de phrase (partie A), pour l'étincelle.
    if (!sectionB && b % 4 === 3) {
      [0, 4, 7].forEach((s, i) => {
        const midi = melodyBase + 12 + s + (b === 7 ? 5 : 0);
        const gl = cached(`gl:${midi}`, () => glock(midiToFreq(midi), 1.6));
        bus.add(gl, at(b, 3.5) + Math.round(i * 0.07 * SR), 0.045, 0.5 - i * 0.25, 0.5);
      });
    }

    // Percussions douces.
    bus.add(kickSample, at(b, 0), 0.45, 0, 0);
    bus.add(kickSample, at(b, 2), 0.36, 0, 0);
    if (sectionB) bus.add(kickSample, at(b, 3.5), 0.18, 0, 0);
    bus.add(claps[b % 2], at(b, 1), 0.13, 0.05, 0.25);
    bus.add(claps[(b + 1) % 2], at(b, 3), 0.15, -0.05, 0.25);
    for (let s = 0; s < 16; s++) {
      const pos = s / 4;
      if (!sectionB && s % 2 === 1) continue;
      const accent = s % 4 === 2 ? 0 : s % 2 === 0 ? 1 : 2;
      bus.add(shakers[accent], at(b, pos), 0.06, 0.45, 0.05);
    }
  }

  applyLoopReverb(bus.left, bus.right, bus.send, 0.28);
  master(bus.left, bus.right, 0.89);

  // On répète la boucle pour couvrir la durée demandée, arrondie à 4 mesures.
  const unit = Math.round(4 * bar * SR);
  const units = Math.max(1, Math.ceil((Math.max(0.1, seconds) * SR) / unit));
  const total = Math.min(units * unit, 60 * 20 * SR);
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  for (let i = 0; i < total; i += patternLength) {
    const len = Math.min(patternLength, total - i);
    left.set(bus.left.subarray(0, len), i);
    right.set(bus.right.subarray(0, len), i);
  }
  return encodeWav([left, right]);
}

// ---------------------------------------------------------------------------
// Bruitages

function renderPop(): Float32Array[] {
  const len = Math.floor(0.2 * SR);
  const out = new Float32Array(len);
  let p = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    // « Bloup » : glissando rapide vers l'aigu, enveloppe très courte.
    const f = 380 + 720 * (1 - Math.exp(-t * 55));
    const amp = Math.min(1, t / 0.003) * Math.exp(-t * 26);
    out[n] = (sinTurns(p) * 0.85 + sinTurns(p * 2) * 0.12) * amp;
    p += f / SR;
  }
  return [out, out];
}

function renderWhoosh(): Float32Array[] {
  const seconds = 0.7;
  const len = Math.floor(seconds * SR);
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  const rng = mulberry32(4242);
  const bl = new Biquad("bandpass", 400, 0.8);
  const br = new Biquad("bandpass", 400, 0.8);
  let lp = 0;
  for (let n = 0; n < len; n++) {
    const x = n / len;
    // Filtre qui monte puis redescend, volume en cloche, passage gauche → droite.
    const f = 350 + 2600 * Math.sin(Math.PI * Math.min(1, x * 1.15)) ** 1.5;
    if (n % 32 === 0) {
      bl.set("bandpass", f, 0.9);
      br.set("bandpass", f * 1.06, 0.9);
    }
    const env = Math.sin(Math.PI * x) ** 2 * (1 - x * 0.3);
    const noise = rng() * 2 - 1;
    lp += (noise - lp) * 0.5;
    const pan = x;
    left[n] = bl.process(lp) * env * Math.cos((pan * Math.PI) / 2) * 3.2;
    right[n] = br.process(lp) * env * Math.sin((pan * Math.PI) / 2) * 3.2;
  }
  return [left, right];
}

function renderSparkle(): Float32Array[] {
  const seconds = 1.5;
  const len = Math.floor(seconds * SR);
  const bus = new LoopBus(len + Math.floor(0.5 * SR));
  // Arpège pentatonique aigu, chaque clochette un peu ailleurs dans l'espace.
  const notes = [84, 88, 91, 96, 100, 103, 108];
  notes.forEach((midi, i) => {
    const s = glock(midiToFreq(midi), 1.0, 1.1);
    bus.add(s, Math.round(i * 0.048 * SR), 0.55 - i * 0.04, i % 2 === 0 ? -0.5 : 0.5, 0.6);
  });
  const send = bus.send;
  // Réverbération non circulaire ici : on veut une vraie queue.
  const l = bus.left.slice(0, len);
  const r = bus.right.slice(0, len);
  const tmpL = new Float32Array(bus.length);
  const tmpR = new Float32Array(bus.length);
  applyLoopReverb(tmpL, tmpR, send, 0.5, false);
  for (let i = 0; i < len; i++) {
    const fade = i > len - 4000 ? (len - i) / 4000 : 1;
    l[i] = (l[i] + tmpL[i]) * fade;
    r[i] = (r[i] + tmpR[i]) * fade;
  }
  return [l, r];
}

function normalize(channels: Float32Array[], peakTarget: number) {
  let peak = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  if (peak === 0) return channels;
  const k = peakTarget / peak;
  return channels.map((ch) => ch.map((v) => v * k));
}

export function renderSfxWav(kind: SfxKind): Uint8Array {
  const channels = kind === "pop" ? renderPop() : kind === "whoosh" ? renderWhoosh() : renderSparkle();
  return encodeWav(normalize(channels, 0.8));
}

// ---------------------------------------------------------------------------
// Navigateur

/** Crée une URL blob: pour un WAV généré (navigateur uniquement). */
export function wavToBlobUrl(bytes: Uint8Array): string {
  if (typeof Blob === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("wavToBlobUrl n'est disponible que dans le navigateur.");
  }
  // Copie dans un ArrayBuffer autonome (le Uint8Array peut être une vue partielle).
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return URL.createObjectURL(new Blob([copy.buffer], { type: "audio/wav" }));
}
