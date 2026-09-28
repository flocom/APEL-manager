/**
 * Synthèse audio en TypeScript pur : pas de WebAudio ni de DOM, pour tourner
 * pareil dans le navigateur (éditeur) et sous Node (tests). Tout est généré
 * par le code, donc libre de droits.
 *
 * - renderMusicWav : morceau pop entraînant et soigné, 120 battements par
 *   minute, grille vi–IV–I–V : montée d'ouverture, « drop » juste après
 *   l'accroche (grosse caisse sur chaque temps, claps sur 2 et 4, basse en
 *   octaves, accords « supersaw » à contretemps qui respirent avec la
 *   grosse caisse), pause au milieu, refrain avec mélodie pincée, puis
 *   envolée finale.
 * - renderSfxWav : bruitages courts et nets (pop, whoosh, impact brillant).
 *
 * Le rendu est déterministe : même graine → mêmes octets.
 */

/** Tempo par défaut de la musique générée ; la vidéo cale ses scènes dessus. */
export const DEFAULT_MUSIC_BPM = 120;

export const SYNTH_SAMPLE_RATE = 44100;
const SR = SYNTH_SAMPLE_RATE;

export type SfxKind = "pop" | "whoosh" | "sparkle";

export type MusicOptions = {
  /** Durée voulue ; arrondie au multiple de 4 mesures supérieur. */
  seconds: number;
  /** Graine : change la tonalité et quelques variations. */
  seed?: number;
  /** Tempo, DEFAULT_MUSIC_BPM (120) par défaut : entraînant sans précipiter. */
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
 * Accord « supersaw » : trois dents de scie légèrement désaccordées par note
 * (somme d'harmoniques, donc sans repliement), passées dans un passe-bas dont
 * la fréquence retombe après l'attaque. Brillant sans être agressif.
 */
function sawChord(freqs: number[], seconds: number, rng: Rng): Float32Array {
  const len = Math.floor(seconds * SR);
  const out = new Float32Array(len);
  for (const f0 of freqs) {
    for (const detune of [0.994, 1, 1.006]) {
      const f = f0 * detune;
      const maxK = Math.min(24, Math.floor((SR * 0.4) / f));
      for (let k = 1; k <= maxK; k++) {
        const d = (f * k) / SR;
        const amp = 1 / k;
        let ph = rng();
        for (let n = 0; n < len; n++) {
          out[n] += sinTurns(ph) * amp;
          ph += d;
        }
      }
    }
  }
  const lp = new Biquad("lowpass", 4000, 0.9);
  const attack = Math.floor(0.004 * SR);
  const release = Math.floor(0.03 * SR);
  const scale = 0.12 / Math.max(1, freqs.length);
  for (let n = 0; n < len; n++) {
    if (n % 32 === 0) lp.set("lowpass", 800 + 3000 * Math.exp(-n / (SR * 0.07)), 0.9);
    let x = lp.process(out[n]) * scale;
    if (n < attack) x *= n / attack;
    if (n > len - release) x *= (len - n) / release;
    out[n] = x;
  }
  return out;
}

/** Basse synthétique ronde et mordante : dent de scie filtrée, attaque nette. */
function synthBass(freq: number, seconds: number): Float32Array {
  const len = Math.floor(seconds * SR);
  const out = new Float32Array(len);
  const lp = new Biquad("lowpass", 600, 1.1);
  const release = Math.floor(0.02 * SR);
  const phases = [0, 0, 0, 0, 0, 0];
  for (let n = 0; n < len; n++) {
    let x = 0;
    for (let k = 1; k <= 6; k++) {
      x += sinTurns(phases[k - 1]) / k;
      phases[k - 1] += (freq * k) / SR;
    }
    if (n % 32 === 0) lp.set("lowpass", 260 + 900 * Math.exp(-n / (SR * 0.05)), 1.1);
    const env = Math.min(1, n / 60) * (n > len - release ? (len - n) / release : 1) * (0.75 + 0.25 * Math.exp(-n / (SR * 0.1)));
    out[n] = lp.process(x) * env;
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
  const len = Math.floor(0.32 * SR);
  const out = new Float32Array(len);
  let p = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 48 + 120 * Math.exp(-t * 38);
    const amp = Math.exp(-t * 9) * (n < 30 ? n / 30 : 1);
    out[n] = Math.tanh(sinTurns(p) * amp * 1.6) + (n < 90 ? (1 - n / 90) * 0.15 * Math.sin(n * 0.9) : 0);
    p += f / SR;
  }
  return out;
}

/** Clap : trois rafales de bruit rapprochées puis une courte queue. */
function clap(rng: Rng): Float32Array {
  const len = Math.floor(0.22 * SR);
  const out = new Float32Array(len);
  const bp = new Biquad("bandpass", 1400, 0.8);
  const hp = new Biquad("highpass", 600, 0.7);
  const bursts = [0, 0.01, 0.021];
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    let env = Math.exp(-(t - 0.028) * 24) * 0.75;
    for (const b of bursts) if (t >= b && t < b + 0.01) env = Math.max(env, Math.exp(-(t - b) * 230));
    out[n] = hp.process(bp.process((rng() * 2 - 1) * env)) * 2.4;
  }
  return out;
}

/** Charleston fermé (court) ou ouvert (qui résonne). */
function hat(rng: Rng, open: boolean): Float32Array {
  const len = Math.floor((open ? 0.22 : 0.05) * SR);
  const out = new Float32Array(len);
  const hp = new Biquad("highpass", 7500, 0.8);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = Math.min(1, t / 0.002) * Math.exp(-t * (open ? 16 : 90));
    out[n] = hp.process(rng() * 2 - 1) * env;
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

/** Accords (demi-tons au-dessus de do 4) : la mineur 7, fa, do, sol — vi–IV–I–V. */
const CHORDS: number[][] = [
  [-3, 0, 4, 7],
  [-7, 0, 5, 9],
  [-5, 0, 4, 7],
  [-5, -1, 2, 7],
];
/** Fondamentale de chaque accord (demi-tons), pour la basse. */
const BASS_ROOTS = [9, 5, 0, 7];
/** Basse en croches : fondamentale et octave, façon pop entraînante. */
const BASS_PATTERN = [0, 0, 12, 0, 0, 12, 0, 12];

/** Mélodie pincée de la seconde moitié (demi-tons au-dessus de do 5). */
const HOOK: Note[][] = [
  [[0, 12, 0.5], [0.5, 12, 0.5], [1, 11, 0.5], [1.5, 12, 1], [2.5, 16, 0.5], [3, 14, 1]],
  [[0, 12, 0.5], [0.5, 9, 1], [1.5, 9, 0.5], [2, 12, 0.5], [2.5, 14, 0.5], [3, 12, 1]],
  [[0, 16, 0.5], [0.5, 16, 0.5], [1, 14, 0.5], [1.5, 16, 1], [2.5, 19, 0.5], [3, 16, 1]],
  [[0, 14, 1], [1, 11, 0.5], [1.5, 14, 0.5], [2, 19, 1.5], [3.5, 17, 0.5]],
  [[0, 12, 0.5], [0.5, 12, 0.5], [1, 11, 0.5], [1.5, 12, 1], [2.5, 16, 0.5], [3, 14, 1]],
  [[0, 12, 0.5], [0.5, 9, 1], [1.5, 9, 0.5], [2, 12, 0.5], [2.5, 14, 0.5], [3, 12, 1]],
  [[0, 16, 0.5], [0.5, 19, 0.5], [1, 21, 1], [2, 19, 0.5], [2.5, 16, 0.5], [3, 14, 1]],
  [[0, 14, 1.5], [1.5, 12, 0.5], [2, 11, 1], [3, 7, 1]],
];

/** Tonalités possibles (décalage depuis do), choisies par la graine. */
const KEYS = [0, 2, -3, -5, -2];

/** Section d'une mesure : montée d'ouverture, couplet, pause (breakdown), refrain, envolée finale. */
type Section = "build" | "verse" | "break" | "chorus" | "lift";

/**
 * Arrangement : une mesure de montée (la vidéo s'ouvre sur la signature du
 * logo), le « drop » juste après l'accroche, puis un cycle de 28 mesures —
 * 8 de couplet, 4 de pause, 8 de refrain avec la mélodie, 8 d'envolée
 * (mélodie doublée à l'octave, charleston plus dense) pour la fin.
 */
function sectionOf(bar: number): Section {
  if (bar === 0) return "build";
  const k = (bar - 1) % 28;
  return k < 8 ? "verse" : k < 12 ? "break" : k < 20 ? "chorus" : "lift";
}

/** Souffle qui monte (bruit filtré dont la fréquence grimpe) sur `seconds`. */
function riser(seconds: number, rng: Rng): Float32Array {
  const len = Math.floor(seconds * SR);
  const out = new Float32Array(len);
  const bp = new Biquad("bandpass", 400, 1.4);
  for (let n = 0; n < len; n++) {
    const x = n / len;
    if (n % 32 === 0) bp.set("bandpass", 400 + 7000 * x * x, 1.4);
    out[n] = bp.process(rng() * 2 - 1) * x * x * 1.6;
  }
  return out;
}

/** Cymbale (crash) : bruit aigu à longue queue, pour marquer le drop. */
function crash(rng: Rng): Float32Array {
  const len = Math.floor(1.8 * SR);
  const out = new Float32Array(len);
  const hp = new Biquad("highpass", 4500, 0.7);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    out[n] = hp.process(rng() * 2 - 1) * Math.exp(-t * 2.2) * Math.min(1, t / 0.003);
  }
  return out;
}

export function renderMusicWav({ seconds, seed = 1, bpm = DEFAULT_MUSIC_BPM }: MusicOptions): Uint8Array {
  const rng = mulberry32(seed * 7919 + 13);
  const key = KEYS[(Math.abs(Math.floor(seed)) + KEYS.length - 1) % KEYS.length];
  const beat = 60 / Math.max(60, Math.min(160, bpm));
  const bar = beat * 4;
  // Durée arrondie à 4 mesures, plafonnée à 20 minutes.
  const unitBars = 4;
  const bars = Math.min(Math.ceil(Math.max(0.1, seconds) / (bar * unitBars)) * unitBars, Math.floor((20 * 60) / bar));
  const total = Math.round(bars * bar * SR);
  // Une mesure de marge pour les queues de notes, retirée à la fin.
  const pad = Math.round(bar * SR);
  const bus = new LoopBus(total + pad);
  // Les accords passent par un bus à part, « pompé » par la grosse caisse.
  const pump = new LoopBus(total + pad);
  const at = (barIndex: number, beatPos: number) => Math.round((barIndex * bar + beatPos * beat) * SR);

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
  const closedHats = [hat(rng, false), hat(rng, false)];
  const openHat = hat(rng, true);
  const shakers = [shaker(rng, 0.8), shaker(rng, 0.45)];
  const crashSample = crash(rng);
  const riseSample = riser(bar, rng);
  const halfRise = riser(bar / 2, rng);
  const base = 60 + key;
  const melodyBase = 72 + key;
  const bassBase = 36 + key + (key < -2 ? 12 : 0);
  let kicks: number[] = [];

  for (let b = 0; b < bars; b++) {
    const section = sectionOf(b);
    const next = sectionOf(b + 1);
    const chord = (b + 3) % 4;
    const voicing = CHORDS[chord].map((st) => midiToFreq(base + 12 + st));
    const full = section === "verse" || section === "chorus" || section === "lift";
    const sung = section === "chorus" || section === "lift";

    // Accords : contretemps sur les parties pleines, tenus (nappe) en montée et en pause.
    const stab = cached(`stab:${chord}`, () => sawChord(voicing, 0.2, mulberry32(chord * 97 + seed)));
    if (full) for (let q = 0; q < 4; q++) pump.add(stab, at(b, q + 0.5), 0.8, q % 2 ? 0.25 : -0.25, 0.3);
    if (section !== "verse") {
      const pad = cached(`pad:${chord}`, () => padChord(CHORDS[chord].map((st) => midiToFreq(base + st)), bar));
      pump.add(pad, at(b, 0), section === "lift" ? 0.07 : sung ? 0.05 : 0.09, 0, 0.45);
    }
    if (section === "build") {
      // Accords égrenés en croches qui montent en intensité.
      for (let st = 0; st < 8; st++) pump.add(stab, at(b, st / 2), 0.25 + 0.06 * st, st % 2 ? 0.3 : -0.3, 0.35);
    }

    // Basse : croches pleines sur couplet et refrain, note tenue en pause.
    const root = bassBase + BASS_ROOTS[chord];
    if (full) {
      BASS_PATTERN.forEach((oct, step) => {
        const midi = root + oct;
        const note = cached(`bass:${midi}`, () => synthBass(midiToFreq(midi), beat * 0.45));
        bus.add(note, at(b, step / 2), step % 2 === 0 ? 0.34 : 0.26, 0, 0);
      });
    } else if (section === "break") {
      bus.add(cached(`bassLong:${root}`, () => synthBass(midiToFreq(root), bar * 0.95)), at(b, 0), 0.26, 0, 0);
    }

    // Mélodie pincée sur le refrain (et, plus douce, pendant la pause).
    if (sung || section === "break") {
      const phrase = HOOK[((b - 1) % 28) % 8];
      for (const [pos, semi, len] of phrase) {
        const midi = melodyBase + semi;
        const ring = Math.round(Math.max(len * beat + 0.15, 0.3) * SR);
        const pl = cached(`pl:${midi}`, () => pluck(midiToFreq(midi), 1.0, 0.75, mulberry32(midi * 31 + seed)));
        bus.add(pl, at(b, pos), sung ? 0.24 : 0.14, 0.12, 0.35, ring);
        if (section === "lift") {
          const hi = cached(`pl:${midi + 12}`, () => pluck(midiToFreq(midi + 12), 1.0, 0.8, mulberry32(midi * 37 + seed)));
          bus.add(hi, at(b, pos), 0.12, -0.2, 0.4, ring);
        }
        const gl = cached(`gl:${midi + 12}`, () => glock(midiToFreq(midi + 12), 0.9, 0.8));
        bus.add(gl, at(b, pos), sung ? 0.035 : 0.05, 0.3, 0.45);
      }
    }

    // Batterie.
    if (full) {
      for (let q = 0; q < 4; q++) {
        bus.add(kickSample, at(b, q), 0.62, 0, 0);
        kicks.push(at(b, q));
      }
      bus.add(claps[b % 2], at(b, 1), 0.2, -0.05, 0.25);
      bus.add(claps[(b + 1) % 2], at(b, 3), 0.22, 0.05, 0.25);
      for (let st = 0; st < 8; st++) {
        if (st % 2 === 1) bus.add(openHat, at(b, st / 2), 0.045, 0.3, 0.1);
        else bus.add(closedHats[(st / 2) % 2], at(b, st / 2), 0.035, 0.35, 0.05);
      }
      if (sung) for (let st = 0; st < 16; st++) bus.add(shakers[st % 2], at(b, st / 4), 0.035, -0.4, 0.05);
      if (section === "lift") for (let st = 0; st < 8; st++) bus.add(openHat, at(b, st / 2), 0.03, -0.3, 0.1);
    } else if (section === "break") {
      for (let st = 0; st < 8; st++) bus.add(closedHats[st % 2], at(b, st / 2), 0.03, 0.35, 0.1);
    }

    // Transitions : roulement de claps et souffle montant avant une reprise, crash sur le temps fort.
    const intoFull = (next === "verse" || next === "chorus" || next === "lift") && next !== section && (!full || next === "lift");
    if (section === "build" || (intoFull && b > 0)) {
      bus.add(section === "build" ? riseSample : halfRise, section === "build" ? at(b, 0) : at(b, 2), 0.16, 0, 0.2);
      for (let st = 0; st < 8; st++) bus.add(claps[st % 2], at(b, 2 + st / 4), 0.05 + 0.02 * st, st % 2 ? 0.2 : -0.2, 0.2);
    }
    if (full && sectionOf(b - 1) !== section) bus.add(crashSample, at(b, 0), 0.14, 0, 0.3);
  }

  // Respiration des accords : baisse brève après chaque grosse caisse.
  kicks = kicks.sort((x, y) => x - y);
  let k = 0;
  for (let i = 0; i < bus.length; i++) {
    while (k + 1 < kicks.length && kicks[k + 1] <= i) k++;
    const since = kicks.length && kicks[k] <= i ? (i - kicks[k]) / SR : 10;
    const g = 1 - 0.6 * Math.exp(-since / 0.09);
    bus.left[i] += pump.left[i] * g;
    bus.right[i] += pump.right[i] * g;
    bus.send[i] += pump.send[i] * g;
  }

  applyLoopReverb(bus.left, bus.right, bus.send, 0.22, false);
  master(bus.left, bus.right, 0.88);

  // Petit fondu sur les derniers instants (la vidéo gère son propre fondu de sortie).
  const left = bus.left.slice(0, total);
  const right = bus.right.slice(0, total);
  const fade = Math.min(total, Math.round(0.05 * SR));
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    left[total - 1 - i] *= g;
    right[total - 1 - i] *= g;
  }
  return encodeWav([left, right]);
}

