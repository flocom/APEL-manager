import "server-only";

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import type { InferenceSession, Tensor } from "onnxruntime-node";

import { HttpError } from "@/lib/auth/guards";

import { modelsRoot } from "./voice-files";
import type { SupertonicStyle } from "./voices";

/**
 * Voix naturelles : Supertonic 3 (Supertone Inc., licence OpenRAIL-M), un
 * modèle de synthèse par « flow matching » dont l'intonation est bien plus
 * vivante que celle de Piper, calculé sur le processeur du serveur par ONNX
 * Runtime. Une phrase de dix secondes se calcule en trois à cinq secondes sur
 * quatre cœurs.
 *
 * Le modèle (environ 380 Mo) n'est pas livré dans l'image : il est téléchargé
 * au premier usage depuis Hugging Face, à une révision figée, chaque fichier
 * vérifié par empreinte SHA-256, puis gardé dans le volume des fichiers.
 */

const REPOSITORY = "supertone-oss-archive/supertonic-3";
const REVISION = "aafc6e32416a594460b32413efc49d7fe4ce6d46";

const MODEL_FILES: Record<string, string> = {
  "onnx/duration_predictor.onnx":
    "c3eb91414d5ff8a7a239b7fe9e34e7e2bf8a8140d8375ffb14718b1c639325db",
  "onnx/text_encoder.onnx":
    "c7befd5ea8c3119769e8a6c1486c4edc6a3bc8365c67621c881bbb774b9902ff",
  "onnx/vector_estimator.onnx":
    "883ac868ea0275ef0e991524dc64f16b3c0376efd7c320af6b53f5b780d7c61c",
  "onnx/vocoder.onnx":
    "085de76dd8e8d5836d6ca66826601f615939218f90e519f70ee8a36ed2a4c4ba",
  "onnx/tts.json": "42078d3aef1cd43ab43021f3c54f47d2d75ceb4e75f627f118890128b06a0d09",
  "onnx/unicode_indexer.json":
    "9bf7346e43883a81f8645c81224f786d43c5b57f3641f6e7671a7d6c493cb24f",
  "voice_styles/F1.json": "bbdec6ee00231c2c742ad05483df5334cab3b52fda3ba38e6a07059c4563dbc2",
  "voice_styles/F3.json": "12f6ef2573baa2defa1128069cb59f203e3ab67c92af77b42df8a0e3a2f7c6ab",
  "voice_styles/M3.json": "ea1ac35ccb91b0d7ecad533a2fbd0eec10c91513d8951e3b25fbba99954e159b",
  "voice_styles/M4.json": "ca8eefad4fcd989c9379032ff3e50738adc547eeb5e221b82593a6d7b3bac303",
};

/**
 * Réglages de lecture. Douze pas de débruitage : au-delà, le gain ne s'entend
 * plus et le calcul s'allonge. Un débit légèrement relevé : le modèle, lu tel
 * quel, laisse de longues respirations qui ralentissent la vidéo.
 */
const DENOISING_STEPS = 12;
const SPEED = 1.15;
const PAUSE_BETWEEN_CHUNKS = 0.3;
const MAX_CHUNK_LENGTH = 300;

/** Libère la mémoire (plusieurs centaines de Mo) après dix minutes sans voix. */
const IDLE_RELEASE_MS = 10 * 60_000;

type Ort = typeof import("onnxruntime-node");

type Config = {
  ae: { sample_rate: number; base_chunk_size: number };
  ttl: { latent_dim: number; chunk_compress_factor: number };
};

type Style = { ttl: Tensor; dp: Tensor };

type Engine = {
  ort: Ort;
  config: Config;
  indexer: number[];
  durationPredictor: InferenceSession;
  textEncoder: InferenceSession;
  vectorEstimator: InferenceSession;
  vocoder: InferenceSession;
  directory: string;
  styles: Map<SupertonicStyle, Style>;
};

let addon: Promise<Ort> | null = null;

/** Le module natif d'ONNX Runtime existe pour Linux, macOS et Windows (x64, arm64). */
function loadAddon(): Promise<Ort> {
  addon ??= import("onnxruntime-node").catch((error: unknown) => {
    addon = null;
    throw error;
  });
  return addon;
}

export async function supertonicAvailable(): Promise<boolean> {
  try {
    await loadAddon();
    return true;
  } catch {
    return false;
  }
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  );
}

/**
 * Télécharge un fichier en flux (le plus gros pèse 250 Mo : il ne passe pas
 * par la mémoire) et vérifie son empreinte au passage.
 */
