import "server-only";

import { createHash } from "node:crypto";

import { HttpError } from "@/lib/auth/guards";
import { readUpload, storedUploadIdFromUrl } from "@/lib/uploads";

/**
 * Le logo de l'association, tel qu'un client de messagerie peut l'afficher.
 *
 * Le fichier téléversé ne convient pas tel quel. Outlook pour Windows n'affiche
 * pas le WebP ; Gmail refuse le SVG ; et le moteur de Word ignore la taille
 * donnée en CSS à une image : il ne connaît que les attributs `width` et
 * `height`, à défaut desquels il l'affiche à sa taille réelle — un logo de
 * 2 000 px déborde alors de tout le message. D'où :
 *
 * - une route dédiée (/api/logo-email/…) qui sert le logo configuré en PNG,
 *   réduit au double de sa taille d'affichage pour rester net sur un écran
 *   haute densité sans peser dans la boîte de réception ;
 * - une taille d'affichage calculée ici, depuis les dimensions réelles du
 *   fichier, et écrite en attributs dans le message.
 *
 * Les deux côtés partagent `emailLogoSize` : le PNG servi a exactement la
 * proportion des attributs, sans quoi Outlook l'étirerait.
 */

export interface EmailLogo {
  /** URL absolue du PNG servi aux clients de messagerie. */
  url: string;
  /** Taille d'affichage, en pixels CSS. */
  width: number;
  height: number;
}

interface Dimensions {
  width: number;
  height: number;
}

/**
 * Hauteur visée : celle d'un logo dans un en-tête de lettre, lisible sans
 * écraser le titre du message.
 */
const DISPLAY_HEIGHT = 56;

/**
 * Plafond de largeur : un logo très allongé tient encore dans la carte d'un
 * téléphone de 320 px (320 − 2 × 12 de marge − 2 × 28 de retrait = 240).
 * Outlook, qui ne connaît pas `max-width`, n'a jamais un écran aussi étroit.
 */
const DISPLAY_MAX_WIDTH = 240;

/**
 * Au-delà, l'image n'est pas décodée : un PNG de quelques mégaoctets peut se
 * déplier en gigaoctets de mémoire. 40 millions de pixels, c'est déjà une
 * photo de 7 000 × 5 700 — bien plus qu'aucun logo.
 */
export const MAX_SOURCE_PIXELS = 40_000_000;

/**
 * Révision du rendu. À incrémenter si la taille ou le format du PNG changent :
 * elle entre dans l'URL, et les caches (le proxy d'images de Gmail en tête)
 * gardent sinon l'ancienne version pendant un an.
 */
const RENDER_REVISION = 1;

/** Taille d'affichage : hauteur fixe, largeur proportionnelle et plafonnée. */
export function emailLogoSize(source: Dimensions): Dimensions {
  // Jamais d'agrandissement : un petit logo étiré devient flou.
  let height = Math.min(DISPLAY_HEIGHT, source.height);
  let width = Math.round((source.width * height) / source.height);
  if (width > DISPLAY_MAX_WIDTH) {
    width = DISPLAY_MAX_WIDTH;
    height = Math.round((source.height * width) / source.width);
  }
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

/**
 * Empreinte du logo configuré, qui sert de nom au PNG. Un nouveau logo change
 * d'adresse : aucun cache ne peut le masquer derrière l'ancien.
 */
export function emailLogoVersion(logoUrl: string): string {
  return createHash("sha256")
    .update(`${RENDER_REVISION}:${logoUrl}`)
    .digest("hex")
    .slice(0, 16);
}

/** Lit l'orientation EXIF d'un segment APP1 (1 = normale). */
function exifOrientation(data: Buffer, start: number, end: number): number {
  if (data.toString("latin1", start, start + 6) !== "Exif\0\0") return 1;
  const tiff = start + 6;
  if (tiff + 8 > end) return 1;
  const order = data.toString("latin1", tiff, tiff + 2);
  if (order !== "II" && order !== "MM") return 1;
  const little = order === "II";
  const u16 = (at: number) =>
    little ? data.readUInt16LE(at) : data.readUInt16BE(at);
  const u32 = (at: number) =>
    little ? data.readUInt32LE(at) : data.readUInt32BE(at);
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return 1;
  const entries = u16(ifd);
  for (let index = 0; index < entries; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > end) return 1;
    if (u16(entry) === 0x0112) return u16(entry + 8);
  }
  return 1;
}

