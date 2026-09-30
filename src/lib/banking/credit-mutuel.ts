import "server-only";

import { formatEuros } from "@/lib/money";

import { extractPdfText, PdfTextError, type PdfLine, type PdfText, type PdfWord } from "./pdf-text";

/**
 * Lecture des relevés de compte du Crédit Mutuel (modèle « RELEVE ET
 * INFORMATIONS BANCAIRES », commun aux caisses du groupe Euro-Information).
 *
 * Chaque compte du relevé forme une section : un solde de départ, des
 * opérations sur deux colonnes (débit, crédit), un « Total des mouvements »
 * et un solde d'arrivée. Ces chiffres imprimés servent de preuve : tant que la
 * somme des opérations lues ne retombe pas exactement dessus, au centime près,
 * rien n'est rendu. Mieux vaut refuser un relevé que glisser une écriture
 * fausse dans la comptabilité.
 */

export type BankStatementLine = {
  operationDate: string /* YYYY-MM-DD */;
  valueDate: string | null;
  label: string;
  details: string[];
  amountCents: number /* >0 */;
  direction: "debit" | "credit";
};

export type BankStatementSection = {
  accountLabel: string;
  accountNumber: string;
  openingBalanceCents: number /* signed */;
  openingDate: string;
  closingBalanceCents: number;
  closingDate: string;
  totalDebitCents: number;
  totalCreditCents: number;
  /**
   * IBAN imprimé dans la section (sous son solde final, ou sur la ligne du
   * titulaire des relevés anciens). Absent ou null : la section n'en donne
   * pas, un livret par exemple. L'IBAN du relevé est celui du premier compte.
   */
  iban?: string | null;
  lines: BankStatementLine[];
};

export type ParsedBankStatement = {
  bank: "credit_mutuel";
  statementDate: string | null;
  holder: string | null;
  iban: string | null;
  bic: string | null;
  sections: BankStatementSection[];
};

export type BankStatementErrorCode =
  | "not_credit_mutuel"
  | "unreadable"
  | "inconsistent"
  | "no_operations";

/** Refus d'un relevé, avec un message à montrer tel quel au trésorier. */
export class BankStatementError extends Error {
  readonly code: BankStatementErrorCode;

  constructor(code: BankStatementErrorCode, message: string) {
    super(message);
    this.name = "BankStatementError";
    this.code = code;
  }
}

/* ------------------------------------------------------------------------ */
/* Reconnaissance                                                            */
/* ------------------------------------------------------------------------ */

/**
 * Codes banque des IBAN du Crédit Mutuel (groupe Euro-Information). La liste
 * n'est qu'un indice parmi d'autres : une caisse absente reste reconnue par
 * son BIC ou le gabarit du document.
 */
const CREDIT_MUTUEL_BANK_CODES = new Set(["10278", "15489", "15519", "15629"]);

/**
 * Le CIC imprime ses relevés sur le même gabarit que le Crédit Mutuel (même
 * titre, mêmes colonnes, BIC en CMCI…) : sans ces marques, un relevé du CIC
 * passerait pour un relevé du Crédit Mutuel. BIC CMCIFRPP, codes banque des
 * CIC régionaux.
 */
const CIC_BANK_CODES = new Set(["30066", "30027", "30047", "30087", "10096", "11899"]);

/** Crédit Mutuel Arkéa (Bretagne, Sud-Ouest) : un autre système, un autre relevé. */
const ARKEA_BANK_CODES = new Set(["15589"]);

/** Majuscules sans accents : « Débit » et « DEBIT » se comparent enfin. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

function allLines(doc: PdfText): PdfLine[] {
  return doc.pages.flatMap((page) => page.lines);
}

/** IBAN valide (clé modulo 97), sans espaces, ou null. */
function validIban(raw: string): string | null {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return null;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1 ? iban : null;
}

function findIban(lines: PdfLine[]): string | null {
  for (const line of lines) {
    // « QXBAN » précède l'IBAN sur la même ligne : le \b l'écarte.
    const match = line.text.match(/\bIBAN\s*:?\s*([A-Z]{2}\d{2}(?:\s?[0-9A-Z]){11,30})/i);
    if (!match) continue;
    // La capture peut avaler un mot suivant : on raccourcit jusqu'à une clé valide.
    const compact = match[1].replace(/\s+/g, "");
    for (let length = compact.length; length >= 15; length -= 1) {
      const iban = validIban(compact.slice(0, length));
      if (iban) return iban;
    }
  }
  return null;
}

