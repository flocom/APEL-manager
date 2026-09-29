/**
 * Moteur de pdf.js, chargé dans le processus du serveur (src/lib/banking/pdf-text.ts).
 * Le paquet ne publie pas de déclarations pour ce fichier : seul l'effet de son
 * chargement compte, il s'inscrit dans `globalThis.pdfjsWorker`.
 */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
