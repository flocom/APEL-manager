import "server-only";

import { createHash } from "node:crypto";

import { HttpError } from "@/lib/auth/guards";
import { configuredBaseUrl } from "@/lib/base-url";
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
 *   réduit au plus au double de sa taille d'affichage pour rester net sur un
 *   écran haute densité sans peser dans la boîte de réception ;
 * - une taille d'affichage calculée ici, depuis les dimensions réelles du
 *   fichier, et écrite en attributs dans le message.
 *
 * Les deux côtés partagent `emailLogoSize`, et le PNG est rendu dans la case
 * exacte des attributs : Outlook, qui s'y tient, étirerait sinon toute image
 * d'une autre proportion. Ils partagent aussi `emailLogoFile` : le message ne
 * montre le logo que si la route saura le servir.
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
 * Largeur minimale de la case : voir `emailLogoSize`. De quoi écrire le nom de
 * l'association sur deux ou trois lignes quand les images sont bloquées.
 */
const DISPLAY_MIN_WIDTH = 120;

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
const RENDER_REVISION = 3;

/**
 * Taille du logo lui-même à l'affichage : hauteur fixe, largeur
 * proportionnelle et plafonnée.
 */
function logoDisplaySize(source: Dimensions): Dimensions {
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
 * La case de l'image dans le message : ses attributs `width` et `height`.
 *
 * Celle du logo, sauf pour un logo haut et étroit : à 56 px de haut, un écusson
 * de 200 × 800 ne ferait que 14 px de large — un trait à l'écran, et, images
 * bloquées, un nom d'association coupé à la deuxième lettre. La case garde
 * donc une largeur minimale ; le PNG, rendu à sa taille, y place le logo à
 * gauche et à ses proportions, sur un blanc qui se confond avec la rangée.
 */
export function emailLogoSize(source: Dimensions): Dimensions {
  const logo = logoDisplaySize(source);
  return {
    width: Math.min(DISPLAY_MAX_WIDTH, Math.max(logo.width, DISPLAY_MIN_WIDTH)),
    height: logo.height,
  };
}

/**
 * Empreinte du logo configuré, qui sert de nom au PNG. Un nouveau logo change
 * d'adresse : aucun cache ne peut le masquer derrière l'ancien.
 *
 * La case y entre aussi. Sans sharp, le fichier d'origine part dans une case à
 * ses proportions ; avec, le PNG rendu remplit une case élargie. Si les deux
 * partageaient une adresse, un message envoyé pendant une absence de sharp
 * recevrait ensuite le PNG élargi dans sa case étroite, qu'Outlook respecte
 * à la lettre : le logo y serait écrasé.
 */
export function emailLogoVersion(logoUrl: string, size: Dimensions): string {
  return createHash("sha256")
    .update(`${RENDER_REVISION}:${logoUrl}:${size.width}x${size.height}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Orientation EXIF d'un bloc TIFF — celui d'un segment APP1 « Exif » d'un
 * JPEG, ou le bloc eXIf d'un PNG —, ou `null` s'il n'en porte pas.
 *
 * Même lecture que Chromium : l'étiquette 0x0112, de type SHORT, à valeur
 * unique. Une orientation que le navigateur ignore ne doit pas compter ici,
 * sans quoi le message et le site ne montreraient pas le même logo.
 */
function exifOrientation(
  data: Buffer,
  tiff: number,
  end: number,
): number | null {
  if (tiff + 8 > end) return null;
  const order = data.toString("latin1", tiff, tiff + 2);
  if (order !== "II" && order !== "MM") return null;
  const little = order === "II";
  const u16 = (at: number) =>
    little ? data.readUInt16LE(at) : data.readUInt16BE(at);
  const u32 = (at: number) =>
    little ? data.readUInt32LE(at) : data.readUInt32BE(at);
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return null;
  const entries = u16(ifd);
  for (let index = 0; index < entries; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > end) return null;
    if (u16(entry) === 0x0112 && u16(entry + 2) === 3 && u32(entry + 4) === 1) {
      return u16(entry + 8);
    }
  }
  return null;
}

/**
 * Orientations 5 à 8 : l'image est tournée d'un quart de tour à l'affichage.
 * Le navigateur (et donc le site) la redresse ; le PNG aussi. La taille doit
 * suivre.
 */
function oriented(
  width: number,
  height: number,
  orientation: number | null,
): Dimensions {
  return orientation !== null && orientation >= 5 && orientation <= 8
    ? { width: height, height: width }
    : { width, height };
}

function pngDimensions(data: Buffer): Dimensions | null {
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  // Le bloc eXIf précède les données d'image : on s'arrête au premier IDAT.
  let offset = 8;
  while (offset + 8 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("latin1", offset + 4, offset + 8);
    if (type === "IDAT" || type === "IEND") break;
    if (type === "eXIf") {
      const start = offset + 8;
      return oriented(
        width,
        height,
        exifOrientation(data, start, Math.min(data.length, start + length)),
      );
    }
    offset += 12 + length;
  }
  return { width, height };
}

function jpegDimensions(data: Buffer): Dimensions | null {
  let orientation: number | null = null;
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
    // Seul un APP1 « Exif » porte l'orientation. Un APP1 XMP le suit souvent
    // (exports de Lightroom, photos « Ultra HDR ») : il ne doit pas l'effacer.
    // La première trouvée l'emporte, comme dans le navigateur.
    if (
      marker === 0xe1 &&
      orientation === null &&
      data.toString("latin1", offset + 4, offset + 10) === "Exif\0\0"
    ) {
      orientation = exifOrientation(data, offset + 10, end);
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
      return oriented(
        data.readUInt16BE(offset + 7),
        data.readUInt16BE(offset + 5),
        orientation,
      );
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * Pas d'orientation lue ici : les navigateurs ignorent l'EXIF d'un WebP, et le
 * PNG n'en tient donc pas compte non plus.
 */
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
 * Dimensions affichées d'un PNG, JPEG ou WebP, lues dans l'en-tête du
 * fichier — les trois formats que le scope `branding` accepte. Pas de
 * décodage : cette lecture a lieu à chaque e-mail construit.
 */
function headerDimensions(data: Buffer): Dimensions | null {
  let dimensions: Dimensions | null = null;
  try {
    if (
      data.length >= 24 &&
      data.readUInt32BE(0) === 0x89504e47 &&
      data.toString("latin1", 12, 16) === "IHDR"
    ) {
      dimensions = pngDimensions(data);
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
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
    return null;
  }
  return dimensions;
}

type Sharp = typeof import("sharp");

/**
 * La bibliothèque d'images, chargée une fois pour toutes — ou `null` si son
 * binaire natif manque à l'installation. Chargée à la demande seulement : elle
 * n'a rien à faire dans les autres routes. Un binaire absent ne réapparaît pas
 * sans redémarrage : l'échec est retenu, et signalé une seule fois.
 */
let sharpCharge: Promise<Sharp | null> | null = null;

function chargerSharp(): Promise<Sharp | null> {
  sharpCharge ??= import("sharp").then(
    (module) => module.default,
    (error: unknown) => {
      console.warn(
        "[logo-email] sharp indisponible, logo non converti :",
        error instanceof Error ? error.message : error,
      );
      return null;
    },
  );
  return sharpCharge;
}

/** Vrai si le logo peut être converti en PNG sur ce serveur. */
export async function sharpDisponible(): Promise<boolean> {
  return (await chargerSharp()) !== null;
}

/**
 * Le PNG servi aux clients de messagerie, ou `null` si la bibliothèque
 * d'images ne se charge pas. Lève une erreur si le fichier ne se décode pas.
 */
export async function renderEmailLogo(source: {
  data: Buffer;
  contentType: string;
  dimensions: Dimensions;
}): Promise<Buffer | null> {
  const sharp = await chargerSharp();
  if (!sharp) return null;

  const box = emailLogoSize(source.dimensions);
  const logo = logoDisplaySize(source.dimensions);
  // Jusqu'au double de la taille d'affichage, net sur un écran haute densité —
  // mais jamais au-delà de ce que contient le fichier : l'agrandir le rendrait
  // flou sans rien apporter. Une échelle fractionnaire, pas un choix entre 1
  // et 2 : un logo de 1,8 fois la taille d'affichage retombait sinon à 1, flou
  // sur tous les écrans haute densité. Mesurée sur le logo et non sur la case,
  // plus large pour un logo étroit : c'est lui qu'il faut garder net.
  const scale = Math.max(
    1,
    Math.min(
      2,
      source.dimensions.width / logo.width,
      source.dimensions.height / logo.height,
    ),
  );
  let image = sharp(source.data, {
    limitInputPixels: MAX_SOURCE_PIXELS,
    // Un fichier tronqué ou abîmé est refusé ; un simple avertissement du
    // décodeur, que le navigateur passe sans rien montrer, ne l'est pas.
    failOn: "error",
  });
  // Redressé comme le navigateur le redresse sur le site : il suit l'EXIF d'un
  // JPEG ou d'un PNG, pas celui d'un WebP.
  if (source.contentType !== "image/webp") image = image.autoOrient();
  return (
    image
      .resize({
        width: Math.round(box.width * scale),
        height: Math.round(box.height * scale),
        // La case exacte des attributs, et non « au plus » : si le décodeur
        // voyait une autre proportion que l'en-tête, l'image s'y loge avec une
        // marge blanche au lieu d'être étirée par Outlook. À gauche, comme le
        // texte : c'est là que la case plus large qu'un logo étroit met le
        // blanc.
        fit: "contain",
        position: "left",
        background: "#ffffff",
      })
      // Posé sur blanc : les logos sont dessinés pour un fond clair. Un client
      // qui force le mode sombre assombrit la carte, pas l'image ; un logo
      // transparent aux lettres foncées y deviendrait invisible.
      .flatten({ background: "#ffffff" })
      .png({ compressionLevel: 9 })
      .toBuffer()
  );
}

/**
 * Pourquoi ce fichier ne peut pas devenir le logo, ou `null` s'il convient.
 *
 * Vérifié au téléversement, tant que l'administrateur est devant l'écran.
 * Après, un logo inexploitable ne se remarque plus que par son absence en
 * tête des e-mails — ou par une image cassée dans chacun d'eux.
 */
export async function brandingLogoProblem(
  data: Buffer,
  contentType: string,
): Promise<string | null> {
  const illisible =
    "Image illisible : le fichier semble abîmé. Réenregistrez-la depuis votre logiciel d’image, puis importez-la de nouveau.";
  const dimensions = headerDimensions(data);
  if (!dimensions) return illisible;
  if (dimensions.width * dimensions.height > MAX_SOURCE_PIXELS) {
    const format = new Intl.NumberFormat("fr-FR");
    return `Image trop grande pour un logo (${format.format(dimensions.width)} × ${format.format(dimensions.height)} pixels). Réduisez-la, par exemple à 1 000 pixels de large, puis importez-la de nouveau.`;
  }
  try {
    // Le rendu même des e-mails : ce qui passe ici s'y affichera.
    await renderEmailLogo({ data, contentType, dimensions });
  } catch {
    return illisible;
  }
  return null;
}

/** Ce que la route sert pour le logo configuré. */
export interface EmailLogoFile {
  /**
   * Les attributs `width` et `height` qui conviennent à ce fichier-ci : la
   * case du PNG rendu, ou la taille du logo lui-même pour le fichier d'origine.
   */
  size: Dimensions;
  body: Buffer;
  contentType: string;
  /**
   * Vrai pour le PNG rendu, qui peut se garder un an en cache ; faux pour le
   * fichier d'origine servi faute de sharp, qui doit céder la place au PNG dès
   * que sharp sera de retour.
   */
  definitif: boolean;
}

/**
 * Le fichier du logo configuré, ou `null` s'il n'est pas dans le scope
 * `branding` ou n'existe plus. Seul ce scope est lu : jamais une adresse venue
 * d'ailleurs.
 */
async function readBrandingFile(logoUrl: string) {
  const id = storedUploadIdFromUrl(logoUrl, "branding");
  const filename = logoUrl.split("/").pop();
  if (!id || !filename) return null;
  try {
    return await readUpload(id, filename);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

async function prepareEmailLogoFile(
  logoUrl: string,
): Promise<EmailLogoFile | null> {
  // Une fois par logo, pas à chaque message : assez pour qu'un administrateur
  // trouve au journal pourquoi les e-mails partent sans, sans le noyer.
  const refuser = (motif: string) => {
    console.warn(
      `[logo-email] logo configuré écarté des e-mails (${motif}) : ${logoUrl}`,
    );
    return null;
  };

  const source = await readBrandingFile(logoUrl);
  if (!source) return refuser("fichier introuvable");
  const dimensions = headerDimensions(source.data);
  if (!dimensions) return refuser("en-tête illisible, fichier abîmé");
  if (dimensions.width * dimensions.height > MAX_SOURCE_PIXELS) {
    return refuser(
      `${dimensions.width} × ${dimensions.height} pixels, au-delà de la limite de ${MAX_SOURCE_PIXELS / 1_000_000} millions`,
    );
  }

  if (!(await sharpDisponible())) {
    // Sans sharp, un PNG ou un JPEG d'origine s'affiche encore partout — plus
    // lourd, mais présent. Un WebP, non : Outlook pour Windows n'en montrerait
    // qu'une case vide.
    if (source.contentType === "image/webp") {
      return refuser("WebP, que sharp absent ne peut convertir en PNG");
    }
    return {
      // Pas la case à largeur minimale : ce fichier-là n'a pas de marge
      // blanche pour la remplir, et Outlook étirerait un écusson étroit à sa
      // largeur.
      size: logoDisplaySize(dimensions),
      body: source.data,
      contentType: source.contentType,
      definitif: false,
    };
  }

  let rendu: Buffer | null;
  try {
    rendu = await renderEmailLogo({ ...source, dimensions });
  } catch (error) {
    // Le téléversement refuse ces fichiers ; seul un logo importé avant cette
    // vérification, ou abîmé depuis sur le disque, peut encore en arriver là.
    return refuser(
      `image indécodable : ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!rendu) return refuser("sharp indisponible");
  return {
    size: emailLogoSize(dimensions),
    body: rendu,
    contentType: "image/png",
    definitif: true,
  };
}

/**
 * Dernier verdict gardé en mémoire, fichier rendu compris : une diffusion
 * construit des dizaines de messages, puis fait ouvrir le même logo par
 * autant de boîtes. Une seule entrée : il n'y a qu'un logo à la fois, et le
 * fichier d'une adresse donnée ne change pas.
 */
let memo: { logoUrl: string; file: Promise<EmailLogoFile | null> } | null =
  null;

/**
 * Le logo tel que la route le sert, ou `null` si elle ne le servira pas.
 *
 * Le message et la route posent la même question, à la même fonction : un
 * message qui annoncerait un logo que la route refuse ensuite montrerait une
 * image cassée à chaque ouverture — pour un fichier abîmé que seul le décodage
 * révèle, ou pour un WebP quand sharp manque.
 */
export function emailLogoFile(logoUrl: string): Promise<EmailLogoFile | null> {
  if (memo?.logoUrl !== logoUrl) {
    const file = prepareEmailLogoFile(logoUrl);
    memo = { logoUrl, file };
    // Une panne de lecture (disque, base) ne dit rien du logo : elle n'est pas
    // retenue, et le prochain envoi réessaiera.
    file.catch(() => {
      if (memo?.file === file) memo = null;
    });
  }
  return memo.file;
}

/** Retenu pour ne signaler l'absence d'APP_URL qu'une fois. */
let sansAdresseSignale = false;

/**
 * Le logo à placer en tête des e-mails, ou `null` — auquel cas le message
 * garde l'en-tête d'avant, sans case vide ni image cassée.
 *
 * Il faut un logo configuré *et* l'adresse configurée du site (APP_URL) : une
 * URL relative ne mène nulle part depuis une boîte de réception, et l'adresse
 * déduite de la requête n'est pas sûre. Son en-tête Host est choisi par qui
 * l'envoie : un formulaire public posté avec « Host: attaquant.example »
 * ferait partir des e-mails dont l'image se charge chez l'attaquant — qui
 * apprendrait qui les ouvre, et quand —, et le planificateur, qui appelle le
 * cron par l'adresse interne du conteneur, y mettrait une image cassée.
 */
export async function emailLogo(
  logoUrl: string | null | undefined,
): Promise<EmailLogo | null> {
  if (!logoUrl) return null;
  const baseUrl = configuredBaseUrl();
  if (!/^https?:\/\/[^/]/i.test(baseUrl)) {
    if (!sansAdresseSignale) {
      sansAdresseSignale = true;
      console.warn(
        "[email] APP_URL absente ou invalide : les e-mails partent sans le logo configuré.",
      );
    }
    return null;
  }
  try {
    const file = await emailLogoFile(logoUrl);
    if (!file) return null;
    return {
      url: `${baseUrl.replace(/\/+$/, "")}/api/logo-email/${emailLogoVersion(logoUrl, file.size)}.png`,
      ...file.size,
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
