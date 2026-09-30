import "server-only";

import { Worker } from "node:worker_threads";

/**
 * Lecture du texte d'un PDF, avec la position de chaque morceau sur la page.
 *
 * Un relevé bancaire est un tableau : la colonne où tombe un montant dit s'il
 * s'agit d'un débit ou d'un crédit. Le texte seul ne suffit donc pas, il faut
 * ses coordonnées. On s'appuie sur pdf.js (Mozilla), sans rendu graphique.
 *
 * Le fichier vient d'un utilisateur : on le traite comme hostile. pdf.js 6 ne
 * compile plus rien à la volée (aucun `eval` ni `new Function`, la faille
 * CVE-2024-4367 est corrigée depuis la 4.2.67), ne charge aucune police, n'exécute
 * aucun script du document ; on borne en plus la taille, le nombre de pages,
 * la quantité de texte, la mémoire et la durée de lecture.
 *
 * pdf.js interprète le contenu d'une page d'un seul tenant, sans rendre la
 * main : dans le processus du serveur, un flux de page forgé (des millions
 * d'opérateurs compressés en quelques centaines de Ko) gelait tout le site
 * pendant des minutes, délai compris, puisque le minuteur ne pouvait plus
 * se déclencher, et pouvait épuiser sa mémoire. La lecture tourne donc dans
 * un fil d'exécution à part, au tas limité, que le fil principal, resté libre,
 * arrête net passé le délai.
 */

/** Au-delà, ce n'est plus un relevé mensuel : on refuse sans lire. */
export const PDF_MAX_BYTES = 10 * 1024 * 1024;
export const PDF_MAX_PAGES = 30;
/** Un relevé compte quelques centaines de morceaux par page, pas davantage. */
const MAX_TEXT_ITEMS = 100_000;
const READ_TIMEOUT_MS = 20_000;
/**
 * Tas du fil de lecture, en Mo. Un relevé de 30 pages en demande quelques
 * dizaines ; au-delà, le fil meurt seul sans toucher au serveur.
 */
const READER_HEAP_MB = 256;
/**
 * Tampons binaires du fil de lecture, en octets. Le plafond du tas ne les
 * compte pas : un flux compressé de quelques Mo peut se décompresser en
 * plusieurs Go, hors tas. Le fil principal les mesure donc lui-même et arrête
 * la lecture au-delà. Un relevé en prend quelques Mo (le fichier et ses flux).
 */
const READER_BUFFERS_BYTES = 128 * 1024 * 1024;
/**
 * À défaut de ces mesures (Node antérieur à 22.16), mémoire que le processus
 * peut prendre en plus pendant une lecture.
 */
const READER_EXTRA_RSS_BYTES = 512 * 1024 * 1024;
const MEMORY_CHECK_MS = 100;

/** Écart vertical toléré entre deux morceaux d'une même ligne, en points. */
const LINE_TOLERANCE = 2;

export type PdfTextErrorCode =
  | "invalid"
  | "encrypted"
  | "too_large"
  | "too_many_pages"
  | "timeout";

/** Refus de lecture, avec un message destiné à l'utilisateur. */
export class PdfTextError extends Error {
  readonly code: PdfTextErrorCode;

  constructor(code: PdfTextErrorCode, message: string) {
    super(message);
    this.name = "PdfTextError";
    this.code = code;
  }
}

/** Morceau de texte tel que pdf.js le rend, en points, origine en haut à gauche. */
export type PdfTextItem = {
  page: number;
  x: number;
  /** Ligne de base du texte, comptée depuis le haut de la page. */
  y: number;
  width: number;
  height: number;
  text: string;
};

/** Mot isolé dans un morceau. Sa position est estimée au prorata des caractères. */
export type PdfWord = { x0: number; x1: number; text: string };

export type PdfLine = {
  page: number;
  y: number;
  height: number;
  x0: number;
  x1: number;
  /** Mots de la ligne, de gauche à droite, séparés par une espace. */
  text: string;
  words: PdfWord[];
};

export type PdfPageText = {
  page: number;
  width: number;
  height: number;
  items: PdfTextItem[];
  lines: PdfLine[];
};

export type PdfMetadata = {
  author: string | null;
  creator: string | null;
  producer: string | null;
  title: string | null;
};

export type PdfText = { pages: PdfPageText[]; metadata: PdfMetadata };

/**
 * Découpe un morceau en mots. pdf.js regroupe souvent plusieurs mots d'un
 * même tracé (« VIR INST TRAILEURS SOLIDAIRES ») : le bord gauche du premier
 * et le bord droit du dernier sont exacts, ceux du milieu estimés.
 */