function findBic(lines: PdfLine[]): string | null {
  for (const line of lines) {
    const match = line.text.match(/\bBIC\s*:?\s*([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Le PDF est-il un relevé du Crédit Mutuel ? Il faut le nom de la banque et au
 * moins deux marques propres à son relevé : le titre, le BIC du groupe
 * (CMCI…), un IBAN d'une de ses caisses, le gabarit déclaré dans les
 * propriétés du fichier. Un relevé d'une autre banque, ou n'importe quel PDF
 * qui citerait le Crédit Mutuel au détour d'une ligne, ne les réunit pas.
 */
export function looksLikeCreditMutuel(doc: PdfText): boolean {
  const lines = allLines(doc);
  const text = normalize(lines.map((line) => line.text).join("\n"));

  const brand = /CREDIT\s*MUTUEL/.test(text);
  if (!brand) return false;

  const iban = findIban(lines);
  const markers = [
    /RELEVE ET INFORMATIONS BANCAIRES/.test(text),
    /\bBIC\s*:?\s*CMCI[A-Z0-9]{4}/.test(text),
    iban !== null && iban.startsWith("FR") && CREDIT_MUTUEL_BANK_CODES.has(iban.slice(4, 9)),
    /^ADAPTTEMPLATE=CM/i.test(doc.metadata.author ?? ""),
  ];
  return markers.filter(Boolean).length >= 2;
}

function ibanBankCode(iban: string | null): string | null {
  return iban?.startsWith("FR") ? iban.slice(4, 9) : null;
}

type BankMarks = { text: string; bic: string | null; bankCode: string | null };

function bankMarks(doc: PdfText): BankMarks {
  const lines = allLines(doc);
  return {
    text: normalize(lines.map((line) => line.text).join("\n")),
    bic: findBic(lines),
    bankCode: ibanBankCode(findIban(lines)),
  };
}

/**
 * Marque sûre d'une caisse du Crédit Mutuel (BIC CMCIFR2A, code banque,
 * adresse creditmutuel.fr, « Caisse de Crédit Mutuel ») : elle l'emporte sur
 * tout indice du CIC ou d'Arkéa, qu'un libellé d'opération (« PRLV SEPA CIC
 * OUEST ») ou un ancien pied de page (« CM-CIC ») peut contenir.
 */
function hasCreditMutuelMark({ text, bic, bankCode }: BankMarks): boolean {
  return (
    bic?.startsWith("CMCIFR2A") === true ||
    (bankCode !== null && CREDIT_MUTUEL_BANK_CODES.has(bankCode)) ||
    /CREDITMUTUEL\.FR|CAISSE (?:DE|DU) CREDIT MUTUEL|\bCCM\b/.test(text)
  );
}

/** Relevé du CIC : BIC CMCIFRPP, code banque d'un CIC, cic.fr… */
function looksLikeCic({ text, bic, bankCode }: BankMarks): boolean {
  return (
    bic?.startsWith("CMCIFRPP") === true ||
    (bankCode !== null && CIC_BANK_CODES.has(bankCode)) ||
    /\bCIC\.FR\b|CREDIT INDUSTRIEL ET COMMERCIAL|\bBANQUE CIC\b|\bCIC (?:OUEST|EST|NORD OUEST|SUD OUEST|LYONNAISE DE BANQUE)\b/.test(
      text,
    )
  );
}

/**
 * Relevé du Crédit Mutuel Arkéa (Bretagne, Sud-Ouest) : « Relevé de Compte …
 * Arrêté au », opérations regroupées par rubrique, dates sans année. Rien à
 * voir avec le gabarit lu ici.
 */
function looksLikeArkea({ text, bic, bankCode }: BankMarks): boolean {
  return (
    bic?.startsWith("CMBRFR") === true ||
    (bankCode !== null && ARKEA_BANK_CODES.has(bankCode)) ||
    /\bARKEA\b|CREDIT MUTUEL DE BRETAGNE|CREDIT MUTUEL DU SUD[- ]OUEST|\bCMB\.FR\b|\bCMSO\.COM\b/.test(
      text,
    ) ||
    (/CREDIT\s*MUTUEL/.test(text) &&
      /RELEVE DE COMPTE/.test(text) &&
      /ARRETE AU/.test(text) &&
      !/RELEVE ET INFORMATIONS BANCAIRES/.test(text))
  );
}

/**
 * Refuse, avec un message qui dit pourquoi, tout ce qui n'est pas un relevé du
 * Crédit Mutuel au gabarit « Relevé et informations bancaires ». Le CIC et
 * Arkéa sont écartés d'abord, chacun avec son message : le CIC partage ce
 * gabarit et passerait sinon le contrôle.
 */
function assertCreditMutuel(doc: PdfText): void {
  const marks = bankMarks(doc);
  const creditMutuel = hasCreditMutuelMark(marks);
  if (!creditMutuel && looksLikeCic(marks)) {
    throw new BankStatementError(
      "not_credit_mutuel",
      "Ce relevé vient du CIC, pas du Crédit Mutuel. Seuls les relevés du Crédit Mutuel sont pris en charge pour l’instant.",
    );
  }
  if (!creditMutuel && looksLikeArkea(marks)) {
    throw new BankStatementError(
      "not_credit_mutuel",
      "Ce relevé vient du Crédit Mutuel Arkéa (Crédit Mutuel de Bretagne, du Sud-Ouest…), dont le format de relevé n’est pas encore pris en charge. Seuls les relevés « Relevé et informations bancaires » des autres caisses du Crédit Mutuel sont lus pour l’instant.",
    );
  }
  if (looksLikeCreditMutuel(doc)) return;
  throw new BankStatementError(
    "not_credit_mutuel",
    "Ce document n’est pas un relevé de compte du Crédit Mutuel. Seuls les relevés du Crédit Mutuel sont pris en charge pour l’instant.",
  );
}

/* ------------------------------------------------------------------------ */
/* Valeurs                                                                   */
/* ------------------------------------------------------------------------ */

const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
/** « 5.480,19 », « 4,00 » : points pour les milliers, virgule décimale. */
const AMOUNT_PATTERN = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})$/;

const MONTHS: Record<string, number> = {
  JANVIER: 1,
  FEVRIER: 2,
  MARS: 3,
  AVRIL: 4,
  MAI: 5,
  JUIN: 6,
  JUILLET: 7,
  AOUT: 8,
  SEPTEMBRE: 9,
  OCTOBRE: 10,
  NOVEMBRE: 11,
  DECEMBRE: 12,
};

function isoDate(day: number, month: number, year: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** « 27/02/2026 » → « 2026-02-27 », ou null si ce n'est pas une date réelle. */
function parseDate(text: string): string | null {
  const match = text.match(DATE_PATTERN);
  if (!match) return null;
  return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** « 5.480,19 » → 548019 centimes, en entiers : aucune somme en virgule flottante. */
function parseAmount(text: string): number | null {
  const match = text.match(AMOUNT_PATTERN);
  if (!match) return null;
  const cents = Number(match[1].replace(/\./g, "")) * 100 + Number(match[2]);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** « 27/02/2026 » pour les messages : la date telle qu'imprimée sur le relevé. */
function frenchDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

/* ------------------------------------------------------------------------ */
/* Colonnes                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Repères horizontaux du tableau, lus sur l'en-tête « Date / Date valeur /
 * Opération / Débit / Crédit » de chaque page. Les montants sont alignés à
 * droite : leur bord droit tombe sur celui du titre de leur colonne.
 */
type Columns = {
  /** Début du titre « Date valeur » : la date d'opération est à sa gauche. */
  valueDateX: number;
  /** Début du titre « Opération » : la date de valeur finit avant. */
  labelX: number;
  debitX0: number;
  debitRight: number;
  creditX0: number;
  creditRight: number;
  /** Corps du texte du tableau, pour mesurer les écarts entre lignes. */
  fontSize: number;
};

/**
 * Relevés d'Olonne-sur-Mer (2026), en points. Servent seulement si une page
 * de tableau n'a pas d'en-tête et qu'aucune page précédente n'en avait.
 */
const FALLBACK_COLUMNS: Columns = {
  valueDateX: 98.4,
  labelX: 160.8,
  debitX0: 409,
  debitRight: 459.6,
  creditX0: 480.2,
  creditRight: 534,
  fontSize: 8,
};

function readHeader(line: PdfLine): Columns | null {
  const words = line.words.map((word) => normalize(word.text));
  const debit = words.indexOf("DEBIT");
  const credit = words.indexOf("CREDIT");
  if (debit < 0 || credit <= debit || words[0] !== "DATE") return null;
  const valeur = words.indexOf("VALEUR");
  const operation = words.indexOf("OPERATION");
  const at = (index: number) => line.words[index];
  return {
    // « Date valeur » : le mot « Date » qui précède « valeur ».
    valueDateX: valeur > 0 ? at(valeur - 1).x0 : (at(0).x1 + at(debit).x0) / 2,
    labelX: operation > 0 ? at(operation).x0 : at(debit).x0 / 2,
    debitX0: at(debit).x0,
    debitRight: at(credit - 1).x1,
    creditX0: at(credit).x0,
    creditRight: at(words.length - 1).x1,
    fontSize: line.height || FALLBACK_COLUMNS.fontSize,
  };
}

type Amount = { cents: number; direction: "debit" | "credit" };

/**
 * Sépare les montants en fin de ligne du reste du texte. Un nombre n'est un
 * montant que si son bord droit tombe dans la zone des colonnes ; ailleurs, il
 * appartient au libellé (« RET 270326 »). Un montant qui ne s'aligne sur
 * aucune colonne trahit un gabarit inconnu : on refuse plutôt que deviner.
 */
function splitAmounts(
  words: PdfWord[],
  columns: Columns,
  where: string,
): { body: PdfWord[]; amounts: Amount[] } {
  const body = [...words];
  const amounts: Amount[] = [];
  const boundary = (columns.debitRight + columns.creditX0) / 2;
  const tolerance = Math.max(6, columns.fontSize * 1.2);
  while (body.length > 0) {
    const word = body[body.length - 1];
    let cents = parseAmount(word.text);
    if (cents === null || word.x1 <= columns.debitX0) break;
    // « 1 874,10 » coupé en deux mots par une espace de milliers : on recolle
    // les groupes de chiffres collés au montant, dans la zone des colonnes
    // seulement (un numéro de libellé en est loin).
    let group = word.text.split(",")[0];
    let scale = group.length;
    let first = word;
    while (/^\d{3}$/.test(group) && body.length > 1) {
      const previous = body[body.length - 2];
      const glued = first.x0 - previous.x1 <= Math.max(1.5, columns.fontSize * 0.6);
      if (!/^\d{1,3}$/.test(previous.text) || !glued || previous.x0 < columns.debitX0 - 20) break;
      cents += Number(previous.text) * 10 ** scale * 100;
      group = previous.text;
      scale += group.length;
      first = previous;
      body.splice(body.length - 2, 1);
    }
    const direction = word.x1 > boundary ? "credit" : "debit";
    const right = direction === "credit" ? columns.creditRight : columns.debitRight;
    if (Math.abs(word.x1 - right) > tolerance) {
      throw new BankStatementError(
        "unreadable",
        `Un montant (${word.text}) ne s’aligne sur aucune colonne ${where}. Ce modèle de relevé n’est pas encore pris en charge.`,
      );
    }
    if (amounts.some((amount) => amount.direction === direction)) {
      throw new BankStatementError(
        "unreadable",
        `Deux montants dans la même colonne ${where} : la ligne est illisible.`,
      );
    }
    amounts.unshift({ cents, direction });
    body.pop();
  }
  return { body, amounts };
}

/* ------------------------------------------------------------------------ */
/* Lecture du tableau                                                        */
/* ------------------------------------------------------------------------ */

type DraftLine = {
  operationDate: string;
  valueDate: string | null;
  label: string;
  details: string[];
  amount: Amount | null;
  /**
   * Décalage du libellé par rapport au titre « Opération ». Les lignes de
   * détail s'alignent sur le libellé, et une page de verso peut être décalée
   * de quelques points : on compare donc à l'en-tête de la page courante.
   */
  labelOffset: number;
};

type DraftSection = {
  accountLabel: string;
  accountNumber: string;
  opening: { cents: number; date: string } | null;
  closing: { cents: number; date: string } | null;
  totals: { debit: number; credit: number } | null;
  iban: string | null;
  lines: DraftLine[];
};

const ACCOUNT_PATTERN = /^(.*?)\s*\bN\s?[°º]\s*(\d[\d ]{4,}\d)\s+en\s+euros?\b/i;
/**
 * Ligne de solde : « SOLDE CREDITEUR AU 27/02/2026 » (départ) ou « Réf : 003
 * SOLDE CREDITEUR AU 31/03/2026 » (arrivée), en début de ligne. Jamais après
 * une date d'opération : « VIR SOLDE AU 10/06/2026 » est un libellé, et le
 * prendre pour le solde final fermait la section en silence.
 */
const BALANCE_PATTERN =
  /^(?:REF\s*:\s*\d+\s+)?SOLDE\s+(?:(CREDITEUR|DEBITEUR|NUL)\s+)?AU\s+(\d{2}\/\d{2}\/\d{4})\b/;
const TOTAL_PATTERN = /^TOTAL DES MOUVEMENTS\b/;
/** Reports de bas et de haut de page : des sous-totaux, pas des opérations. */
const CARRY_PATTERN =
  /^(?:REPORT|A REPORTER|TOTAL A REPORTER|SOLDE A REPORTER|SOLDE REPORTE|SOUS[- ]TOTAL|TOTAL)\b/;
/**
 * Un report ne porte que son mot-clé et ses montants : « TOTAL ACCESS CARTE
 * 02892630 » (station-service) ou « REPORT KERMESSE » (motif) sont des détails.
 */
const CARRY_ONLY_PATTERN =
  /^(?:REPORT|A REPORTER|TOTAL A REPORTER|SOLDE A REPORTER|SOLDE REPORTE|SOUS[- ]TOTAL|TOTAL)\s*:?$/;
/** Fin de la partie « tableau » d'une page : renvoi, mentions légales, pied. */
const PAGE_END_PATTERN =
  /SUITE AU VERSO|SOUS RESERVE DES EXTOURNES|INFORMATION SUR LA PROTECTION|^PAGE \d+$/;
/**
 * Pied de section « QXBAN : … IBAN : FR76 … », ou « IBAN : … » seul. En
 * début de ligne seulement : le motif d'un virement peut citer un IBAN.
 */
const IBAN_LINE_PATTERN = /^(?:QXBAN\b.*\s)?IBAN\s*:/;
/**
 * Encadrés qui ne sont pas des opérations du compte : récapitulatif des autres
 * comptes, des frais de l'année, et surtout le détail d'une carte à débit
 * différé. Ce dernier a ses propres dates et montants (« Date Commerce Ville
 * Montant euros … TOTAL PRELEVE ») ; le lire compterait deux fois la dépense
 * déjà débitée en une ligne. Tout est ignoré jusqu'au compte ou au tableau
 * suivant.
 */
const SKIP_BLOCK_PATTERN =
  /^(?:RELEVE DE VOS? CARTES?\b|SITUATION DE VOS AUTRES COMPTES\b|FRAIS SUR PRODUITS ET SERVICES\b|RECAPITULATIF\b|DATE COMMERCE\b|TOTAL PRELEVE\b|TOTAL DES FRAIS\b)/;
/**
 * Marge gauche, en points : les codes de tri imprimés de biais (« R », « 0 »,
 * « X », « KV.2026… ») y tombent. pdf.js les écarte d'ordinaire comme texte
 * non horizontal, mais un autre producteur de PDF peut les rendre à plat, sur
 * la ligne même d'une opération. Le tableau commence bien plus à droite.
 */
const MARGIN_X = 40;

function sectionName(section: DraftSection): string {
  return `du compte N° ${section.accountNumber}`;
}

/**
 * Report de page ? Seulement si la ligne ne porte que le mot-clé et des
 * montants ; sans montant, une ligne alignée sous un libellé en est le détail.
 */
function isCarry(line: PdfLine, columns: Columns, where: string, detail: boolean): boolean {
  if (!CARRY_PATTERN.test(normalize(line.text))) return false;
  const { body, amounts } = splitAmounts(line.words, columns, where);
  const words = normalize(body.map((word) => word.text).join(" "));
  return CARRY_ONLY_PATTERN.test(words) && (amounts.length > 0 || !detail);
}

/** Section close, et comment on le sait. */
type ClosedSection = {
  section: DraftSection;
  /** Close avant la page courante, dont l'en-tête rappelle pourtant le compte. */
  echo: boolean;
};

/**
 * Après le solde final d'un compte, rien du tableau ne doit revenir avant le
 * compte suivant. Une opération, un total ou un solde qui reparaît signale
 * une mise en page inconnue, ou deux relevés du même compte collés dans un
 * seul PDF : lus en silence, ils disparaissaient de l'import.
 */
function assertStaysClosed(closed: ClosedSection, line: PdfLine, columns: Columns, page: number) {
  const text = normalize(line.text);
  const first = line.words[0];
  const dated =
    first !== undefined && first.x0 < columns.valueDateX - 2 && parseDate(first.text) !== null;
  if (!dated && !BALANCE_PATTERN.test(text) && !TOTAL_PATTERN.test(text)) return;
  if (closed.echo) {
    throw new BankStatementError(
      "unreadable",
      `Ce PDF contient plusieurs relevés ${sectionName(closed.section)} : importez chaque relevé séparément.`,
    );
  }
  throw new BankStatementError(
    "unreadable",
    `Des opérations suivent le solde final ${sectionName(closed.section)} (page ${page}) : la mise en page est inattendue.`,
  );
}

function requireAmount(line: DraftLine | null, section: DraftSection) {
  if (line && line.amount === null) {
    throw new BankStatementError(
      "unreadable",
      `L’opération « ${line.label} » du ${frenchDate(line.operationDate)} (${sectionName(section)}) n’a pas de montant lisible.`,
    );
  }
}

/** Retire les mots de la marge ; null si la ligne n'était faite que de ça. */
function withoutMargin(line: PdfLine): PdfLine | null {
  const words = line.words.filter((word) => word.x0 >= MARGIN_X);
  if (words.length === line.words.length) return line;
  if (words.length === 0) return null;
  return {
    ...line,
    words,
    x0: words[0].x0,
    x1: words[words.length - 1].x1,
    text: words.map((word) => word.text).join(" "),
  };
}

/**
 * Ligne de compte « <intitulé> N° <numéro> en euros » ? Seulement si le
 * titulaire ou l'en-tête du tableau suit : une phrase comme « TOTAL PRELEVE …
 * SUR LE COMPTE N° … EN EUROS » a la même forme sans ouvrir de compte.
 */
function readAccountLine(
  lines: PdfLine[],
  index: number,
): { accountLabel: string; accountNumber: string } | null {
  const match = lines[index].text.match(ACCOUNT_PATTERN);
  if (!match) return null;
  const opensAccount = lines
    .slice(index + 1, index + 4)
    .some((next) => /^TITULAIRE/.test(normalize(next.text)) || readHeader(next) !== null);
  if (!opensAccount) return null;
  return {
    accountLabel: match[1].trim() || "Compte",
    accountNumber: match[2].replace(/\s+/g, ""),
  };
}

function readSections(doc: PdfText): DraftSection[] {
  const sections: DraftSection[] = [];
  let current: DraftSection | null = null;
  let columns: Columns | null = null;
  let lastLine: DraftLine | null = null;
  // Dans un encadré hors opérations (voir SKIP_BLOCK_PATTERN), d'une page à l'autre.
  let skipping = false;
  // Dernière section close, tant qu'aucun autre compte ne s'ouvre.
  let closed: ClosedSection | null = null;
  // Section à qui revient un IBAN imprimé hors du tableau : celle du dernier
  // compte annoncé, jusqu'au suivant.
  let ibanOwner: DraftSection | null = null;
  const takeIban = (line: PdfLine) => {
    if (ibanOwner && ibanOwner.iban === null) ibanOwner.iban = findIban([line]);
  };

  for (const page of doc.pages) {
    let headerSeen = false;
    let tableActive = false;
    let lastTableY = 0;
    const lines = page.lines.map(withoutMargin).filter((line) => line !== null);

    for (const [index, line] of lines.entries()) {
      const text = normalize(line.text);

      if (SKIP_BLOCK_PATTERN.test(text)) {
        skipping = true;
        tableActive = false;
        continue;
      }

      const account = readAccountLine(lines, index);
      if (account) {
        // Le même compte rappelé en tête d'une page suivante : on poursuit.
        // Rappelé alors qu'il est déjà clos (en tête de la page du détail de
        // carte, par exemple) : simple écho, rien ne s'ouvre.
        if (!current || current.accountNumber !== account.accountNumber) {
          const known = sections.find(
            (section) => section.accountNumber === account.accountNumber,
          );
          if (known) {
            current = known.closing === null ? known : null;
            closed = known.closing === null ? null : { section: known, echo: true };
            ibanOwner = known;
          } else {
            current = {
              ...account,
              opening: null,
              closing: null,
              totals: null,
              iban: null,
              lines: [],
            };
            sections.push(current);
            closed = null;
            ibanOwner = current;
          }
          lastLine = null;
        }
        skipping = false;
        tableActive = false;
        continue;
      }

      const header = readHeader(line);
      if (header) {
        columns = header;
        headerSeen = true;
        skipping = false;
        tableActive = current !== null;
        lastTableY = line.y;
        continue;
      }

      if (skipping) continue;
      if (!current) {
        if (closed) assertStaysClosed(closed, line, columns ?? FALLBACK_COLUMNS, page.page);
        takeIban(line);
        continue;
      }

      // Page de suite sans en-tête (ou avant celui du compte suivant) : le
      // tableau reprend à sa première ligne reconnaissable, avec les colonnes
      // de la page précédente.
      if (!tableActive) {
        const first = line.words[0];
        const resumes =
          !headerSeen &&
          current.opening !== null &&
          ((first !== undefined &&
            first.x0 < (columns ?? FALLBACK_COLUMNS).valueDateX - 2 &&
            parseDate(first.text) !== null) ||
            BALANCE_PATTERN.test(text) ||
            TOTAL_PATTERN.test(text) ||
            CARRY_PATTERN.test(text));
        if (!resumes) {
          // Ligne du titulaire, pied de page… : l'IBAN du compte y figure parfois.
          takeIban(line);
          continue;
        }
        tableActive = true;
        lastTableY = line.y;
      }

      const cols = columns ?? FALLBACK_COLUMNS;
      const where = `(${sectionName(current)}, page ${page.page})`;
      // Ligne de détail possible : alignée sous le libellé, juste après la
      // ligne précédente — ou juste sous l'en-tête répété quand le libellé
      // déborde sur la page suivante. Un motif libre (« SOLDE AU 31/05/2026 »,
      // « IBAN : FR76… ») y reste un détail, pas un solde ni un pied de page.
      const maxGap = Math.max(14, cols.fontSize * 2.6);
      const isDetail =
        lastLine !== null &&
        Math.abs(line.x0 - (cols.labelX + lastLine.labelOffset)) <= 6 &&
        line.y - lastTableY <= maxGap;

      if (PAGE_END_PATTERN.test(text) || (!isDetail && IBAN_LINE_PATTERN.test(text))) {
        tableActive = false;
        takeIban(line);
        continue;
      }

      const balance = isDetail ? null : text.match(BALANCE_PATTERN);
      if (balance) {
        const date = parseDate(balance[2]);
        const { amounts } = splitAmounts(line.words, cols, where);
        const kind = balance[1] ?? "NUL";
        if (!date || amounts.length > 1 || (amounts.length === 0 && kind !== "NUL")) {
          throw new BankStatementError("unreadable", `Un solde est illisible ${where}.`);
        }
        const magnitude = amounts[0]?.cents ?? 0;
        const cents = kind === "DEBITEUR" ? -magnitude : magnitude;
        if (current.opening === null && current.lines.length === 0) {
          current.opening = { cents, date };
        } else {
          requireAmount(lastLine, current);
          current.closing = { cents, date };
          // Solde final : la section est close, la suite de la page est hors tableau.
          closed = { section: current, echo: false };
          current = null;
          lastLine = null;
          tableActive = false;
        }
        lastTableY = line.y;
        continue;
      }

      if (current.opening === null) {
        // Rien n'est une opération tant que le solde de départ n'est pas lu.
        continue;
      }

      if (TOTAL_PATTERN.test(text)) {
        requireAmount(lastLine, current);
        const { amounts } = splitAmounts(line.words, cols, where);
        current.totals = {
          debit: amounts.find((amount) => amount.direction === "debit")?.cents ?? 0,
          credit: amounts.find((amount) => amount.direction === "credit")?.cents ?? 0,
        };
        lastLine = null;
        lastTableY = line.y;
        continue;
      }

      if (isCarry(line, cols, where, isDetail)) {
        // Report de haut de page : le libellé de la dernière opération peut
        // encore se poursuivre juste en dessous, on ne la clôt pas.
        lastTableY = line.y;
        continue;
      }

      const [first, second] = line.words;
      const operationDate =
        first && first.x0 < cols.valueDateX - 2 ? parseDate(first.text) : null;
      if (operationDate) {
        requireAmount(lastLine, current);
        if (current.totals !== null) {
          throw new BankStatementError(
            "unreadable",
            `Une opération suit le total des mouvements ${where} : la mise en page est inattendue.`,
          );
        }
        const valueDate =
          second && second.x0 < cols.labelX ? parseDate(second.text) : null;
        const rest = line.words.slice(valueDate ? 2 : 1);
        const { body, amounts } = splitAmounts(rest, cols, where);
        const label = body.map((word) => word.text).join(" ");
        if (!label || amounts.length > 1) {
          throw new BankStatementError(
            "unreadable",
            `L’opération du ${frenchDate(operationDate)} est illisible ${where}.`,
          );
        }
        lastLine = {
          operationDate,
          valueDate,
          label,
          details: [],
          amount: amounts[0] ?? null,
          labelOffset: body[0].x0 - cols.labelX,
        };
        current.lines.push(lastLine);
        lastTableY = line.y;
        continue;
      }

      // Ligne de détail. Tout autre texte marque la fin du tableau sur cette
      // page.
      if (!isDetail || !lastLine) {
        tableActive = false;
        takeIban(line);
        continue;
      }
      const { body, amounts } = splitAmounts(line.words, cols, where);
      if (amounts.length > 0) {
        // Montant reporté sur la dernière ligne d'un libellé long.
        if (lastLine.amount !== null || amounts.length > 1) {
          throw new BankStatementError(
            "unreadable",
            `Une ligne de détail porte un montant inattendu ${where}.`,
          );
        }
        lastLine.amount = amounts[0];
      }
      const detail = body.map((word) => word.text).join(" ");
      if (detail) lastLine.details.push(detail);
      lastTableY = line.y;
    }
  }

  return sections;
}

/* ------------------------------------------------------------------------ */
/* Contrôles                                                                 */
/* ------------------------------------------------------------------------ */

function checkSection(draft: DraftSection): BankStatementSection {
  const name = sectionName(draft);
  if (!draft.opening) {
    throw new BankStatementError(
      "inconsistent",
      `Le solde de départ ${name} est introuvable : le relevé est incomplet.`,
    );
  }
  if (!draft.closing) {
    throw new BankStatementError(
      "inconsistent",
      `Le solde final ${name} est introuvable : le relevé est incomplet ou tronqué.`,
    );
  }
  // Pas de « Total des mouvements » : les relevés plus anciens n'en impriment
  // pas. Reste la preuve par les soldes (départ + crédits − débits = final),
  // que la moindre opération manquée ou mal lue fait échouer.

  const lines: BankStatementLine[] = [];
  let debit = 0;
  let credit = 0;
  for (const line of draft.lines) {
    if (!line.amount) {
      throw new BankStatementError("unreadable", `Une opération ${name} n’a pas de montant.`);
    }
    if (line.amount.direction === "debit") debit += line.amount.cents;
    else credit += line.amount.cents;
    // Une ligne à 0,00 ne change rien au compte : rien à passer en écriture.
    if (line.amount.cents === 0) continue;
    lines.push({
      operationDate: line.operationDate,
      valueDate: line.valueDate,
      label: line.label,
      details: line.details,
      amountCents: line.amount.cents,
      direction: line.amount.direction,
    });
  }

  const totals = draft.totals ?? { debit, credit };
  const period = `au ${frenchDate(draft.closing.date)}`;
  if (debit !== totals.debit) {
    throw new BankStatementError(
      "inconsistent",
      `Relevé ${name} ${period} : la somme des débits lus (${formatEuros(debit)}) ne correspond pas au total imprimé (${formatEuros(totals.debit)}). Aucune écriture n’a été importée.`,
    );
  }
  if (credit !== totals.credit) {
    throw new BankStatementError(
      "inconsistent",
      `Relevé ${name} ${period} : la somme des crédits lus (${formatEuros(credit)}) ne correspond pas au total imprimé (${formatEuros(totals.credit)}). Aucune écriture n’a été importée.`,
    );
  }
  const expected = draft.opening.cents + credit - debit;
  if (expected !== draft.closing.cents) {
    throw new BankStatementError(
      "inconsistent",
      `Relevé ${name} ${period} : le solde de départ (${formatEuros(draft.opening.cents)}) plus les mouvements donne ${formatEuros(expected)}, et non le solde final imprimé (${formatEuros(draft.closing.cents)}). Aucune écriture n’a été importée.`,
    );
  }

  return {
    accountLabel: draft.accountLabel,
    accountNumber: draft.accountNumber,
    openingBalanceCents: draft.opening.cents,
    openingDate: draft.opening.date,
    closingBalanceCents: draft.closing.cents,
    closingDate: draft.closing.date,
    totalDebitCents: totals.debit,
    totalCreditCents: totals.credit,
    iban: ibanOfAccount(draft.iban, draft.accountNumber),
    lines,
  };
}

/**
 * Un IBAN français contient le numéro du compte (caractères 15 à 25) : on ne
 * garde l'IBAN lu dans une section que s'il désigne bien ce compte, et pas un
 * compte voisin dont le cadre serait imprimé au même endroit.
 */
function ibanOfAccount(iban: string | null, accountNumber: string): string | null {
  if (!iban) return null;
  if (!iban.startsWith("FR")) return iban;
  return iban.slice(14, 25) === accountNumber.padStart(11, "0") ? iban : null;
}

/* ------------------------------------------------------------------------ */
/* En-tête du relevé                                                         */
/* ------------------------------------------------------------------------ */

/** Date d'arrêté imprimée sous le titre : « 31 mars 2026 ». */
function findStatementDate(lines: PdfLine[]): string | null {
  const titleIndex = lines.findIndex((line) =>
    normalize(line.text).includes("RELEVE ET INFORMATIONS BANCAIRES"),
  );
  if (titleIndex < 0) return null;
  for (const line of lines.slice(titleIndex, titleIndex + 4)) {
    const match = normalize(line.text).match(/\b(\d{1,2})(?:ER)?\s+([A-Z]+)\s+(\d{4})\b/);
    const month = match ? MONTHS[match[2]] : undefined;
    if (match && month) return isoDate(Number(match[1]), month, Number(match[3]));
  }
  return null;
}

function findHolder(lines: PdfLine[]): string | null {
  for (const line of lines) {
    const match = line.text.match(/^TITULAIRE(?:\(S\)|S)?\s*:\s*(.+)$/i);
    if (match) return match[1].trim();
  }
  return null;
}

/* ------------------------------------------------------------------------ */
/* Point d'entrée                                                            */
/* ------------------------------------------------------------------------ */

/**
 * Lit un relevé déjà extrait. Séparé de la lecture du fichier pour que les
 * contrôles se testent sur un texte modifié à la main.
 */
export function parseCreditMutuelText(doc: PdfText): ParsedBankStatement {
  const lines = allLines(doc);
  if (lines.length === 0) {
    throw new BankStatementError(
      "unreadable",
      "Ce PDF ne contient pas de texte (document scanné ?). Téléchargez le relevé original depuis votre banque en ligne.",
    );
  }
  assertCreditMutuel(doc);

  const drafts = readSections(doc);
  if (drafts.length === 0) {
    throw new BankStatementError(
      "unreadable",
      "Aucun compte n’a été trouvé dans ce relevé : sa mise en page n’est pas celle attendue.",
    );
  }
  const sections = drafts.map(checkSection);
  if (sections.every((section) => section.lines.length === 0)) {
    throw new BankStatementError(
      "no_operations",
      "Ce relevé ne contient aucune opération à importer.",
    );
  }

  return {
    bank: "credit_mutuel",
    statementDate: findStatementDate(lines) ?? sections.at(-1)?.closingDate ?? null,
    holder: findHolder(lines),
    iban: findIban(lines),
    bic: findBic(lines),
    sections,
  };
}

/** Lit un relevé PDF du Crédit Mutuel et vérifie qu'il tombe juste, au centime près. */
export async function parseCreditMutuelStatement(pdf: Uint8Array): Promise<ParsedBankStatement> {
  let doc: PdfText;
  try {
    doc = await extractPdfText(pdf);
  } catch (error) {
    if (error instanceof PdfTextError) {
      throw new BankStatementError("unreadable", error.message);
    }
    throw error;
  }
  return parseCreditMutuelText(doc);
}