// ---------------------------------------------------------------------------
// Bruitages

/** Pop net : petite bulle qui monte, avec un clic d'attaque. */
function renderPop(): Float32Array[] {
  const len = Math.floor(0.13 * SR);
  const out = new Float32Array(len);
  const rng = mulberry32(99);
  const hp = new Biquad("highpass", 2500, 0.7);
  let p = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 380 + 700 * (1 - Math.exp(-t * 70));
    const amp = Math.min(1, t / 0.0015) * Math.exp(-t * 34);
    const click = n < 80 ? hp.process(rng() * 2 - 1) * (1 - n / 80) * 0.35 : 0;
    out[n] = (sinTurns(p) * 0.9 + sinTurns(p * 2) * 0.1) * amp + click;
    p += f / SR;
  }
  return [out, out];
}

/** Whoosh net et brillant, qui traverse de gauche à droite. */
function renderWhoosh(): Float32Array[] {
  const seconds = 0.45;
  const len = Math.floor(seconds * SR);
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  const rng = mulberry32(4242);
  const bl = new Biquad("bandpass", 600, 1.2);
  const br = new Biquad("bandpass", 600, 1.2);
  for (let n = 0; n < len; n++) {
    const x = n / len;
    const f = 500 + 3000 * Math.sin(Math.PI * Math.min(1, x * 1.25)) ** 1.3;
    if (n % 32 === 0) {
      bl.set("bandpass", f, 1.2);
      br.set("bandpass", f * 1.08, 1.2);
    }
    // Montée rapide, retombée plus lente.
    const env = x < 0.35 ? (x / 0.35) ** 2 : Math.exp(-(x - 0.35) * 6);
    const noise = rng() * 2 - 1;
    left[n] = bl.process(noise) * env * Math.cos((x * Math.PI) / 2) * 2.6;
    right[n] = br.process(noise) * env * Math.sin((x * Math.PI) / 2) * 2.6;
  }
  return [left, right];
}