function splitWords(item: PdfTextItem): PdfWord[] {
  const words: PdfWord[] = [];
  const length = item.text.length;
  if (length === 0) return words;
  for (const match of item.text.matchAll(/\S+/g)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    words.push({
      x0: item.x + (item.width * start) / length,
      x1: item.x + (item.width * end) / length,
      text: match[0],
    });
  }
  return words;
}

/**
 * Regroupe les morceaux d'une page en lignes, de haut en bas. pdf.js les rend
 * dans l'ordre du flux du document, qui n'est pas l'ordre de lecture : sur les
 * relevés du Crédit Mutuel, l'en-tête du tableau arrive après les opérations.
 */
export function groupLines(items: PdfTextItem[]): PdfLine[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const clusters: PdfTextItem[][] = [];
  for (const item of sorted) {
    const current = clusters.at(-1);
    if (current && Math.abs(item.y - current[0].y) <= LINE_TOLERANCE) {
      current.push(item);
    } else {
      clusters.push([item]);
    }
  }
  return clusters.map((cluster) => {
    const words = cluster.flatMap(splitWords).sort((a, b) => a.x0 - b.x0);
    return {
      page: cluster[0].page,
      y: cluster[0].y,
      // Sans décomposition en arguments : une ligne forgée de 100 000 morceaux
      // dépasserait la pile.
      height: cluster.reduce((max, item) => Math.max(max, item.height), 0),
      x0: words[0]?.x0 ?? cluster[0].x,
      x1: words.at(-1)?.x1 ?? cluster[0].x,
      text: words.map((word) => word.text).join(" "),
      words,
    };
  });
}

/* ------------------------------------------------------------------------ */
/* Fil de lecture                                                            */
/* ------------------------------------------------------------------------ */

type ReaderPage = { page: number; width: number; height: number; items: PdfTextItem[] };

/** Réponse du fil de lecture : des données simples, les messages restent ici. */
type ReaderReply =
  | { ok: true; pages: ReaderPage[]; metadata: PdfMetadata }
  | { ok: false; code: "password" | "encrypted" | "invalid" | "too_large" }
  | { ok: false; code: "too_many_pages"; pages: number }
  | { ok: false; code: "engine"; detail: string };

/**
 * Code du fil de lecture, en JavaScript simple : il est évalué tel quel par
 * Node, hors de la construction de Next, qui ne peut donc ni le déplacer ni
 * perdre le chemin de pdf.js. Les modules sont cherchés depuis le dossier de
 * l'application, où se trouve node_modules en développement comme dans
 * l'image Docker.
 *
 * Le moteur de pdf.js est importé d'abord : il s'inscrit dans
 * `globalThis.pdfjsWorker`, et pdf.js l'utilise alors directement, dans ce
 * même fil, au lieu d'en lancer un autre.
 *
 * Seul le texte horizontal est gardé : les mentions imprimées de biais dans la
 * marge (codes de tri postal) n'ont rien à faire dans un tableau.
 */
