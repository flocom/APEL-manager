/**
 * Contrat entre le serveur et l'écran d'import des relevés bancaires.
 *
 * Le déroulé :
 * 1. L'écran téléverse chaque PDF par la route habituelle des fichiers
 *    (`/api/uploads`, portée « accounting ») : seule cette route accepte un
 *    envoi de fichier, et le relevé reste ainsi parmi les pièces de la
 *    comptabilité.
 * 2. `POST /api/accounting/bank-imports/analyze` lit les relevés, vérifie
 *    qu'ils viennent bien de la banque choisie et que leurs soldes concordent,
 *    puis classe chaque opération : nouvelle, déjà importée, ou doublon
 *    possible d'une écriture existante.
 * 3. Le trésorier tranche chaque doute, choisit les catégories, puis
 *    `POST /api/accounting/bank-imports` enregistre le tout. Le serveur refait
 *    l'analyse et refuse l'enregistrement si elle a changé entre-temps
 *    (`token`) : un autre import, une écriture ajoutée à la main…
 *
 * Ce fichier ne contient que des types et des constantes : il est importé des
 * deux côtés.
 */

export const SUPPORTED_BANKS = {
  credit_mutuel: {
    label: "Crédit Mutuel",
    formats: "Relevés de compte PDF (« Extrait de comptes »)",
  },
} as const;

export type SupportedBank = keyof typeof SUPPORTED_BANKS;

export function isSupportedBank(value: unknown): value is SupportedBank {
  return typeof value === "string" && Object.hasOwn(SUPPORTED_BANKS, value);
}

/** Modes de paiement des écritures (mêmes valeurs que le formulaire d'écriture). */
export type EntryPaymentMethod =
  | "bank_transfer"
  | "card"
  | "check"
  | "cash"
  | "direct_debit"
  | "other";

/**
 * - `new` : opération jamais vue, à importer (ou à écarter) ;
 * - `already_imported` : déjà traitée par un import précédent, ou présente
 *   dans un autre relevé du même envoi — écartée d'office, sans question ;
 * - `doubt` : une écriture existante lui ressemble (même sens, même montant,
 *   date proche) ou l'écriture importée autrefois a été supprimée — le
 *   trésorier doit trancher avant l'enregistrement.
 */
export type BankLineState = "new" | "already_imported" | "doubt";

export type DuplicateCandidate = {
  entryId: string;
  label: string;
  amountCents: number;
  /** Instant ISO de l'écriture (minuit à Paris pour une date saisie). */
  occurredAt: string;
  status: "draft" | "posted";
  accountName: string | null;
  categoryName: string | null;
  counterparty: string | null;
};

export type AlreadyImportedInfo = {
  /** `batch` : l'opération figure dans un autre relevé du même envoi. */
  source: "previous_import" | "batch";
  importedAt: string | null;
  decision: "imported" | "linked" | "skipped" | null;
  entryId: string | null;
  entryLabel: string | null;
};

export type AnalyzedLine = {
  /** Identifiant stable de l'opération (voir `bankStatementLines.fingerprint`). */
  fingerprint: string;
  operationDate: string /* YYYY-MM-DD */;
  valueDate: string | null;
  label: string;
  details: string[];
  amountCents: number;
  direction: "debit" | "credit";
  type: "income" | "expense";
  /** Libellé réduit à ses mots (sans numéros ni références), pour regrouper les opérations semblables. */
  labelKey: string;
  paymentMethod: EntryPaymentMethod | null;
  reference: string | null;
  counterparty: string | null;
  /** Nature devinée d'après le libellé (« Frais bancaires », « Remise de chèques »…), pour information. */
  nature: string | null;
  /**
   * Retrait ou versement d'espèces : l'argent passe de la banque à la caisse
   * (ou l'inverse). L'écran le signale : ce n'est pas une dépense de
   * l'association.
   */
  cashMovement: boolean;
  suggestedCategoryId: string | null;
  suggestedEventId: string | null;
  state: BankLineState;
  alreadyImported: AlreadyImportedInfo | null;
  doubtReason: "similar_entry" | "deleted_entry" | null;
  candidates: DuplicateCandidate[];
};

export type AnalyzedSection = {
  /** `<fileSha256>:<accountNumber>` : repère la section d'un relevé dans la décision. */
  key: string;
  accountNumber: string;
  accountLabel: string;
  openingDate: string;
  closingDate: string;
  openingBalanceCents: number;
  closingBalanceCents: number;
  totalDebitCents: number;
  totalCreditCents: number;
  suggestedAccountId: string | null;
  /**
   * Pourquoi ce compte est proposé : son numéro de relevé est déjà connu
   * (`number`), son nom ou sa description contient le numéro (`name`), c'est
   * le seul compte bancaire sans numéro (`single`), ou rien (`none`).
   */
  accountMatch: "number" | "name" | "single" | "none";
  /** Ce relevé a déjà été importé pour ce compte (même fichier). */
  previousImport: { importedAt: string; importedBy: string | null } | null;
  lines: AnalyzedLine[];
};

export type AnalyzedStatement =
  | {
      ok: true;
      fileUrl: string;
      fileName: string;
      fileSha256: string;
      bank: SupportedBank;
      statementDate: string | null;
      holder: string | null;
      iban: string | null;
      sections: AnalyzedSection[];
    }
  | {
      ok: false;
      fileUrl: string;
      fileName: string;
      /** `not_credit_mutuel`, `unreadable`, `inconsistent`, `no_operations`, `duplicate_file`, `not_found`… */
      code: string;
      error: string;
    };

export type BankImportAnalysis = {
  bank: SupportedBank;
  statements: AnalyzedStatement[];
  /** Empreinte de l'analyse, renvoyée telle quelle à l'enregistrement. */
  token: string;
};

export type BankImportAnalyzeRequest = {
  bank: SupportedBank;
  files: { fileUrl: string; fileName: string }[];
};

export type LineDecision =
  | {
      fingerprint: string;
      action: "import";
      label: string;
      categoryId: string | null;
      eventId: string | null;
      /**
       * Retrait ou versement d'espèces (`cashMovement`) : compte de caisse sur
       * lequel passer l'écriture miroir (une recette en caisse pour un
       * retrait, une dépense pour un versement), pour que le mouvement interne
       * s'annule dans le résultat. Absent ou null : pas d'écriture miroir.
       */
      cashAccountId?: string | null;
    }
  | { fingerprint: string; action: "skip" }
  | { fingerprint: string; action: "link"; entryId: string };

export type BankImportCommitRequest = {
  bank: SupportedBank;
  token: string;
  status: "draft" | "posted";
  statements: {
    fileUrl: string;
    fileName: string;
    /** `accountId: null` : section laissée de côté (ses opérations ne sont pas enregistrées). */
    sections: { key: string; accountId: string | null }[];
  }[];
  /** Une décision par opération `new` ou `doubt` des sections importées. */
  decisions: LineDecision[];
};

export type BankImportSummary = {
  id: string;
  bank: SupportedBank;
  accountId: string | null;
  accountName: string | null;
  accountNumber: string;
  statementDate: string | null;
  periodStart: string;
  periodEnd: string;
  openingBalanceCents: number;
  closingBalanceCents: number;
  importedCount: number;
  linkedCount: number;
  skippedCount: number;
  fileUrl: string;
  fileName: string | null;
  createdAt: string;
  createdByName: string | null;
  /** Annulable tant que toutes ses écritures sont encore des brouillons. */
  canUndo: boolean;
};

export type BankImportCommitResult = {
  imports: BankImportSummary[];
  imported: number;
  linked: number;
  skipped: number;
};