async function download(file: string, sha256: string, target: string) {
  const response = await fetch(
    `https://huggingface.co/${REPOSITORY}/resolve/${REVISION}/${file}`,
    { signal: AbortSignal.timeout(20 * 60_000) },
  );
  if (!response.ok || !response.body) {
    throw new HttpError(
      502,
      "Téléchargement de la voix naturelle impossible. Vérifiez que le serveur peut joindre huggingface.co, puis réessayez.",
    );
  }
  const hash = createHash("sha256");
  await mkdir(path.dirname(target), { recursive: true });
  await pipeline(
    Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
    new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      },
    }),
    createWriteStream(target, { mode: 0o600 }),
  );
  if (hash.digest("hex") !== sha256) {
    throw new HttpError(502, "La voix téléchargée est altérée : elle n'a pas été installée.");
  }
}

let installing: Promise<string> | null = null;

/** Dossier du modèle, téléchargé et vérifié au premier appel. */
function ensureModel(): Promise<string> {
  installing ??= (async () => {
    const root = modelsRoot();
    const directory = path.join(root, `supertonic-3-${REVISION.slice(0, 8)}`);
    if (await exists(directory)) return directory;
    // Téléchargement dans un dossier temporaire, renommé seulement une fois
    // complet : un téléchargement interrompu ne laisse pas un modèle à moitié
    // écrit que l'on croirait installé.
    const staging = path.join(root, `.supertonic-${process.pid}-${Date.now()}`);
    await mkdir(staging, { recursive: true, mode: 0o700 });
    try {
      for (const [file, sha256] of Object.entries(MODEL_FILES)) {
        await download(file, sha256, path.join(staging, file));
      }
      await rename(staging, directory);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
    return directory;
  })().catch((error: unknown) => {
    installing = null;
    throw error;
  });
  return installing;
}

let engine: Promise<Engine> | null = null;
let idleTimer: NodeJS.Timeout | null = null;

function loadEngine(): Promise<Engine> {
  engine ??= (async () => {
    const ort = await loadAddon();
    const directory = await ensureModel();
    const onnx = (name: string) => path.join(directory, "onnx", name);
    // Un cœur laissé au serveur web, qui continue de répondre pendant le calcul.
    const threads = Math.max(1, Math.min(4, os.availableParallelism() - 1));
    const options: InferenceSession.SessionOptions = {
      executionProviders: ["cpu"],
      graphOptimizationLevel: "all",
      intraOpNumThreads: threads,
      interOpNumThreads: 1,
    };
    const [durationPredictor, textEncoder, vectorEstimator, vocoder] = await Promise.all([
      ort.InferenceSession.create(onnx("duration_predictor.onnx"), options),
      ort.InferenceSession.create(onnx("text_encoder.onnx"), options),
      ort.InferenceSession.create(onnx("vector_estimator.onnx"), options),
      ort.InferenceSession.create(onnx("vocoder.onnx"), options),
    ]);
    const config = JSON.parse(await readFile(onnx("tts.json"), "utf8")) as Config;
    const indexer = JSON.parse(await readFile(onnx("unicode_indexer.json"), "utf8")) as number[];
    return {
      ort,
      config,
      indexer,
      durationPredictor,
      textEncoder,
      vectorEstimator,
      vocoder,
      directory,
      styles: new Map(),
    };
  })().catch((error: unknown) => {
    engine = null;
    throw error;
  });
  return engine;
}

function scheduleRelease() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    const current = engine;
    engine = null;
    void current
      ?.then((e) =>
        Promise.all(
          [e.durationPredictor, e.textEncoder, e.vectorEstimator, e.vocoder].map((s) =>
            s.release(),
          ),
        ),
      )
      .catch(() => undefined);
  }, IDLE_RELEASE_MS);
  idleTimer.unref();
}

async function loadStyle(e: Engine, name: SupertonicStyle): Promise<Style> {
  const cached = e.styles.get(name);
  if (cached) return cached;
  type Raw = { data: unknown[]; dims: number[] };
  const raw = JSON.parse(
    await readFile(path.join(e.directory, "voice_styles", `${name}.json`), "utf8"),
  ) as { style_ttl: Raw; style_dp: Raw };
  const tensor = (r: Raw) =>
    new e.ort.Tensor("float32", Float32Array.from(r.data.flat(Infinity) as number[]), r.dims);
  const style = { ttl: tensor(raw.style_ttl), dp: tensor(raw.style_dp) };
  e.styles.set(name, style);
  return style;
}

/**
 * Prépare le texte comme le modèle l'a appris : caractères décomposés,
 * symboles lus en toutes lettres, ponctuation collée au mot (la typographie
 * française met une espace avant « ! » et « ? », pas le modèle), point final.
 */
