import "server-only";

/**
 * Lecture du texte d'un PDF, avec la position de chaque morceau sur la page.
 *
 * Un relevé bancaire est un tableau : la colonne où tombe un montant dit s'il
 * s'agit d'un débit ou d'un crédit. Le texte seul ne suffit donc pas, il faut
 * ses coordonnées. On s'appuie sur pdf.js (Mozilla), qui tourne ici dans le
 * processus du serveur, sans fil d'exécution séparé ni rendu graphique.
 *
 * Le fichier vient d'un utilisateur : on le traite comme hostile. pdf.js 6 ne
 * compile plus rien à la volée (aucun `eval` ni `new Function`, la faille
 * CVE-2024-4367 est corrigée depuis la 4.2.67), ne charge aucune police, n'exécute
 * aucun script du document ; on borne en plus la taille, le nombre de pages,
 * la quantité de texte et la durée de lecture.
 */

/** Au-delà, ce n'est plus un relevé mensuel : on refuse sans lire. */
export const PDF_MAX_BYTES = 10 * 1024 * 1024;
export const PDF_MAX_PAGES = 30;
/** Un relevé compte quelques centaines de morceaux par page, pas davantage. */
const MAX_TEXT_ITEMS = 100_000;
const READ_TIMEOUT_MS = 20_000;

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

type Matrix = [number, number, number, number, number, number];

function multiply(m1: number[], m2: number[]): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/** Espaces insécables et fines : un montant « 1 234,56 » doit rester lisible. */
function normalizeSpaces(text: string): string {
  return text.replace(/[   \t]/g, " ");
}

function metadataString(info: Record<string, unknown>, key: string): string | null {
  const value = info[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Charge pdf.js une seule fois. Le moteur est importé d'abord : il s'inscrit
 * dans `globalThis.pdfjsWorker`, et pdf.js l'utilise alors directement au
 * lieu de chercher à lancer un fil d'exécution à partir d'un chemin de fichier
 * — chemin que la construction de Next ne garantit pas.
 */
let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

/**
 * À son chargement, pdf.js cherche @napi-rs/canvas (moteur de dessin natif,
 * retiré de l'image Docker) et annonce son absence : « rendering may be
 * broken ». On ne dessine rien, on lit du texte ; ces trois avertissements
 * inquiéteraient pour rien qui lit le journal du serveur.
 */
const CANVAS_WARNING = /^Warning: Cannot (?:load "@napi-rs\/canvas"|polyfill `(?:DOMMatrix|Path2D)`)/;

function loadPdfjs() {
  pdfjsPromise ??= (async () => {
    await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    const warn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === "string" && CANVAS_WARNING.test(args[0])) return;
      warn(...args);
    };
    try {
      return await import("pdfjs-dist/legacy/build/pdf.mjs");
    } finally {
      console.warn = warn;
    }
  })();
  // Un échec de chargement ne doit pas rester en cache : on retentera.
  pdfjsPromise.catch(() => {
    pdfjsPromise = null;
  });
  return pdfjsPromise;
}

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
      height: Math.max(...cluster.map((item) => item.height)),
      x0: words[0]?.x0 ?? cluster[0].x,
      x1: words.at(-1)?.x1 ?? cluster[0].x,
      text: words.map((word) => word.text).join(" "),
      words,
    };
  });
}

async function withTimeout<T>(promise: Promise<T>, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(
        new PdfTextError(
          "timeout",
          "La lecture du PDF a pris trop de temps : le fichier est peut-être endommagé.",
        ),
      );
    }, READ_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extrait le texte positionné de chaque page d'un PDF.
 *
 * Seul le texte horizontal est gardé : les mentions imprimées de biais dans la
 * marge (codes de tri postal) n'ont rien à faire dans un tableau.
 */
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

  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({
    // Copie : pdf.js peut s'approprier le tampon qu'on lui confie.
    data: new Uint8Array(pdf),
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

  const read = async (): Promise<PdfText> => {
    let doc;
    try {
      doc = await loadingTask.promise;
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "PasswordException") {
        throw new PdfTextError(
          "encrypted",
          "Ce PDF est protégé par un mot de passe. Téléchargez le relevé sans protection depuis votre banque en ligne.",
        );
      }
      throw new PdfTextError("invalid", "Ce fichier n’est pas un PDF lisible, ou il est endommagé.");
    }

    const { info } = await doc.getMetadata();
    const infoRecord = (info ?? {}) as Record<string, unknown>;
    // Un PDF chiffré sans mot de passe d'ouverture s'ouvre quand même : un
    // relevé authentique ne l'est pas, on le refuse aussi.
    if (infoRecord.EncryptFilterName) {
      throw new PdfTextError(
        "encrypted",
        "Ce PDF est chiffré. Téléchargez le relevé sans protection depuis votre banque en ligne.",
      );
    }
    if (doc.numPages > PDF_MAX_PAGES) {
      throw new PdfTextError(
        "too_many_pages",
        `Ce PDF compte ${doc.numPages} pages, au-delà des ${PDF_MAX_PAGES} admises pour un relevé.`,
      );
    }

    const pages: PdfPageText[] = [];
    let itemCount = 0;
    for (let number = 1; number <= doc.numPages; number += 1) {
      const page = await doc.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const raw of content.items) {
        if (!("str" in raw)) continue;
        const text = normalizeSpaces(raw.str);
        if (!text.trim()) continue;
        // Coordonnées de l'écran : origine en haut, rotation de page appliquée.
        const [a, b, c, d, x, y] = multiply(viewport.transform, raw.transform);
        const horizontal = a > 0 && d < 0 && Math.abs(b) < 1e-3 && Math.abs(c) < 1e-3;
        if (!horizontal) continue;
        items.push({ page: number, x, y, width: raw.width, height: Math.abs(d), text });
      }
      itemCount += items.length;
      if (itemCount > MAX_TEXT_ITEMS) {
        throw new PdfTextError("too_large", "Ce PDF contient trop de texte pour un relevé bancaire.");
      }
      pages.push({
        page: number,
        width: viewport.width,
        height: viewport.height,
        items,
        lines: groupLines(items),
      });
      page.cleanup();
    }

    return {
      pages,
      metadata: {
        author: metadataString(infoRecord, "Author"),
        creator: metadataString(infoRecord, "Creator"),
        producer: metadataString(infoRecord, "Producer"),
        title: metadataString(infoRecord, "Title"),
      },
    };
  };

  // Un fichier endommagé peut s'ouvrir puis échouer page par page, avec des
  // exceptions internes de pdf.js : l'appelant n'en reçoit qu'une, la nôtre.
  const reading = read().catch((error: unknown) => {
    if (error instanceof PdfTextError) throw error;
    throw new PdfTextError("invalid", "Ce fichier n’est pas un PDF lisible, ou il est endommagé.");
  });
  // Passé le délai, la lecture abandonnée finit par échouer : sans ce témoin,
  // son rejet remonterait comme une erreur non traitée du processus.
  reading.catch(() => undefined);
  try {
    return await withTimeout(reading, () => void loadingTask.destroy());
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}