const READER_SOURCE = String.raw`
"use strict";
const { parentPort, workerData } = require("node:worker_threads");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const { pdf, maxPages, maxItems } = workerData;
const reply = (message) => parentPort.postMessage(message);

// Refus attendu (fichier chiffré, trop de texte…) : distinct des exceptions
// internes de pdf.js, qui disent seulement que le fichier est illisible.
class Refusal extends Error {
  constructor(answer) {
    super(answer.code);
    this.answer = answer;
  }
}

// À son chargement, pdf.js cherche @napi-rs/canvas (moteur de dessin natif,
// retiré de l'image Docker) et annonce son absence : « rendering may be
// broken ». On ne dessine rien, on lit du texte ; ces avertissements
// inquiéteraient pour rien qui lit le journal du serveur.
const CANVAS_WARNING = /^Warning: Cannot (?:load "@napi-rs\/canvas"|polyfill \x60(?:DOMMatrix|Path2D)\x60)/;

async function loadPdfjs() {
  const resolve = createRequire(path.join(process.cwd(), "package.json")).resolve;
  const url = (name) => pathToFileURL(resolve(name)).href;
  await import(url("pdfjs-dist/legacy/build/pdf.worker.mjs"));
  const warn = console.warn;
  console.warn = (...args) => {
    if (typeof args[0] === "string" && CANVAS_WARNING.test(args[0])) return;
    warn(...args);
  };
  try {
    return await import(url("pdfjs-dist/legacy/build/pdf.mjs"));
  } finally {
    console.warn = warn;
  }
}

function multiply(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

// Espaces insécables et fines : un montant « 1 234,56 » doit rester lisible.
const normalizeSpaces = (text) => text.replace(/[   \t]/g, " ");

function metadataString(info, key) {
  const value = info[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Morceaux droits dans l'orientation donnée, en coordonnées de l'écran
// (origine en haut à gauche).
function upright(raws, viewport, number) {
  const items = [];
  for (const raw of raws) {
    const [a, b, c, d, x, y] = multiply(viewport.transform, raw.transform);
    const horizontal = a > 0 && d < 0 && Math.abs(b) < 1e-3 && Math.abs(c) < 1e-3;
    if (horizontal) items.push({ page: number, x, y, width: raw.width, height: Math.abs(d), text: raw.text });
  }
  return items;
}

async function read(pdfjs) {
  const loadingTask = pdfjs.getDocument({
    data: pdf,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    useWasm: false,
    enableXfa: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    stopAtErrors: true,
    // Seules les erreurs : un PDF bancal ne doit pas remplir le journal.
    verbosity: 0,
  });
  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    throw new Refusal({ ok: false, code: name === "PasswordException" ? "password" : "invalid" });
  }

  const { info } = await doc.getMetadata();
  const record = info ?? {};
  // Un PDF chiffré sans mot de passe d'ouverture s'ouvre quand même : un
  // relevé authentique ne l'est pas, on le refuse aussi.
  if (record.EncryptFilterName) throw new Refusal({ ok: false, code: "encrypted" });
  if (doc.numPages > maxPages) {
    throw new Refusal({ ok: false, code: "too_many_pages", pages: doc.numPages });
  }

  const pages = [];
  let itemCount = 0;
  for (let number = 1; number <= doc.numPages; number += 1) {
    const page = await doc.getPage(number);
    // Le texte arrive par paquets : le plafond est vérifié à chacun, sur tous
    // les morceaux, même vides ou de biais, avant que la page entière ne
    // s'accumule en mémoire.
    const raws = [];
    const reader = page.streamTextContent().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      itemCount += value.items.length;
      if (itemCount > maxItems) {
        await reader.cancel().catch(() => undefined);
        throw new Refusal({ ok: false, code: "too_large" });
      }
      for (const raw of value.items) {
        if (!("str" in raw)) continue;
        const text = normalizeSpaces(raw.str);
        if (text.trim()) raws.push({ text, transform: raw.transform, width: raw.width });
      }
    }
    // Une page tournée (/Rotate, souvent posé par une visionneuse qui a
    // « remis à l'endroit » puis enregistré) coucherait tout le texte si on
    // appliquait sa rotation. On retient l'orientation où le plus de texte
    // est droit, celle de l'affichage en cas d'égalité : un tableau n'est
    // jamais imprimé de biais, seuls quelques codes de marge le sont.
    let best = null;
    for (const rotation of new Set([page.rotate, 0, 90, 180, 270])) {
      const viewport = page.getViewport({ scale: 1, rotation });
      const items = upright(raws, viewport, number);
      if (!best || items.length > best.items.length) best = { viewport, items };
    }
    pages.push({ page: number, width: best.viewport.width, height: best.viewport.height, items: best.items });
    page.cleanup();
  }

  return {
    ok: true,
    pages,
    metadata: {
      author: metadataString(record, "Author"),
      creator: metadataString(record, "Creator"),
      producer: metadataString(record, "Producer"),
      title: metadataString(record, "Title"),
    },
  };
}

(async () => {
  let pdfjs;
  try {
    pdfjs = await loadPdfjs();
  } catch (error) {
    reply({ ok: false, code: "engine", detail: error instanceof Error ? error.message : String(error) });
    return;
  }
  try {
    reply(await read(pdfjs));
  } catch (error) {
    // Un fichier endommagé peut s'ouvrir puis échouer page par page, avec des
    // exceptions internes de pdf.js : l'appelant n'en reçoit qu'une, la nôtre.
    reply(error instanceof Refusal ? error.answer : { ok: false, code: "invalid" });
  }
})();
`;

const UNREADABLE = "Ce fichier n’est pas un PDF lisible, ou il est endommagé.";
const TOO_MUCH_TEXT = "Ce PDF contient trop de texte pour un relevé bancaire.";

/**
 * Lance un fil de lecture et attend sa réponse. Quoi qu'il arrive (réponse,
 * délai, mémoire épuisée, plantage), le fil est arrêté : rien ne continue à
 * tourner après le retour.
 */
