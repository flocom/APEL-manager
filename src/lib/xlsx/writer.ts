/**
 * Écriture d'un classeur Excel (.xlsx) sans dépendance.
 *
 * Un .xlsx est une archive zip de fichiers XML (Office Open XML). Celle-ci
 * est « stockée », sans compression : quelques dizaines de lignes d'adhérents
 * pèsent quelques kilo-octets, et l'on évite une bibliothèque de plus pour un
 * seul tableau. Les chaînes sont écrites dans la cellule (`inlineStr`) plutôt
 * que dans une table partagée ; Excel et LibreOffice les relisent de même.
 *
 * Ce qui est pris en charge, et rien de plus : texte et nombres, styles
 * (police, couleur, fond, bordure, alignement, format texte), largeurs de
 * colonnes, hauteurs de lignes, cellules fusionnées, lignes d'en-tête figées
 * et répétées à l'impression, filtre automatique, mise en page paysage.
 */

/** Couleur « RRGGBB », sans dièse. */
export type XlsxColor = string;

export interface XlsxStyle {
  font?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  color?: XlsxColor;
  /** Fond uni. */
  fill?: XlsxColor;
  /** Bordure sur les quatre côtés. */
  border?: "thin" | "medium";
  horizontal?: "left" | "center" | "right";
  vertical?: "top" | "center" | "bottom";
  wrap?: boolean;
  /** Format « Texte » (@) : Excel ne convertit pas « 01000 » en 1000. */
  text?: boolean;
}

export type XlsxValue = string | number | null | undefined;

export interface XlsxCell {
  value: XlsxValue;
  style?: XlsxStyle;
}

/** Une cellule : une valeur seule (style par défaut) ou valeur et style. */
export type XlsxCellInput = XlsxValue | XlsxCell;

export interface XlsxRow {
  /** Cellules à partir de la colonne A ; `null` laisse une cellule vide. */
  cells: XlsxCellInput[];
  /** Hauteur en points. */
  height?: number;
}

export interface XlsxSheet {
  /** Nom de l'onglet, rendu valable par `sanitizeSheetName`. */
  name: string;
  /** Largeur de chaque colonne à partir de A, en caractères. */
  columnWidths?: number[];
  /** Lignes à partir de la ligne 1 ; un tableau vide laisse une ligne vide. */
  rows: (XlsxRow | XlsxCellInput[])[];
  /** Plages fusionnées, « C1:J1 ». */
  merges?: string[];
  /** Nombre de lignes figées en haut (l'en-tête reste visible au défilement). */
  freezeRows?: number;
  /** Plage du filtre automatique, « A5:L40 ». */
  autoFilter?: string;
  /** Lignes répétées en haut de chaque page imprimée, [première, dernière]. */
  printTitleRows?: [number, number];
  /** Paysage, ajusté à la largeur d'une page A4. */
  landscape?: boolean;
}

