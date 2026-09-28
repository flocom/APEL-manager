import "server-only";

import { createHash } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { Worker } from "node:worker_threads";

import type { OfflineTts } from "sherpa-onnx-node";
import { extract } from "tar-stream";

import { HttpError } from "@/lib/auth/guards";

import {
  prepareSupertonic,
  supertonicAvailable,
  synthesizeSupertonic,
} from "./supertonic";
import { modelsRoot, normalizePeak, toWav, trimSilence } from "./voice-files";
import {
  INTEGRATED_VOICES,
  type IntegratedEngine,
  type IntegratedVoiceId,
} from "./voices";

export {
  DEFAULT_INTEGRATED_VOICE,
  INTEGRATED_VOICES,
  isIntegratedVoice,
  type IntegratedVoiceId,
} from "./voices";

/**
 * Voix off intégrée : des voix françaises open source, calculées sur le
 * processeur du serveur. Ni clé d'API, ni service tiers, ni carte graphique.
 *
 * - Supertonic 3 (voix naturelles) : voir `supertonic.ts`.
 * - Piper (voix légères), par sherpa-onnx : une phrase de dix secondes se
 *   calcule en une seconde environ. Les modèles ne sont pas livrés dans
 *   l'image (80 à 90 Mo chacun) : ils sont téléchargés au premier usage depuis
 *   les versions publiées de sherpa-onnx, vérifiés par empreinte SHA-256, puis
 *   gardés dans le volume des fichiers (`UPLOADS_DIR/.voix`).
 */

type ModelId = "siwis" | "upmc";

const MODELS: Record<
  ModelId,
  { archive: string; file: string; sha256: string; license: string }
> = {
  siwis: {
    archive: "vits-piper-fr_FR-siwis-medium",
    file: "fr_FR-siwis-medium",
    sha256: "375909aa30842b3a4efa10b1beb1d761af792960ae6873b4d53889f96c66195b",
    license: "CC-BY 4.0",
  },
  upmc: {
    archive: "vits-piper-fr_FR-upmc-medium",
    file: "fr_FR-upmc-medium",
    sha256: "e9830a331a16f6cc5ef3116a287065e015d3495c3f56b974889a266da7f89a7f",
    license: "CC-BY-SA 4.0",
  },
};

const RELEASE_URL =
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models";

let addon: Promise<typeof import("sherpa-onnx-node")> | null = null;

/**
 * Le module natif n'existe que pour Linux, macOS et Windows sur x64/arm64.
 * Ailleurs — ou sur un hébergement sans module natif —, la voix intégrée est
 * simplement indisponible, et l'écran le dit.
 */
function loadAddon() {
  addon ??= import("sherpa-onnx-node").catch((error: unknown) => {
    addon = null;
    throw error;
  });
  return addon;
}

async function piperAvailable(): Promise<boolean> {
  try {
    await loadAddon();
    return true;
  } catch {
    return false;
  }
}

/** Moteurs dont le module natif est présent sur ce serveur. */
export async function integratedEnginesAvailable(): Promise<
  Record<IntegratedEngine, boolean>
> {
  const [supertonic, piper] = await Promise.all([supertonicAvailable(), piperAvailable()]);
  return { supertonic, piper };
}

/**
 * bzip2 se décompresse en JavaScript pur (12 s pour un modèle) : dans un
 * thread à part, pour que le serveur continue de répondre pendant ce temps.
 */
function bunzipInWorker(data: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `const { parentPort, workerData } = require("node:worker_threads");
       const bunzip = require("seek-bzip");
       const out = bunzip.decode(Buffer.from(workerData));
       parentPort.postMessage(out, [out.buffer]);`,
      { eval: true, workerData: data },
    );
    worker.once("message", (out: Uint8Array) => resolve(Buffer.from(out)));
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`décompression interrompue (${code})`));
    });
  });
}

/** Extrait une archive tar dans `destination`, sans jamais en sortir. */
async function untar(data: Buffer, destination: string) {
  const root = path.resolve(destination);
  const extractor = extract();
  const done = new Promise<void>((resolve, reject) => {
    extractor.on("entry", (header, stream, next) => {
      const target = path.resolve(root, header.name);
      const inside = target === root || target.startsWith(`${root}${path.sep}`);
      const write = async () => {
        if (!inside) return; // Chemin hors du dossier : ignoré.
        if (header.type === "directory") {
          await mkdir(target, { recursive: true });
        } else if (header.type === "file") {
          const chunks: Buffer[] = [];
          for await (const chunk of stream) chunks.push(chunk as Buffer);
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, Buffer.concat(chunks));
          return;
        }
      };
      write()
        .then(() => {
          stream.resume();
          next();
        })
        .catch(reject);
    });
    extractor.on("finish", resolve);
    extractor.on("error", reject);
  });
  Readable.from([data]).pipe(extractor);
  await done;
}

