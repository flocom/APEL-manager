import "server-only";

import { deflateRawSync } from "node:zlib";

/**
 * Écriture d'un classeur Excel (.xlsx, Office Open XML) minimal, sans
 * dépendance : de quoi remettre au bureau une liste d'adhérents qui s'ouvre
 * telle quelle dans Excel, LibreOffice ou Numbers, avec en-tête figé et
 * filtrable et montants au format monétaire.
 *
 * Un .xlsx est une archive ZIP de parts XML. L'archive est construite ici à
 * la main (en-têtes locaux, répertoire central, fin de répertoire), chaque
 * part compressée en deflate brut ; pas de ZIP64, inutile pour un export de
 * quelques milliers de lignes.
 *
 * Les chaînes sont écrites en ligne (`t="inlineStr"`) plutôt que dans une
 * table de chaînes partagées : un peu plus volumineux, beaucoup plus simple,
 * et la compression rattrape l'essentiel des répétitions.
 *
 * Sécurité : une cellule inlineStr est toujours du texte. Excel n'évalue
 * comme formule que le contenu d'un élément `<f>`, jamais une valeur ; une
 * chaîne qui commence par « = », « + », « - » ou « @ » s'affiche donc telle
 * quelle et il n'y a pas lieu de la préfixer d'une apostrophe comme on le
 * fait pour un CSV (injection de formule). Le texte est en revanche
 * systématiquement échappé, pour qu'une saisie ne puisse pas fermer l'élément
 * et injecter du balisage dans la feuille.
 */

export type XlsxCell =
  | string
  | number
  | null
  | { value: string | number | null; bold?: boolean; euros?: boolean };

export interface XlsxSheet {
  /** Nom de l'onglet (≤ 31 caractères, sans []:*?/\ — nettoyé ici). */
  name: string;
  rows: XlsxCell[][];
  /** Largeurs de colonnes en caractères, facultatif. */
  columnWidths?: number[];
  /**
   * Index (0-based) de la ligne d'en-tête du tableau : figée (volet) et
   * filtrable (autoFilter sur toute la plage du tableau jusqu'à la dernière
   * ligne non vide avant une ligne vide ou la fin).
   */
  headerRow?: number;
}

// --- Styles ------------------------------------------------------------------

/** Index dans `cellXfs` de styles.xml (voir STYLES_XML). */
const STYLE_DEFAULT = 0;
const STYLE_BOLD = 1;
const STYLE_EUROS = 2;
const STYLE_BOLD_EUROS = 3;

/** Format monétaire : séparateur de milliers, deux décimales, « € » après. */
const EUROS_FORMAT = '#,##0.00\\ "€"';

/** Limite Excel du nombre de caractères d'une cellule. */
const MAX_CELL_LENGTH = 32767;

// --- XML ---------------------------------------------------------------------

/**
 * Texte utilisable dans un document XML 1.0 : retire les caractères de
 * contrôle interdits (tout C0 sauf tabulation, LF et CR), les non-caractères
 * U+FFFE / U+FFFF et les demi-paires de substitution isolées. Un seul de ces
 * caractères suffit à rendre la feuille illisible pour Excel.
 */
function xmlSafe(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, (m) => (m.length === 2 ? m : ""));
}