export interface XlsxOptions {
  /** Titre et auteur lus dans les propriétés du document. */
  title?: string;
  creator?: string;
  /** Police des cellules sans style particulier. */
  defaultFont?: { name: string; size: number };
}

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ---------------------------------------------------------------------------
// Zip « stocké »
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (polynôme 0xEDB88320), celui qu'exige le format zip. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Date et heure au format MS-DOS des en-têtes zip (heure locale, à 2 s près). */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Archive zip sans compression (méthode 0), noms en UTF-8. */
export function zipStored(
  files: { name: string; data: Uint8Array }[],
  modified = new Date(),
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(modified);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature d'en-tête local
    lv.setUint16(4, 20, true); // version nécessaire : 2.0
    lv.setUint16(6, 0x0800, true); // drapeau : noms en UTF-8
    lv.setUint16(8, 0, true); // méthode : stockée
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // taille compressée
    lv.setUint32(22, size, true); // taille d'origine
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true); // pas de champ supplémentaire
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature du répertoire central
    cv.setUint16(4, 20, true); // version qui a écrit
    cv.setUint16(6, 20, true); // version nécessaire
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    // 30 : champ supplémentaire, 32 : commentaire, 34 : disque, 36 et 38 :
    // attributs — tous à zéro.
    cv.setUint32(42, offset, true); // position de l'en-tête local
    central.set(name, 46);

    locals.push(local, file.data);
    centrals.push(central);
    offset += local.length + size;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // fin du répertoire central
  ev.setUint16(8, files.length, true); // entrées sur ce disque
  ev.setUint16(10, files.length, true); // entrées au total
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true); // début du répertoire central

  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let position = 0;
  for (const part of parts) {
    out.set(part, position);
    position += part.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

/**
 * Texte sûr dans un document XML : les caractères de contrôle (hors
 * tabulation et retours à la ligne) y sont interdits et rendraient le fichier
 * illisible ; ils sont retirés.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Lettre(s) d'une colonne à partir de 0 : 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/**
 * Nom d'onglet accepté par Excel : 31 caractères au plus, sans `[]:*?/\`,
 * sans apostrophe au début ni à la fin, jamais vide.
 */
export function sanitizeSheetName(name: string): string {
  const cleaned = name
    .replace(/[[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .slice(0, 31)
    .trim();
  return cleaned || "Feuille";
}

/** Nom d'onglet dans une formule : entre apostrophes, les siennes doublées. */
function quotedSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function isCell(input: XlsxCellInput): input is XlsxCell {
  return typeof input === "object" && input !== null;
}

function normalizedColor(color: XlsxColor): string {
  const hex = color.replace(/^#/, "").toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(hex)) {
    throw new Error(`Couleur invalide : ${color}`);
  }
  return `FF${hex}`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

/**
 * Table des styles du classeur : chaque style distinct devient un `xf`,
 * qui pointe vers une police, un fond et une bordure dédoublonnés.
 */
class StyleTable {
  private fonts: string[] = [];
  private fills: string[] = [
    '<fill><patternFill patternType="none"/></fill>',
    // Réservé par le format : Excel l'attend en deuxième position.
    '<fill><patternFill patternType="gray125"/></fill>',
  ];
  private borders: string[] = [
    "<border><left/><right/><top/><bottom/><diagonal/></border>",
  ];
  private xfs: string[] = [];
  private byKey = new Map<string, number>();

  constructor(private readonly defaultFont: { name: string; size: number }) {
    this.font({});
    this.xfs.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>');
    this.byKey.set("{}", 0);
  }

  private intern(list: string[], xml: string): number {
    const found = list.indexOf(xml);
    if (found >= 0) return found;
    list.push(xml);
    return list.length - 1;
  }

  private font(style: XlsxStyle): number {
    const parts = [
      style.bold ? "<b/>" : "",
      style.italic ? "<i/>" : "",
      `<sz val="${style.size ?? this.defaultFont.size}"/>`,
      style.color ? `<color rgb="${normalizedColor(style.color)}"/>` : "",
      `<name val="${escapeXml(style.font ?? this.defaultFont.name)}"/>`,
      '<family val="2"/>',
    ];
    return this.intern(this.fonts, `<font>${parts.join("")}</font>`);
  }

  /** Index du style dans `cellXfs`. */
  index(style: XlsxStyle | undefined): number {
    if (!style) return 0;
    const key = JSON.stringify(style, Object.keys(style).sort());
    const known = this.byKey.get(key);
    if (known !== undefined) return known;

    const fontId = this.font(style);
    const fillId = style.fill
      ? this.intern(
          this.fills,
          `<fill><patternFill patternType="solid"><fgColor rgb="${normalizedColor(style.fill)}"/><bgColor indexed="64"/></patternFill></fill>`,
        )
      : 0;
    const side = (tag: string) =>
      style.border
        ? `<${tag} style="${style.border}"><color indexed="64"/></${tag}>`
        : `<${tag}/>`;
    const borderId = style.border
      ? this.intern(
          this.borders,
          `<border>${side("left")}${side("right")}${side("top")}${side("bottom")}<diagonal/></border>`,
        )
      : 0;
    const numFmtId = style.text ? 49 : 0;
    const alignment =
      style.horizontal || style.vertical || style.wrap
        ? `<alignment${style.horizontal ? ` horizontal="${style.horizontal}"` : ""}${
            style.vertical ? ` vertical="${style.vertical}"` : ""
          }${style.wrap ? ' wrapText="1"' : ""}/>`
        : "";
    const attributes = [
      `numFmtId="${numFmtId}"`,
      `fontId="${fontId}"`,
      `fillId="${fillId}"`,
      `borderId="${borderId}"`,
      'xfId="0"',
      numFmtId ? 'applyNumberFormat="1"' : "",
      fontId ? 'applyFont="1"' : "",
      fillId ? 'applyFill="1"' : "",
      borderId ? 'applyBorder="1"' : "",
      alignment ? 'applyAlignment="1"' : "",
    ].filter(Boolean);
    this.xfs.push(
      alignment
        ? `<xf ${attributes.join(" ")}>${alignment}</xf>`
        : `<xf ${attributes.join(" ")}/>`,
    );
    const id = this.xfs.length - 1;
    this.byKey.set(key, id);
    return id;
  }

  xml(): string {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join("")}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join("")}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>"
    );
  }
}

// ---------------------------------------------------------------------------
// Feuilles et classeur
// ---------------------------------------------------------------------------

function sheetXml(sheet: XlsxSheet, styles: StyleTable): string {
  let maxColumn = Math.max(0, (sheet.columnWidths?.length ?? 0) - 1);
  const rowsXml: string[] = [];

  sheet.rows.forEach((input, rowIndex) => {
    const row: XlsxRow = Array.isArray(input) ? { cells: input } : input;
    const r = rowIndex + 1;
    const cells: string[] = [];
    row.cells.forEach((cellInput, columnIndex) => {
      const cell: XlsxCell = isCell(cellInput) ? cellInput : { value: cellInput };
      const s = styles.index(cell.style);
      const hasValue =
        (typeof cell.value === "string" && cell.value !== "") ||
        (typeof cell.value === "number" && Number.isFinite(cell.value));
      // Une cellule vide sans style n'a pas besoin d'exister.
      if (!hasValue && s === 0) return;
      maxColumn = Math.max(maxColumn, columnIndex);
      const ref = `${columnLetter(columnIndex)}${r}`;
      const styleAttribute = s ? ` s="${s}"` : "";
      if (typeof cell.value === "number" && Number.isFinite(cell.value)) {
        cells.push(`<c r="${ref}"${styleAttribute}><v>${cell.value}</v></c>`);
      } else if (hasValue) {
        cells.push(
          `<c r="${ref}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(
            String(cell.value),
          )}</t></is></c>`,
        );
      } else {
        cells.push(`<c r="${ref}"${styleAttribute}/>`);
      }
    });
    const height = row.height ? ` ht="${row.height}" customHeight="1"` : "";
    if (cells.length || height) {
      rowsXml.push(`<row r="${r}"${height}>${cells.join("")}</row>`);
    }
  });

  const lastRow = Math.max(1, sheet.rows.length);
  const dimension = `A1:${columnLetter(maxColumn)}${lastRow}`;

  const freeze = sheet.freezeRows ?? 0;
  const view = freeze
    ? `<sheetView workbookViewId="0"><pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${freeze + 1}" sqref="A${freeze + 1}"/></sheetView>`
    : '<sheetView workbookViewId="0"/>';

  const cols = sheet.columnWidths?.length
    ? `<cols>${sheet.columnWidths
        .map(
          (width, i) =>
            `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`,
        )
        .join("")}</cols>`
    : "";

  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges
        .map((ref) => `<mergeCell ref="${ref}"/>`)
        .join("")}</mergeCells>`
    : "";

  // L'ordre des éléments est imposé par le schéma : un fichier qui ne le
  // respecte pas est « réparé » par Excel à l'ouverture.
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    (sheet.landscape ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : "") +
    `<dimension ref="${dimension}"/>` +
    `<sheetViews>${view}</sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    `<sheetData>${rowsXml.join("")}</sheetData>` +
    (sheet.autoFilter ? `<autoFilter ref="${sheet.autoFilter}"/>` : "") +
    merges +
    '<pageMargins left="0.2" right="0.2" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>' +
    (sheet.landscape
      ? '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>'
      : "") +
    "</worksheet>"
  );
}

