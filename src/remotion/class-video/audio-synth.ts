/**
 * Synthèse audio en TypeScript pur : pas de WebAudio ni de DOM, pour tourner
 * pareil dans le navigateur (éditeur) et sous Node (tests). Tout est généré
 * par le code, donc libre de droits.
 *
 * - renderMusicWav : boucle calme et chaleureuse, pour un public adulte
 *   (piano doux, arpège de cordes pincées, nappe, basse ronde, percussions
 *   légères) sur la grille I–V–vi–IV, vers 92 battements par minute.
 * - renderSfxWav : bruitages courts et discrets (clic doux, souffle,
 *   carillon).
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
  /** Tempo, 92 par défaut (posé, sans traîner). */
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

/**
 * Piano doux en synthèse additive : partiels légèrement inharmoniques qui
 * s'éteignent d'autant plus vite qu'ils sont aigus, doublure désaccordée
 * pour la chaleur, petit bruit de marteau feutré.
 */
function piano(freq: number, seconds: number, velocity: number, rng: Rng): Float32Array {
  const len = Math.floor(seconds * SR);
  const out = new Float32Array(len);
  const amps = [1, 0.46, 0.24, 0.13, 0.07, 0.04];
  const baseT = 2.6 * Math.pow(220 / freq, 0.35);
  const bright = 0.55 + 0.45 * velocity;
  for (let k = 1; k <= amps.length; k++) {
    const f = k * freq * Math.sqrt(1 + 0.0004 * k * k);
    if (f > SR * 0.45) break;
    const amp = amps[k - 1] * Math.pow(bright, k - 1);
    const decay = Math.exp(-1 / (SR * (baseT / (1 + 0.6 * (k - 1)))));
    const d1 = f / SR;
    const d2 = (f * 1.0016) / SR;
    let p1 = rng();
    let p2 = rng();
    let env = amp;
    for (let n = 0; n < len; n++) {
      out[n] += (sinTurns(p1) + (k <= 2 ? sinTurns(p2) * 0.5 : 0)) * env;
      p1 += d1;
      p2 += d2;
      env *= decay;
    }
  }
  // Attaque feutrée et marteau (bruit filtré très court).
  const lp = new Biquad("lowpass", 1800, 0.7);
  const attack = Math.floor(0.004 * SR);
  const hammer = Math.floor(0.012 * SR);
  const release = Math.floor(0.08 * SR);
  for (let n = 0; n < len; n++) {
    let x = out[n] * 0.5 * velocity;
    if (n < attack) x *= n / attack;
    if (n < hammer) x += lp.process((rng() * 2 - 1) * (1 - n / hammer)) * 0.05 * velocity;
    if (n > len - release) x *= (len - n) / release;
    out[n] = x;
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
  const len = Math.floor(0.3 * SR);
  const out = new Float32Array(len);
  let p = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 52 + 40 * Math.exp(-t * 30);
    const amp = Math.exp(-t * 11) * (n < 60 ? n / 60 : 1);
    out[n] = sinTurns(p) * amp;
    p += f / SR;
  }
  return out;
}