function jpegDimensions(data: Buffer): Dimensions | null {
  let orientation = 1;
  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1];
    // Octets de remplissage, puis marqueurs sans longueur.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    // Fin d'image ou début des données compressées : plus d'en-tête à lire.
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = data.readUInt16BE(offset + 2);
    const end = Math.min(data.length, offset + 2 + length);
    if (marker === 0xe1) {
      orientation = exifOrientation(data, offset + 4, end);
    }
    // SOF0 à SOF15, sauf DHT (C4), JPG (C8) et DAC (CC) qui partagent la plage.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      if (offset + 9 > data.length) return null;
      const height = data.readUInt16BE(offset + 5);
      const width = data.readUInt16BE(offset + 7);
      // Orientations 5 à 8 : l'image est tournée d'un quart de tour à
      // l'affichage. Le navigateur (et donc le site) la redresse ; le PNG
      // aussi. La taille doit suivre.
      return orientation >= 5 && orientation <= 8
        ? { width: height, height: width }
        : { width, height };
    }
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(data: Buffer): Dimensions | null {
  const chunk = data.toString("latin1", 12, 16);
  if (
    chunk === "VP8 " &&
    data.length >= 30 &&
    data[23] === 0x9d &&
    data[24] === 0x01 &&
    data[25] === 0x2a
  ) {
    return {
      width: data.readUInt16LE(26) & 0x3fff,
      height: data.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && data.length >= 25 && data[20] === 0x2f) {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X" && data.length >= 30) {
    return {
      width: data.readUIntLE(24, 3) + 1,
      height: data.readUIntLE(27, 3) + 1,
    };
  }
  return null;
}

/**
 * Dimensions d'un PNG, JPEG ou WebP, lues dans l'en-tête du fichier — les
 * trois formats que le scope `branding` accepte. Pas de décodage : cette
 * lecture a lieu à chaque e-mail construit.
 */
export function imageDimensions(data: Buffer): Dimensions | null {
  let dimensions: Dimensions | null = null;
  try {
    if (
      data.length >= 24 &&
      data.readUInt32BE(0) === 0x89504e47 &&
      data.toString("latin1", 12, 16) === "IHDR"
    ) {
      dimensions = { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
    } else if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
      dimensions = jpegDimensions(data);
    } else if (
      data.length >= 16 &&
      data.toString("latin1", 0, 4) === "RIFF" &&
      data.toString("latin1", 8, 12) === "WEBP"
    ) {
      dimensions = webpDimensions(data);
    }
  } catch {
    // En-tête tronqué : lecture hors limites.
    return null;
  }
  if (
    !dimensions ||
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width * dimensions.height > MAX_SOURCE_PIXELS
  ) {
    return null;
  }
  return dimensions;
}

/**
 * Le fichier du logo configuré et ses dimensions, ou `null` s'il n'y en a pas
 * d'exploitable. Seul un chemin du scope `branding` est lu : jamais une
 * adresse venue d'ailleurs.
 */
export async function readBrandingLogo(logoUrl: string | null | undefined) {
  if (!logoUrl) return null;
  const id = storedUploadIdFromUrl(logoUrl, "branding");
  const filename = logoUrl.split("/").pop();
  if (!id || !filename) return null;
  let file: Awaited<ReturnType<typeof readUpload>>;
  try {
    file = await readUpload(id, filename);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
  const dimensions = imageDimensions(file.data);
  return dimensions ? { ...file, dimensions } : null;
}

/**
 * Dimensions du logo en cours, gardées d'un envoi à l'autre : une diffusion
 * construit plusieurs messages, et le fichier peut peser jusqu'à la limite
 * des téléversements. Une seule entrée : il n'y a qu'un logo à la fois.
 */
let memo: { logoUrl: string; dimensions: Dimensions | null } | null = null;

/**
 * Le logo à placer en tête des e-mails, ou `null` — auquel cas le message
 * garde l'en-tête d'avant, sans case vide ni image cassée.
 *
 * Il faut un logo configuré *et* une adresse absolue du site : une URL
 * relative ne mène nulle part depuis une boîte de réception.
 */
export async function emailLogo(
  logoUrl: string | null | undefined,
  baseUrl: string,
): Promise<EmailLogo | null> {
  if (!logoUrl || !/^https?:\/\/[^/]/i.test(baseUrl)) return null;
  try {
    if (memo?.logoUrl !== logoUrl) {
      const source = await readBrandingLogo(logoUrl);
      memo = { logoUrl, dimensions: source?.dimensions ?? null };
    }
    if (!memo.dimensions) return null;
    return {
      url: `${baseUrl.replace(/\/+$/, "")}/api/logo-email/${emailLogoVersion(logoUrl)}.png`,
      ...emailLogoSize(memo.dimensions),
    };
  } catch (error) {
    // Un message sans logo vaut mieux qu'un message qui ne part pas.
    console.warn(
      "[email] logo illisible, envoi sans logo :",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