/** Noms définis du classeur : plage du filtre et lignes répétées à l'impression. */
function definedNamesXml(sheets: XlsxSheet[]): string {
  const names: string[] = [];
  sheets.forEach((sheet, i) => {
    const quoted = quotedSheetName(sheet.name);
    if (sheet.autoFilter) {
      const absolute = sheet.autoFilter
        .split(":")
        .map((ref) => ref.replace(/^([A-Z]+)(\d+)$/, "$$$1$$$2"))
        .join(":");
      names.push(
        `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escapeXml(
          `${quoted}!${absolute}`,
        )}</definedName>`,
      );
    }
    if (sheet.printTitleRows) {
      const [first, last] = sheet.printTitleRows;
      names.push(
        `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${escapeXml(
          `${quoted}!$${first}:$${last}`,
        )}</definedName>`,
      );
    }
  });
  return names.length ? `<definedNames>${names.join("")}</definedNames>` : "";
}

/** Le classeur complet, prêt à télécharger. */
export function buildXlsx(sheets: XlsxSheet[], options: XlsxOptions = {}): Uint8Array<ArrayBuffer> {
  if (sheets.length === 0) throw new Error("Un classeur a au moins un onglet.");

  // Noms d'onglets valables et distincts (Excel ne distingue pas la casse).
  const seen = new Set<string>();
  const named = sheets.map((sheet) => {
    const base = sanitizeSheetName(sheet.name);
    let name = base;
    for (let n = 2; seen.has(name.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    }
    seen.add(name.toLowerCase());
    return { ...sheet, name };
  });

  const styles = new StyleTable(options.defaultFont ?? { name: "Arial", size: 10 });
  const worksheets = named.map((sheet) => sheetXml(sheet, styles));
  const encoder = new TextEncoder();
  const now = new Date();
  const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  const contentTypes =
    xmlHeader +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    named
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("") +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    "</Types>";

  const rootRels =
    xmlHeader +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    "</Relationships>";

  const created = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const core =
    xmlHeader +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    (options.title ? `<dc:title>${escapeXml(options.title)}</dc:title>` : "") +
    (options.creator ? `<dc:creator>${escapeXml(options.creator)}</dc:creator>` : "") +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>` +
    "</cp:coreProperties>";

  const workbook =
    xmlHeader +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<bookViews><workbookView activeTab="0"/></bookViews>' +
    `<sheets>${named
      .map(
        (sheet, i) =>
          `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
      )
      .join("")}</sheets>` +
    definedNamesXml(named) +
    "</workbook>";

  const workbookRels =
    xmlHeader +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    named
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("") +
    `<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    "</Relationships>";

  return zipStored(
    [
      { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
      { name: "_rels/.rels", data: encoder.encode(rootRels) },
      { name: "docProps/core.xml", data: encoder.encode(core) },
      { name: "xl/workbook.xml", data: encoder.encode(workbook) },
      { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels) },
      // Les styles après les feuilles : leur table se remplit en les écrivant.
      ...worksheets.map((xml, i) => ({
        name: `xl/worksheets/sheet${i + 1}.xml`,
        data: encoder.encode(xml),
      })),
      { name: "xl/styles.xml", data: encoder.encode(styles.xml()) },
    ],
    now,
  );
}
