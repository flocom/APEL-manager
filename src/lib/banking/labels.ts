import type { EntryPaymentMethod } from "./import-types";

/**
 * Lecture des libellés d'opérations bancaires : mode de paiement, nature,
 * tiers, référence, et une clé de regroupement.
 *
 * Le SENS d'une opération (débit ou crédit) ne se devine jamais ici : il vient
 * de la colonne du relevé. « VIR GALETTES DES ROIS » est un virement émis,
 * « VIR STRIPE » un virement reçu. Le sens sert seulement à départager ce que
 * le libellé laisse ouvert (un paiement par carte au crédit est un
 * remboursement).
 *
 * Tout est deviné, pour information : le trésorier garde la main sur chaque
 * écriture. Dans le doute, on rend null plutôt qu'une supposition.
 */

export type LabelInsight = {
  paymentMethod: EntryPaymentMethod | null;
  /** Nature lisible (« Frais bancaires », « Remise de chèques »…), ou null. */
  nature: string | null;
  /** Mot-clé de nature, pour rapprocher une catégorie par son nom. */
  natureKey:
    | "bank_fees"
    | "card_takings"
    | "cheque_deposit"
    | "cash_withdrawal"
    | "cash_deposit"
    | "transfer_in"
    | "transfer_out"
    | "online_payout"
    | "direct_debit"
    | "card_payment"
    | "interest"
    | null;
  cashMovement: boolean;
  counterparty: string | null;
  reference: string | null;
  /** Libellé réduit à ses mots, sans numéros ni références. */
  labelKey: string;
};

/** Majuscules, sans accents, espaces simples. */
export function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Clé de regroupement : les mots du libellé, sans ceux qui contiennent des chiffres. */
export function labelKey(label: string): string {
  return normalizeLabel(label)
    .split(" ")
    .filter((word) => word && !/\d/.test(word))
    .join(" ");
}

type Guess = Omit<LabelInsight, "labelKey" | "counterparty" | "reference"> & {
  counterparty?: string | null;
  reference?: string | null;
};

type Direction = "debit" | "credit";

/* ------------------------------------------------------------------------ */
/* Références et tiers                                                       */
/* ------------------------------------------------------------------------ */

/** Première capture d'un motif dans le libellé puis les détails. */
function findIn(texts: string[], pattern: RegExp): string | null {
  for (const text of texts) {
    const match = text.match(pattern);
    if (match) return match[1] ?? match[0];
  }
  return null;
}

/** Références de la banque : facture « SGT… », remise « N8412611 », guichet « REF39057A26 ». */
function bankReference(texts: string[]): string | null {
  return (
    findIn(texts, /\b(SGT\d{6,})\b/) ??
    findIn(texts, /\b(N\d{6,})\b/) ??
    findIn(texts, /\b(REF[0-9A-Z]{5,})\b/)
  );
}

/**
 * Identifiant de virement porté seul sur une ligne de détail
 * (« VK60691D35J2RB01 », « 7Q6N14JVVNX5RKZ ») : lettres ET chiffres, d'un
 * seul tenant, assez long pour ne pas être un mot.
 */
function transferReference(details: string[]): string | null {
  for (const detail of details) {
    if (/^[A-Z0-9]{10,}$/.test(detail) && /\d/.test(detail) && /[A-Z]/.test(detail)) {
      return detail;
    }
  }
  return null;
}

/** Mots d'un motif, pas d'un nom : « DONS » sous le nom du donateur, par exemple. */
const REASON_WORDS = new Set([
  "ADHESION",
  "ADHESIONS",
  "COTISATION",
  "COTISATIONS",
  "DON",
  "DONS",
  "FACTURE",
  "LOYER",
  "PAIEMENT",
  "PAYOUT",
  "REMBOURSEMENT",
  "SALAIRE",
  "VIREMENT",
]);