/** Échappement complet, valable en contenu comme en valeur d'attribut. */
function escapeXml(value: string): string {
  return xmlSafe(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

// --- Cellules ----------------------------------------------------------------

/** Lettres de colonne : 0 → A, 25 → Z, 26 → AA, 701 → ZZ, 702 → AAA. */
function columnName(index: number): string {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function cellRef(col: number, row: number): string {
  return `${columnName(col)}${row + 1}`;
}

/** Référence absolue ($A$1) pour un nom défini. */
function absoluteRef(col: number, row: number): string {
  return `$${columnName(col)}$${row + 1}`;
}

type NormalizedCell = { value: string | number; style: number };

/**
 * Valeur et style d'une cellule ; `null` si la cellule est absente (null,
 * chaîne vide, nombre non fini — NaN ou Infinity n'ont pas de représentation
 * dans une feuille).
 */
function normalizeCell(cell: XlsxCell, forceBold: boolean): NormalizedCell | null {
  const raw = cell !== null && typeof cell === "object" ? cell.value : cell;
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" && !Number.isFinite(raw)) return null;
  if (typeof raw === "string" && raw === "") return null;

  const bold = forceBold || (typeof cell === "object" && cell !== null && cell.bold === true);
  const euros = typeof cell === "object" && cell !== null && cell.euros === true;
  const style = bold
    ? euros
      ? STYLE_BOLD_EUROS
      : STYLE_BOLD
    : euros
      ? STYLE_EUROS
      : STYLE_DEFAULT;
  return { value: raw, style };
}

function isEmptyRow(row: XlsxCell[] | undefined): boolean {
  return !row || row.every((cell) => normalizeCell(cell, false) === null);
}

function cellXml(ref: string, cell: NormalizedCell): string {
  const s = cell.style === STYLE_DEFAULT ? "" : ` s="${cell.style}"`;
  if (typeof cell.value === "number") {
    // Zéro négatif ramené à 0 : « -0 » s'afficherait tel quel dans certains lecteurs.
    const v = Object.is(cell.value, -0) ? 0 : cell.value;
    return `<c r="${ref}"${s}><v>${String(v)}</v></c>`;
  }
  const text = escapeXml(cell.value.slice(0, MAX_CELL_LENGTH));
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

// --- Feuilles ----------------------------------------------------------------

/**
 * Nom d'onglet accepté par Excel : sans []:*?/\, sans apostrophe en tête ou
 * en fin, 31 caractères au plus, non vide, unique dans le classeur (la
 * comparaison d'Excel ignore la casse).
 */
function sheetNames(sheets: XlsxSheet[]): string[] {
  const used = new Set<string>();
  return sheets.map((sheet, i) => {
    const base =
      xmlSafe(sheet.name)
        .replace(/[[\]:*?/\\]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^'+|'+$/g, "")
        .trim()
        .slice(0, 31)
        .trim() || `Feuille${i + 1}`;
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      name = base.slice(0, 31 - suffix.length).trimEnd() + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/** Nom d'onglet tel qu'il s'écrit dans une référence : 'Liste d''adhérents'. */
function quotedSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

type FilterRange = { firstCol: number; lastCol: number; firstRow: number; lastRow: number };

/**
 * Plage du tableau sous l'en-tête : colonnes de A à la dernière cellule
 * renseignée de l'en-tête, lignes de l'en-tête à la dernière ligne non vide
 * avant une ligne vide ou la fin de la feuille.
 */
function filterRange(rows: XlsxCell[][], headerRow: number): FilterRange | null {
  const header = rows[headerRow] ?? [];
  let lastCol = -1;
  header.forEach((cell, col) => {
    if (normalizeCell(cell, false) !== null) lastCol = col;
  });
  if (lastCol < 0) return null;
  let lastRow = headerRow;
  while (lastRow + 1 < rows.length && !isEmptyRow(rows[lastRow + 1])) lastRow++;
  return { firstCol: 0, lastCol, firstRow: headerRow, lastRow };
}

function validHeaderRow(sheet: XlsxSheet): number | null {
  const h = sheet.headerRow;
  if (h === undefined || !Number.isInteger(h) || h < 0 || h >= sheet.rows.length) return null;
  return h;
}

function sheetXml(sheet: XlsxSheet, index: number): string {
  const headerRow = validHeaderRow(sheet);
  const parts: string[] = [];

  // Dimension (plage occupée) : facultative, mais Excel l'écrit toujours.
  let maxCol = -1;
  let maxRow = -1;
  sheet.rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (normalizeCell(cell, false) !== null) {
        maxRow = Math.max(maxRow, r);
        maxCol = Math.max(maxCol, c);
      }
    });
  });
  if (maxRow >= 0) parts.push(`<dimension ref="A1:${cellRef(maxCol, maxRow)}"/>`);

  // Volet figé sous la ligne d'en-tête.
  const tabSelected = index === 0 ? ' tabSelected="1"' : "";
  if (headerRow !== null) {
    const topLeft = cellRef(0, headerRow + 1);
    parts.push(
      `<sheetViews><sheetView${tabSelected} workbookViewId="0">` +
        `<pane ySplit="${headerRow + 1}" topLeftCell="${topLeft}" activePane="bottomLeft" state="frozen"/>` +
        `<selection pane="bottomLeft" activeCell="${topLeft}" sqref="${topLeft}"/>` +
        `</sheetView></sheetViews>`,
    );
  } else {
    parts.push(`<sheetViews><sheetView${tabSelected} workbookViewId="0"/></sheetViews>`);
  }

  parts.push('<sheetFormatPr defaultRowHeight="15"/>');

  const cols = (sheet.columnWidths ?? [])
    .map((width, i) =>
      Number.isFinite(width) && width > 0
        ? `<col min="${i + 1}" max="${i + 1}" width="${Math.min(width, 255)}" customWidth="1"/>`
        : "",
    )
    .join("");
  if (cols) parts.push(`<cols>${cols}</cols>`);

  const rowsXml = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          const normalized = normalizeCell(cell, r === headerRow);
          return normalized ? cellXml(cellRef(c, r), normalized) : "";
        })
        .join("");
      return cells ? `<row r="${r + 1}">${cells}</row>` : "";
    })
    .join("");
  parts.push(rowsXml ? `<sheetData>${rowsXml}</sheetData>` : "<sheetData/>");

  const range = headerRow !== null ? filterRange(sheet.rows, headerRow) : null;
  if (range) {
    parts.push(
      `<autoFilter ref="${cellRef(range.firstCol, range.firstRow)}:${cellRef(range.lastCol, range.lastRow)}"/>`,
    );
  }

  return `${XML_HEADER}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">${parts.join("")}</worksheet>`;
}