/** Coup de baguette sur le cercle (rim), très court et boisé. */
function rim(rng: Rng): Float32Array {
  const len = Math.floor(0.09 * SR);
  const out = new Float32Array(len);
  const bp = new Biquad("bandpass", 1900, 3);
  let p = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = Math.exp(-t * 70);
    out[n] = (bp.process((rng() * 2 - 1) * env) * 1.6 + sinTurns(p) * env * 0.5) * (n < 20 ? n / 20 : 1);
    p += 820 / SR;
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

/** Voicings du piano (demi-tons au-dessus de do 4) : I(add9) – V – vi7 – IV(maj7). */
const PIANO_CHORDS: number[][] = [
  [-12, 4, 7, 14],
  [-5, 2, 7, 11],
  [-3, 4, 7, 9],
  [-7, 5, 9, 16],
];
/** Notes de l'arpège pincé, un peu plus haut (demi-tons au-dessus de do 4). */
const ARP_CHORDS: number[][] = [
  [0, 7, 12, 16],
  [-5, 2, 7, 11],
  [-3, 4, 9, 12],
  [-7, 0, 5, 9],
];
/** Ordre de l'arpège sur huit croches, façon guitare en picking. */
const ARP_ORDER = [0, 2, 1, 3, 2, 1, 3, 2];
/** Fondamentale de chaque accord (demi-tons), pour la basse. */
const BASS_ROOTS = [0, 7, 9, 5];
const PAD_CHORDS = [
  [0, 4, 7],
  [-1, 2, 7],
  [0, 4, 9],
  [0, 5, 9],
];

/** Mélodie de la seconde moitié (demi-tons au-dessus de do 5), sobre et chantante. */
const MELODY: Note[][] = [
  [[0, 7, 1.5], [1.5, 4, 0.5], [2, 2, 2]],
  [[0, 2, 1], [1, 4, 1], [2, 7, 2]],
  [[0, 9, 1.5], [1.5, 7, 0.5], [2, 4, 2]],
  [[0, 5, 1], [1, 4, 1], [2, 0, 2]],
  [[0, 7, 1.5], [1.5, 9, 0.5], [2, 12, 2]],
  [[0, 11, 1.5], [1.5, 9, 0.5], [2, 7, 2]],
  [[0, 9, 1], [1, 12, 1], [2, 11, 1], [3, 9, 1]],
  [[0, 7, 2], [2, 5, 1], [3, 4, 1]],
];

/** Tonalités possibles (décalage depuis do), choisies par la graine. */
const KEYS = [0, 2, -3, -5, -2];

export function renderMusicWav({ seconds, seed = 1, bpm = 92 }: MusicOptions): Uint8Array {
  const rng = mulberry32(seed * 7919 + 13);
  const key = KEYS[(Math.abs(Math.floor(seed)) + KEYS.length - 1) % KEYS.length];
  const beat = 60 / Math.max(60, Math.min(160, bpm));
  const bar = beat * 4;
  const patternBars = 16;
  const patternLength = Math.round(patternBars * bar * SR);
  const bus = new LoopBus(patternLength);
  const at = (barIndex: number, beatPos: number) => Math.round((barIndex * bar + beatPos * beat) * SR);

  // Caches de notes : une note synthétisée est réutilisée d'une mesure à l'autre.
  const noteCache = new Map<string, Float32Array>();
  const cached = (k: string, make: () => Float32Array) => {
    let v = noteCache.get(k);
    if (!v) {
      v = make();
      noteCache.set(k, v);
    }
    return v;
  };
  const pianoNote = (midi: number, vel: number, len: number) =>
    cached(`pno:${midi}:${vel}:${len}`, () => piano(midiToFreq(midi), len, vel, mulberry32(midi * 131 + seed)));

  const kickSample = kick();
  const rims = [rim(rng), rim(rng)];
  const shakers = [shaker(rng, 0.7), shaker(rng, 0.45)];
  const base = 60 + key;
  const melodyBase = 72 + key;
  const bassBase = 36 + key + (key < 0 ? 12 : 0);

  for (let b = 0; b < patternBars; b++) {
    const chord = b % 4;
    const sectionB = b >= 8;

    // Piano : accord posé (légèrement égrené) sur le 1, rappel plus doux sur le 3.
    PIANO_CHORDS[chord].forEach((semi, i) => {
      const midi = base + semi;
      const roll = Math.round(i * 0.018 * SR);
      bus.add(pianoNote(midi, 0.6, bar * 0.55 + 0.4), at(b, 0) + roll, 0.2, -0.2 + i * 0.12, 0.35);
      if (i > 0) bus.add(pianoNote(midi, 0.35, bar * 0.5 + 0.3), at(b, 2) + roll, 0.13, -0.1 + i * 0.1, 0.35);
    });

    // Arpège pincé en croches (plus présent dans la seconde moitié).
    ARP_ORDER.forEach((idx, step) => {
      const midi = base + 12 + ARP_CHORDS[chord][idx];
      const pl = cached(`pl:${midi}`, () => pluck(midiToFreq(midi), 1.2, 0.35, mulberry32(midi * 31 + seed)));
      const human = 0.85 + rng() * 0.25;
      const vel = (step % 2 === 0 ? 1 : 0.7) * human * (sectionB ? 0.11 : 0.08);
      bus.add(pl, at(b, step / 2), vel, 0.3, 0.25, Math.round(beat * SR * 1.2));
    });

    // Nappe très discrète.
    const pad = cached(`pad:${chord}`, () => padChord(PAD_CHORDS[chord].map((st) => midiToFreq(base + st)), bar));
    bus.add(pad, at(b, 0), 0.028, 0, 0.4);

    // Basse ronde : note tenue, puis rebond dans la seconde moitié.
    const root = bassBase + BASS_ROOTS[chord];
    if (sectionB) {
      bus.add(cached(`bass:${root}:2.5`, () => softBass(midiToFreq(root), 2.5 * beat)), at(b, 0), 0.36, 0, 0);
      bus.add(cached(`bass:${root}:1.5`, () => softBass(midiToFreq(root), 1.5 * beat)), at(b, 2.5), 0.26, 0, 0);
    } else {
      bus.add(cached(`bass:${root}:4`, () => softBass(midiToFreq(root), 3.9 * beat)), at(b, 0), 0.32, 0, 0);
    }

    // Mélodie (seconde moitié), au piano, doublée d'une clochette très douce.
    if (sectionB) {
      for (const [pos, semi, len] of MELODY[b - 8]) {
        const midi = melodyBase + semi;
        bus.add(pianoNote(midi, 0.5, Math.max(1, len * beat + 0.8)), at(b, pos), 0.2, 0.15, 0.45);
        const gl = cached(`gl:${midi + 12}`, () => glock(midiToFreq(midi + 12), 1.4, 0.6));
        bus.add(gl, at(b, pos), 0.025, 0.35, 0.5);
      }
    }

    // Percussions légères : shaker partout, pulsation et rim dans la seconde moitié.
    for (let st = 0; st < 8; st++) {
      bus.add(shakers[st % 2], at(b, st / 2), sectionB ? 0.05 : 0.035, 0.4, 0.1);
    }
    if (sectionB || b % 4 === 3) {
      bus.add(kickSample, at(b, 0), 0.3, 0, 0);
      if (sectionB) bus.add(kickSample, at(b, 2), 0.24, 0, 0);
    }
    if (sectionB) {
      bus.add(rims[0], at(b, 1), 0.07, -0.1, 0.3);
      bus.add(rims[1], at(b, 3), 0.08, 0.1, 0.3);
    }
  }

  applyLoopReverb(bus.left, bus.right, bus.send, 0.34);
  master(bus.left, bus.right, 0.85);

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

/** Clic doux et boisé : petite note qui retombe, attaque feutrée. */
function renderPop(): Float32Array[] {
  const len = Math.floor(0.16 * SR);
  const out = new Float32Array(len);
  const rng = mulberry32(99);
  const lp = new Biquad("lowpass", 3000, 0.7);
  let p = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 620 + 280 * Math.exp(-t * 60);
    const amp = Math.min(1, t / 0.002) * Math.exp(-t * 38);
    const click = n < 120 ? lp.process(rng() * 2 - 1) * (1 - n / 120) * 0.25 : 0;
    out[n] = (sinTurns(p) * 0.9 + sinTurns(p * 2.01) * 0.12) * amp + click;
    p += f / SR;
  }
  return [out, out];
}

/** Souffle feutré qui traverse de gauche à droite. */
function renderWhoosh(): Float32Array[] {
  const seconds = 0.6;
  const len = Math.floor(seconds * SR);
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  const rng = mulberry32(4242);
  const bl = new Biquad("bandpass", 300, 0.7);
  const br = new Biquad("bandpass", 300, 0.7);
  let lp = 0;
  for (let n = 0; n < len; n++) {
    const x = n / len;
    const f = 280 + 1100 * Math.sin(Math.PI * Math.min(1, x * 1.1)) ** 1.6;
    if (n % 32 === 0) {
      bl.set("bandpass", f, 0.7);
      br.set("bandpass", f * 1.05, 0.7);
    }
    const env = Math.sin(Math.PI * x) ** 2.2;
    lp += (rng() * 2 - 1 - lp) * 0.35;
    left[n] = bl.process(lp) * env * Math.cos((x * Math.PI) / 2) * 3;
    right[n] = br.process(lp) * env * Math.sin((x * Math.PI) / 2) * 3;
  }
  return [left, right];
}

/** Carillon discret : quatre notes d'un accord majeur, égrenées, avec réverbération. */
function renderSparkle(): Float32Array[] {
  const seconds = 2;
  const len = Math.floor(seconds * SR);
  const bus = new LoopBus(len + Math.floor(0.5 * SR));
  const notes = [84, 88, 91, 96];
  notes.forEach((midi, i) => {
    const s = glock(midiToFreq(midi), 1.6, 0.55);
    bus.add(s, Math.round(i * 0.1 * SR), 0.5 - i * 0.05, i % 2 === 0 ? -0.35 : 0.35, 0.6);
  });
  const l = bus.left.slice(0, len);
  const r = bus.right.slice(0, len);
  const tmpL = new Float32Array(bus.length);
  const tmpR = new Float32Array(bus.length);
  // Réverbération non circulaire ici : on veut une vraie queue.
  applyLoopReverb(tmpL, tmpR, bus.send, 0.5, false);
  for (let i = 0; i < len; i++) {
    const fade = i > len - 6000 ? (len - i) / 6000 : 1;
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
  // Crêtes volontairement basses : des bruitages qui accompagnent sans s'imposer.
  return encodeWav(normalize(channels, kind === "sparkle" ? 0.6 : 0.5));
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