/** Un nom de personne ou d'organisme : des lettres, sans chiffres ni référence. */
function looksLikeName(normalized: string): boolean {
  return (
    normalized.length >= 2 &&
    normalized.length <= 70 &&
    /^[A-Z][A-Z'’.&/ -]*[A-Z.]$/.test(normalized) &&
    !REASON_WORDS.has(normalized)
  );
}

/** Le nom tel qu'imprimé (accents compris), s'il en a l'air. */
function nameOrNull(printed: string): string | null {
  return looksLikeName(normalizeLabel(printed)) ? printed : null;
}

/** « VIR INST TRAILEURS SOLIDAIRES » → « TRAILEURS SOLIDAIRES ». */
function afterTransferPrefix(label: string): string | null {
  const rest = label
    .replace(/^(?:VIREMENT|VIRT|VIR)\b\.?\s*/i, "")
    .replace(/^(?:(?:INST|SEPA|PERIOD\.?|PERM|RECU|DE)\b\.?\s*)+/i, "")
    .trim();
  return rest ? nameOrNull(rest) : null;
}

/**
 * Commerçant d'un paiement par carte : « TCL CARTE 02892630 » sous « PAIEMENT
 * CB 2905 LYON », ou le libellé lui-même pour les petits paiements regroupés
 * (« METRO FRANCE CARTE 1716383241 »).
 */
function cardMerchant(texts: string[]): string | null {
  for (const text of texts) {
    const match = text.match(/^(.+?)\s+CARTE\s+(?:\d{6,}|[*X]+\d{4})$/i);
    if (match && !/^(?:PAIEMENT|CB|RETRAIT)\b/i.test(match[1])) return match[1].trim();
  }
  return null;
}

/* ------------------------------------------------------------------------ */
/* Règles                                                                    */
/* ------------------------------------------------------------------------ */

const CARD_NUMBER = /\bCARTE\s+(?:\d{6,}|[*X]{2,}\d{4})\b/;

function fees(nature: string, direction: Direction): Guess {
  return {
    paymentMethod: "other",
    natureKey: "bank_fees",
    nature: direction === "credit" ? "Remboursement de frais bancaires" : nature,
    cashMovement: false,
  };
}

/** Le libellé et ses détails, normalisés pour les règles, et tels qu'imprimés pour les tiers. */
type Texts = { label: string; details: string[]; printedLabel: string; printedDetails: string[] };

/**
 * Règles du plus précis au plus général, sur le libellé normalisé (première
 * ligne). Les détails ne servent qu'aux tiers et références, et à reconnaître
 * un reversement HelloAsso (« HELLOASSO 2963920 07012026 » sous « VIR STRIPE »).
 */
function guess(texts: Texts, direction: Direction): Guess | null {
  const { label, details, printedLabel, printedDetails } = texts;
  const all = [label, ...details];

  // Facture mensuelle de tenue de compte : « FACT SGT26390570000360 ».
  if (/^FACT(?:URE)?\s*SGT/.test(label)) {
    return { ...fees("Frais bancaires", direction), reference: findIn([label], /\b(SGT\d{6,})\b/) };
  }

  // Terminal de paiement : remise des encaissements, commission, location.
  // Le CIC colle parfois les mots (« REMCB », « COMCB »).
  if (/^TPE\b/.test(label)) {
    if (/\bCOM ?CB\b/.test(label)) return fees("Commission carte bancaire", direction);
    if (/\b(?:FR ?)?LOC\b/.test(label)) return fees("Location du terminal de paiement", direction);
    if (/\bREM ?CB\b/.test(label) || direction === "credit") {
      return {
        paymentMethod: "card",
        natureKey: "card_takings",
        nature:
          direction === "credit"
            ? "Encaissement carte bancaire"
            : "Annulation d’encaissement carte bancaire",
        cashMovement: false,
      };
    }
    return fees("Frais du terminal de paiement", direction);
  }

  if (
    /^(?:F\s+[A-Z]{3,}|FRAIS\b|COMMISSIONS?\b|COM\s+(?:INTERVENTION|TENUE)\b|COTIS(?:ATION)?\b|AGIOS\b|INTERETS DEBITEURS\b|DROITS DE GARDE\b|ABONNEMENT\s+(?:EUROCOMPTE|OFFRE|CONVENTION)\b)/.test(
      label,
    )
  ) {
    return fees("Frais bancaires", direction);
  }

  // Espèces : retrait au distributeur ou au guichet (« RET 270326
  // REF39057B02 »), versement (« VRST REF39057A23 »). L'argent change
  // seulement de poche : de la banque à la caisse, ou l'inverse.
  if (/^(?:RETRAIT\b|RET\s+DAB\b|RET\s+\d{6}\b)/.test(label)) {
    return {
      paymentMethod: "cash",
      natureKey: "cash_withdrawal",
      nature: direction === "debit" ? "Retrait d’espèces" : "Annulation de retrait d’espèces",
      cashMovement: direction === "debit",
      reference: bankReference(all),
    };
  }
  if (/^(?:VRST|VERST|VERSEMENT)\b/.test(label) && !/\b(?:LIVRET|EPARGNE)\b/.test(label)) {
    return {
      paymentMethod: "cash",
      natureKey: "cash_deposit",
      nature: direction === "credit" ? "Versement d’espèces" : "Annulation de versement d’espèces",
      cashMovement: direction === "credit",
      reference: bankReference(all),
    };
  }

  // Chèques : remise (« REM CHQ N8412611 REF39057A26 ») ou chèque émis
  // (« CHEQUE 6070656 »).
  if (/^REM(?:ISE)?\s*(?:DE\s+)?CH(?:Q|EQUES?)\b/.test(label)) {
    return {
      paymentMethod: "check",
      natureKey: "cheque_deposit",
      nature: "Remise de chèques",
      cashMovement: false,
      reference: bankReference(all),
    };
  }
  const cheque = label.match(/^(?:CHEQUE|CHQ)\.?\s*(?:N[O°]?\s*)?(\d{5,})\b/);
  if (cheque) {
    return direction === "debit"
      ? { paymentMethod: "check", natureKey: null, nature: "Chèque émis", cashMovement: false, reference: cheque[1] }
      : {
          paymentMethod: "check",
          natureKey: "cheque_deposit",
          nature: "Remise de chèques",
          cashMovement: false,
          reference: cheque[1],
        };
  }

  // Carte : « PAIEMENT CB 2905 LYON », « PAIEMENT PSC » (sans contact),
  // « CB … », et les petits paiements regroupés sans préfixe
  // (« METRO FRANCE CARTE 1716383241 »). Au crédit, c'est un remboursement.
  if (/^(?:PAIEMENT\s+(?:CB|PSC|CARTE)\b|CB\b|ACHAT\s+CB\b|CARTE\s+\d{2}\/\d{2}\b)/.test(label) || CARD_NUMBER.test(label)) {
    return {
      paymentMethod: "card",
      natureKey: "card_payment",
      nature: direction === "debit" ? "Paiement par carte" : "Remboursement sur la carte",
      cashMovement: false,
      counterparty: cardMerchant([printedLabel, ...printedDetails]),
    };
  }

  // Prélèvements : « PRLV SEPA FREE MOBILE » ; le créancier suit le préfixe.
  if (/^(?:PRLV|PRELEVEMENT|PRELEV|TIP|ECH(?:EANCE)?\s+PRET)\b/.test(label)) {
    const creditor = printedLabel
      .replace(/^(?:PRLV|PRELEVEMENT|PRELEV|TIP)\b\s*(?:SEPA\b\s*)?/i, "")
      .trim();
    return {
      paymentMethod: "direct_debit",
      natureKey: "direct_debit",
      nature: direction === "debit" ? "Prélèvement" : "Remboursement de prélèvement",
      cashMovement: false,
      counterparty: creditor ? nameOrNull(creditor) : null,
    };
  }

  // Virements.
  if (/^(?:VIREMENT|VIRT|VIR)\b/.test(label)) {
    const everything = all.join(" ");
    if (direction === "credit" && /HELLO ?ASSO/.test(everything)) {
      return {
        paymentMethod: "bank_transfer",
        natureKey: "online_payout",
        nature: "Reversement HelloAsso",
        cashMovement: false,
        counterparty: "HelloAsso",
        reference: findIn(details, /\bHELLOASSO\s+(\d{5,})\b/) ?? transferReference(details),
      };
    }
    if (direction === "credit" && /\bSUMUP\b/.test(everything)) {
      // Encaissements du terminal SumUp, reversés par virement.
      return {
        paymentMethod: "bank_transfer",
        natureKey: "card_takings",
        nature: "Reversement SumUp (encaissements carte)",
        cashMovement: false,
        counterparty: "SumUp",
        reference: transferReference(details),
      };
    }
    if (direction === "credit" && /^(?:VIR\S*\s+(?:INST\s+|SEPA\s+)?)?STRIPE\b/.test(label)) {
      return {
        paymentMethod: "bank_transfer",
        natureKey: "online_payout",
        nature: "Reversement Stripe",
        cashMovement: false,
        counterparty: "Stripe",
        reference: transferReference(details),
      };
    }
    if (direction === "credit") {
      // Le nom du payeur est la première ligne de détail ; à défaut, ce qui
      // suit « VIR » dans le libellé.
      const payer = printedDetails.length > 0 ? nameOrNull(printedDetails[0]) : null;
      return {
        paymentMethod: "bank_transfer",
        natureKey: "transfer_in",
        nature: "Virement reçu",
        cashMovement: false,
        counterparty: payer ?? afterTransferPrefix(printedLabel),
        reference: transferReference(details),
      };
    }
    // Virement émis : le texte est le motif choisi par le trésorier, pas le
    // nom du bénéficiaire.
    return {
      paymentMethod: "bank_transfer",
      natureKey: "transfer_out",
      nature: "Virement émis",
      cashMovement: false,
      counterparty: null,
      reference: transferReference(details),
    };
  }

  if (/^(?:INTERETS?|INT\.?\s+CREDITEURS)\b/.test(label)) {
    return direction === "credit"
      ? { paymentMethod: "other", natureKey: "interest", nature: "Intérêts", cashMovement: false }
      : fees("Intérêts débiteurs", direction);
  }

  return null;
}

/** Annulations et rejets : même mode que l'opération d'origine, nature précisée. */
const REVERSAL_PREFIXES: Record<string, string> = {
  ANNUL: "Annulation",
  ANNULATION: "Annulation",
  REJET: "Rejet",
  IMPAYE: "Impayé",
  RETOUR: "Retour",
  REMB: "Remboursement",
  REMBT: "Remboursement",
  RBT: "Remboursement",
};

export function analyzeLabel(
  label: string,
  details: string[],
  direction: Direction,
): LabelInsight {
  const tidy = (text: string) => text.replace(/\s+/g, " ").trim();
  const printedDetails = details.map(tidy).filter(Boolean);
  const texts: Texts = {
    label: normalizeLabel(label),
    details: printedDetails.map(normalizeLabel),
    printedLabel: tidy(label),
    printedDetails,
  };
  const normalized = texts.label;
  const normalizedDetails = texts.details;
  const key = labelKey(label);

  const reversal = normalized.match(
    /^(ANNULATION|ANNUL|REJET|IMPAYE|RETOUR|REMBT|REMB|RBT)\b\.?\s*(?:DE\s+|D')?(.*)$/,
  );
  if (reversal && reversal[2]) {
    // On lit l'opération d'origine, passée dans l'autre sens (un prélèvement
    // rejeté revient au crédit), sans deviner de catégorie : un rejet de
    // prélèvement n'est pas un prélèvement.
    const rest = reversal[2];
    const inner = guess(
      { ...texts, label: rest, printedLabel: texts.printedLabel.slice(-rest.length) },
      direction === "debit" ? "credit" : "debit",
    );
    const prefix = REVERSAL_PREFIXES[reversal[1]];
    return {
      paymentMethod: inner?.paymentMethod ?? null,
      nature: inner?.nature ? `${prefix} (${inner.nature.toLowerCase()})` : prefix,
      natureKey: null,
      cashMovement: false,
      counterparty: inner?.counterparty ?? null,
      reference: inner?.reference ?? bankReference([reversal[2], ...normalizedDetails]),
      labelKey: key,
    };
  }

  const found = guess(texts, direction);
  if (!found) {
    return {
      paymentMethod: null,
      nature: null,
      natureKey: null,
      cashMovement: false,
      counterparty: null,
      reference: null,
      labelKey: key,
    };
  }
  return {
    paymentMethod: found.paymentMethod,
    nature: found.nature,
    natureKey: found.natureKey,
    cashMovement: found.cashMovement,
    counterparty: found.counterparty ?? null,
    reference: found.reference ?? null,
    labelKey: key,
  };
}