// --- Parts du classeur -------------------------------------------------------

const STYLES_XML =
  `${XML_HEADER}<styleSheet xmlns="${NS_MAIN}">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="${escapeXml(EUROS_FORMAT)}"/></numFmts>` +
  `<fonts count="2">` +
  `<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>` +
  `</fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="4">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

function contentTypesXml(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return (
    `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    sheets +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `</Types>`
  );
}

const ROOT_RELS_XML =
  `${XML_HEADER}<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
  `</Relationships>`;

function coreXml(now: Date): string {
  const stamp = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  return (
    `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>` +
    `</cp:coreProperties>`
  );
}

function workbookXml(sheets: XlsxSheet[], names: string[]): string {
  const sheetsXml = names
    .map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");

  // Nom caché que Excel associe à chaque autoFilter ; sans lui le filtre
  // fonctionne, mais certaines versions le « réparent » à l'ouverture.
  const definedNames = sheets
    .map((sheet, i) => {
      const headerRow = validHeaderRow(sheet);
      const range = headerRow !== null ? filterRange(sheet.rows, headerRow) : null;
      if (!range) return "";
      const ref =
        `${quotedSheetName(names[i])}!` +
        `${absoluteRef(range.firstCol, range.firstRow)}:${absoluteRef(range.lastCol, range.lastRow)}`;
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escapeXml(ref)}</definedName>`;
    })
    .join("");

  return (
    `${XML_HEADER}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<bookViews><workbookView/></bookViews>` +
    `<sheets>${sheetsXml}</sheets>` +
    (definedNames ? `<definedNames>${definedNames}</definedNames>` : "") +
    `</workbook>`
  );
}

function workbookRelsXml(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join("");
  return (
    `${XML_HEADER}<Relationships xmlns="${NS_PKG_REL}">` +
    sheets +
    `<Relationship Id="rId${sheetCount + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
    `</Relationships>`
  );
}

// --- ZIP ---------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (polynôme IEEE 802.3), celui qu'exige le format ZIP. */
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Date et heure au format MS-DOS (heure locale, résolution de 2 s). */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Bit 11 du champ « general purpose » : noms de fichiers en UTF-8. */
const ZIP_FLAG_UTF8 = 0x0800;
const ZIP_METHOD_DEFLATE = 8;
/** Version 2.0 : deflate, sans ZIP64. */
const ZIP_VERSION = 20;

function buildZip(files: { name: string; content: string }[], now: Date): Buffer {
  const { time, date } = dosDateTime(now);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.from(file.content, "utf8");
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(ZIP_VERSION, 4);
    local.writeUInt16LE(ZIP_FLAG_UTF8, 6);
    local.writeUInt16LE(ZIP_METHOD_DEFLATE, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // pas de champ extra

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(ZIP_VERSION, 4); // version de création (MS-DOS)
    central.writeUInt16LE(ZIP_VERSION, 6); // version nécessaire
    central.writeUInt16LE(ZIP_FLAG_UTF8, 8);
    central.writeUInt16LE(ZIP_METHOD_DEFLATE, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // champ extra
    central.writeUInt16LE(0, 32); // commentaire
    central.writeUInt16LE(0, 34); // disque
    central.writeUInt16LE(0, 36); // attributs internes
    central.writeUInt32LE(0, 38); // attributs externes
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, compressed);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // numéro de ce disque
  end.writeUInt16LE(0, 6); // disque du répertoire central
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // pas de commentaire

  return Buffer.concat([...locals, centralDir, end]);
}

// --- Point d'entrée ----------------------------------------------------------

/**
 * Classeur .xlsx contenant les feuilles données, dans l'ordre. Un classeur
 * sans feuille n'étant pas valide, une liste vide produit une feuille vide.
 */
export function buildXlsx(sheets: XlsxSheet[]): Buffer {
  const list = sheets.length > 0 ? sheets : [{ name: "Feuille1", rows: [] }];
  const names = sheetNames(list);
  const now = new Date();

  const files = [
    { name: "[Content_Types].xml", content: contentTypesXml(list.length) },
    { name: "_rels/.rels", content: ROOT_RELS_XML },
    { name: "docProps/core.xml", content: coreXml(now) },
    { name: "xl/workbook.xml", content: workbookXml(list, names) },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml(list.length) },
    { name: "xl/styles.xml", content: STYLES_XML },
    ...list.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      content: sheetXml(sheet, i),
    })),
  ];

  return buildZip(files, now);
}