/** Impact brillant : coup sourd grave, souffle court et carillon qui s'envole. */
function renderSparkle(): Float32Array[] {
  const seconds = 2.2;
  const len = Math.floor(seconds * SR);
  const bus = new LoopBus(len + Math.floor(0.5 * SR));
  const thump = new Float32Array(Math.floor(0.4 * SR));
  const rng = mulberry32(777);
  const lp = new Biquad("lowpass", 900, 0.7);
  let p = 0;
  for (let n = 0; n < thump.length; n++) {
    const t = n / SR;
    const f = 40 + 70 * Math.exp(-t * 20);
    thump[n] = Math.tanh(sinTurns(p) * Math.exp(-t * 9) * 1.5) + lp.process(rng() * 2 - 1) * Math.exp(-t * 30) * 0.4;
    p += f / SR;
  }
  bus.add(thump, 0, 0.8, 0, 0.2);
  [88, 91, 96, 100, 103].forEach((midi, i) => {
    const s = glock(midiToFreq(midi), 1.4, 0.9);
    bus.add(s, Math.round((0.03 + i * 0.045) * SR), 0.34 - i * 0.03, i % 2 === 0 ? -0.4 : 0.4, 0.6);
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
  // Crêtes contenues : des bruitages nets qui accompagnent sans s'imposer.
  return encodeWav(normalize(channels, kind === "sparkle" ? 0.7 : 0.6));
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