function runReader(pdf: Uint8Array): Promise<ReaderReply> {
  return new Promise((resolve, reject) => {
    // Copie transférée au fil : le tampon de l'appelant reste intact.
    const data = new Uint8Array(pdf);
    const worker = new Worker(READER_SOURCE, {
      eval: true,
      workerData: { pdf: data, maxPages: PDF_MAX_PAGES, maxItems: MAX_TEXT_ITEMS },
      transferList: [data.buffer],
      resourceLimits: { maxOldGenerationSizeMb: READER_HEAP_MB, maxYoungGenerationSizeMb: 32 },
    });
    let settled = false;
    // On attend l'arrêt effectif du fil avant de répondre : sa mémoire est
    // rendue avant que la lecture suivante ne commence.
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(watchdog);
      worker.terminate().then(finish, finish);
    };
    const tooMuchMemory = () =>
      new PdfTextError(
        "too_large",
        "La lecture de ce PDF demande trop de mémoire pour un relevé bancaire : le fichier est peut-être endommagé.",
      );
    // La mémoire du fil lui-même, et non celle du processus : l'allocateur
    // garde ce qu'un fil arrêté a libéré, si bien qu'une limite relative au
    // processus montait d'une lecture à l'autre.
    const heapStatistics = (
      worker as Worker & { getHeapStatistics?: () => Promise<{ external_memory: number }> }
    ).getHeapStatistics?.bind(worker);
    const baseline = process.memoryUsage.rss();
    const watchdog = setInterval(() => {
      if (!heapStatistics) {
        if (process.memoryUsage.rss() - baseline > READER_EXTRA_RSS_BYTES) {
          settle(() => reject(tooMuchMemory()));
        }
        return;
      }
      heapStatistics().then(
        (stats) => {
          if (stats.external_memory > READER_BUFFERS_BYTES) settle(() => reject(tooMuchMemory()));
        },
        () => undefined,
      );
    }, MEMORY_CHECK_MS);
    // Le minuteur vit dans le fil principal, que pdf.js n'occupe plus : il se
    // déclenche à l'heure, même si la page lue ne rend jamais la main.
    const timer = setTimeout(() => {
      settle(() =>
        reject(
          new PdfTextError(
            "timeout",
            "La lecture du PDF a pris trop de temps : le fichier est peut-être endommagé.",
          ),
        ),
      );
    }, READ_TIMEOUT_MS);
    worker.once("message", (message: ReaderReply) => settle(() => resolve(message)));
    worker.once("error", (error: Error & { code?: string }) => {
      settle(() =>
        reject(
          error.code === "ERR_WORKER_OUT_OF_MEMORY"
            ? tooMuchMemory()
            : new PdfTextError("invalid", UNREADABLE),
        ),
      );
    });
    worker.once("exit", () => settle(() => reject(new PdfTextError("invalid", UNREADABLE))));
  });
}

/**
 * Une lecture à la fois : chacune peut prendre jusqu'à quelques centaines de
 * Mo, et des envois simultanés ne doivent pas les multiplier. La surveillance
 * de secours, sur la mémoire du processus, suppose d'ailleurs un seul fil à
 * la fois.
 */
let queue: Promise<unknown> = Promise.resolve();

function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/** Extrait le texte positionné de chaque page d'un PDF. */
export async function extractPdfText(pdf: Uint8Array): Promise<PdfText> {
  if (pdf.byteLength === 0) {
    throw new PdfTextError("invalid", "Le fichier est vide.");
  }
  if (pdf.byteLength > PDF_MAX_BYTES) {
    throw new PdfTextError(
      "too_large",
      `Le fichier dépasse ${PDF_MAX_BYTES / (1024 * 1024)} Mo : ce n’est pas un relevé mensuel.`,
    );
  }

  const result = await oneAtATime(() => runReader(pdf));
  if (result.ok) {
    return {
      pages: result.pages.map((page) => ({ ...page, lines: groupLines(page.items) })),
      metadata: result.metadata,
    };
  }
  switch (result.code) {
    case "password":
      throw new PdfTextError(
        "encrypted",
        "Ce PDF est protégé par un mot de passe. Téléchargez le relevé sans protection depuis votre banque en ligne.",
      );
    case "encrypted":
      throw new PdfTextError(
        "encrypted",
        "Ce PDF est chiffré. Téléchargez le relevé sans protection depuis votre banque en ligne.",
      );
    case "too_many_pages":
      throw new PdfTextError(
        "too_many_pages",
        `Ce PDF compte ${result.pages} pages, au-delà des ${PDF_MAX_PAGES} admises pour un relevé.`,
      );
    case "too_large":
      throw new PdfTextError("too_large", TOO_MUCH_TEXT);
    case "engine":
      // pdf.js introuvable ou cassé : une panne de l'installation, pas un
      // défaut du fichier. L'appelant la journalise.
      throw new Error(`pdf.js n’a pas pu être chargé : ${result.detail}`);
    default:
      throw new PdfTextError("invalid", UNREADABLE);
  }
}