function prepareText(text: string): string {
  let t = text
    .replace(/[  ]/g, " ")
    .replace(/(\d)\s*€/g, "$1 euros")
    .replace(/€/g, " euros ")
    .replace(/(\d)\s*%/g, "$1 pour cent")
    .replace(/&/g, " et ")
    .replace(/[«»“”]/g, '"')
    .replace(/[‘’´`]/g, "'")
    .replace(/‑/g, "-")
    .replace(/[–—]/g, ", ")
    .replace(/…/g, "...")
    .replace(/[_[\]|/#→←]/g, " ")
    .normalize("NFKD");
  t = t
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[.!?;:,'")\]]$/.test(t)) t += ".";
  return `<fr>${t}</fr>`;
}

/** Découpe aux fins de phrase, en morceaux assez courts pour le modèle. */
function chunks(text: string): string[] {
  const sentences = text.trim().split(/(?<=[.!?…])\s+/);
  const out: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > MAX_CHUNK_LENGTH) {
      out.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) out.push(current);
  return out;
}

function gaussian(length: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 2) {
    const u1 = Math.max(1e-10, Math.random());
    const u2 = Math.random();
    const r = Math.sqrt(-2 * Math.log(u1));
    out[i] = r * Math.cos(2 * Math.PI * u2);
    if (i + 1 < length) out[i + 1] = r * Math.sin(2 * Math.PI * u2);
  }
  return out;
}

async function inferChunk(e: Engine, text: string, style: Style): Promise<Float32Array> {
  const { ort, config } = e;
  const ids: bigint[] = [];
  for (const char of prepareText(text)) {
    const id = e.indexer[char.codePointAt(0) ?? -1];
    if (typeof id === "number" && id >= 0) ids.push(BigInt(id));
  }
  const n = ids.length;
  const textIds = new ort.Tensor("int64", BigInt64Array.from(ids), [1, n]);
  const textMask = new ort.Tensor("float32", new Float32Array(n).fill(1), [1, 1, n]);

  const { duration } = await e.durationPredictor.run({
    text_ids: textIds,
    style_dp: style.dp,
    text_mask: textMask,
  });
  const seconds = (duration.data as Float32Array)[0] / SPEED;
  const { text_emb: textEmb } = await e.textEncoder.run({
    text_ids: textIds,
    style_ttl: style.ttl,
    text_mask: textMask,
  });

  const sampleRate = config.ae.sample_rate;
  const wavLength = Math.floor(seconds * sampleRate);
  const chunkSize = config.ae.base_chunk_size * config.ttl.chunk_compress_factor;
  const latentLength = Math.max(1, Math.ceil(wavLength / chunkSize));
  const latentDim = config.ttl.latent_dim * config.ttl.chunk_compress_factor;
  const latentShape = [1, latentDim, latentLength];
  const latentMask = new ort.Tensor(
    "float32",
    new Float32Array(latentLength).fill(1),
    [1, 1, latentLength],
  );
  const totalStep = new ort.Tensor("float32", Float32Array.of(DENOISING_STEPS), [1]);

  let latent = gaussian(latentDim * latentLength);
  for (let step = 0; step < DENOISING_STEPS; step++) {
    const { denoised_latent: denoised } = await e.vectorEstimator.run({
      noisy_latent: new ort.Tensor("float32", latent, latentShape),
      text_emb: textEmb,
      style_ttl: style.ttl,
      text_mask: textMask,
      latent_mask: latentMask,
      total_step: totalStep,
      current_step: new ort.Tensor("float32", Float32Array.of(step), [1]),
    });
    latent = Float32Array.from(denoised.data as Float32Array);
  }
  const { wav_tts: wav } = await e.vocoder.run({
    latent: new ort.Tensor("float32", latent, latentShape),
  });
  return (wav.data as Float32Array).slice(0, wavLength);
}

/**
 * Une seule synthèse à la fois : chacune occupe déjà plusieurs cœurs, et
 * l'écran demande les voix l'une après l'autre.
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/** Lance le téléchargement du modèle en arrière-plan, dès que la voix est choisie. */
export function prepareSupertonic(): Promise<void> {
  return ensureModel().then(() => undefined);
}

export async function synthesizeSupertonic(
  text: string,
  styleName: SupertonicStyle,
): Promise<{ samples: Float32Array; sampleRate: number }> {
  return enqueue(async () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    const e = await loadEngine();
    try {
      const style = await loadStyle(e, styleName);
      const sampleRate = e.config.ae.sample_rate;
      const pause = new Float32Array(Math.floor(PAUSE_BETWEEN_CHUNKS * sampleRate));
      const parts: Float32Array[] = [];
      for (const chunk of chunks(text)) {
        if (parts.length > 0) parts.push(pause);
        parts.push(await inferChunk(e, chunk, style));
      }
      const samples = new Float32Array(parts.reduce((sum, p) => sum + p.length, 0));
      let offset = 0;
      for (const part of parts) {
        samples.set(part, offset);
        offset += part.length;
      }
      return { samples, sampleRate };
    } finally {
      scheduleRelease();
    }
  });
}