const downloads = new Map<ModelId, Promise<string>>();

/** Dossier du modèle, téléchargé et vérifié au premier appel. */
function ensureModel(id: ModelId): Promise<string> {
  const pending = downloads.get(id);
  if (pending) return pending;
  const task = (async () => {
    const model = MODELS[id];
    const root = modelsRoot();
    const directory = path.join(root, model.archive);
    const onnx = path.join(directory, `${model.file}.onnx`);
    if (await stat(onnx).then(() => true, () => false)) return directory;

    const response = await fetch(`${RELEASE_URL}/${model.archive}.tar.bz2`, {
      signal: AbortSignal.timeout(10 * 60_000),
    });
    if (!response.ok) {
      throw new HttpError(
        502,
        "Téléchargement de la voix intégrée impossible. Vérifiez que le serveur peut joindre github.com, puis réessayez.",
      );
    }
    const archive = Buffer.from(await response.arrayBuffer());
    const digest = createHash("sha256").update(archive).digest("hex");
    if (digest !== model.sha256) {
      throw new HttpError(502, "La voix téléchargée est altérée : elle n'a pas été installée.");
    }
    // Extraction dans un dossier temporaire, renommé seulement une fois
    // complet : un téléchargement interrompu ne laisse pas un modèle à moitié
    // écrit que l'on croirait installé.
    const staging = path.join(root, `.${model.archive}-${process.pid}-${Date.now()}`);
    await mkdir(staging, { recursive: true, mode: 0o700 });
    try {
      await untar(await bunzipInWorker(archive), staging);
      await rm(directory, { recursive: true, force: true });
      await rename(path.join(staging, model.archive), directory);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
    return directory;
  })();
  downloads.set(id, task);
  task.catch(() => downloads.delete(id));
  return task;
}

const engines = new Map<ModelId, Promise<OfflineTts>>();

function engine(id: ModelId): Promise<OfflineTts> {
  const cached = engines.get(id);
  if (cached) return cached;
  const task = (async () => {
    const { OfflineTts } = await loadAddon();
    const directory = await ensureModel(id);
    const file = MODELS[id].file;
    return OfflineTts.createAsync({
      model: {
        vits: {
          model: path.join(directory, `${file}.onnx`),
          tokens: path.join(directory, "tokens.txt"),
          dataDir: path.join(directory, "espeak-ng-data"),
        },
        numThreads: 2,
        provider: "cpu",
      },
      maxNumSentences: 2,
    });
  })();
  engines.set(id, task);
  task.catch(() => engines.delete(id));
  return task;
}

const UNAVAILABLE =
  "La voix intégrée n'est pas disponible sur ce serveur. Choisissez un service en ligne ou enregistrez votre voix.";

/**
 * Télécharge à l'avance le modèle d'une voix, pour que la première voix
 * générée n'ait pas à l'attendre. Les erreurs sont celles du téléchargement.
 */
export async function prepareIntegratedVoice(voice: IntegratedVoiceId): Promise<void> {
  const entry = INTEGRATED_VOICES[voice];
  if (entry.engine === "supertonic") {
    if (await supertonicAvailable()) await prepareSupertonic();
  } else if (await piperAvailable()) {
    await ensureModel(entry.model);
  }
}

/**
 * Lit une phrase avec une voix intégrée. Les voix Piper gardent leur débit
 * natif : la vidéo est rythmée, et un débit ralenti la rendait traînante. Les
 * deux moteurs sortent à des niveaux différents (Piper, −25 dB en moyenne) :
 * débarrassés de leurs silences et ramenés au même pic, ils passent au-dessus
 * de la musique de la même façon.
 */
export async function synthesizeIntegrated(
  text: string,
  voice: IntegratedVoiceId,
): Promise<Buffer> {
  const entry = INTEGRATED_VOICES[voice];
  try {
    if (entry.engine === "supertonic") {
      const audio = await synthesizeSupertonic(text, entry.style);
      return toWav(normalizePeak(trimSilence(audio.samples, audio.sampleRate)), audio.sampleRate);
    }
    const tts = await engine(entry.model);
    const audio = await tts.generateAsync({ text, sid: entry.speaker, speed: 1 });
    return toWav(normalizePeak(trimSilence(audio.samples, audio.sampleRate)), audio.sampleRate);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error("[communication] voix intégrée indisponible", error);
    throw new HttpError(503, UNAVAILABLE);
  }
}
