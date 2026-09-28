import "server-only";

import path from "node:path";

/**
 * Outils communs aux voix intégrées : où ranger les modèles, et comment
 * transformer des échantillons en fichier WAV prêt à mixer.
 */

/**
 * Les modèles sont gardés dans le volume des fichiers (`UPLOADS_DIR/.voix`),
 * qui survit aux mises à jour. Le nettoyage des orphelins ne touche pas ce
 * dossier : son nom n'est pas celui d'un dépôt.
 */
export function modelsRoot(): string {
  const configured = process.env.TTS_MODELS_DIR?.trim();
  if (configured) return path.resolve(configured);
  const uploads =
    process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), "data/uploads");
  return path.resolve(uploads, ".voix");
}

/**
 * Ramène le pic à −1 dB : la voix passe au-dessus de la musique sans qu'on ait
 * à y penser, quel que soit le modèle qui l'a produite.
 */
export function normalizePeak(samples: Float32Array): Float32Array {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak < 1e-4) return samples;
  const gain = 0.89 / peak;
  return samples.map((s) => s * gain);
}

/**
 * Retire les silences de tête et de queue (les voix naturelles en laissent une
 * demi-seconde de chaque côté, soit une dizaine de secondes perdues sur la
 * vidéo), en gardant une courte marge pour que l'attaque et la fin de la voix
 * restent naturelles.
 */
export function trimSilence(samples: Float32Array, sampleRate: number): Float32Array {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak < 1e-4) return samples;
  const threshold = peak * 0.01; // −40 dB sous le pic
  let first = 0;
  while (first < samples.length && Math.abs(samples[first]) < threshold) first++;
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]) < threshold) last--;
  const start = Math.max(0, first - Math.round(0.08 * sampleRate));
  const end = Math.min(samples.length, last + 1 + Math.round(0.18 * sampleRate));
  return samples.subarray(start, end);
}

/** Échantillons flottants → WAV PCM 16 bits mono. */
export function toWav(samples: Float32Array, sampleRate: number): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
