/**
 * Boîte à justificatifs : les reçus déposés avant que leur écriture existe.
 *
 * Un ticket de caisse arrive souvent avant l'écriture qu'il justifie : la
 * dépense passera sur le relevé bancaire du mois, importé plus tard, ou sera
 * saisie quand le trésorier aura le temps. Le reçu attend dans la boîte, puis
 * on l'associe à son écriture, saisie à la main ou importée. Associé, il
 * devient le justificatif de l'écriture (`attachmentUrl`) et quitte la boîte.
 *
 * Un reçu peut justifier plusieurs écritures : un ticket de 100 € réglé 60 €
 * par carte et 40 € en espèces, une facture répartie sur deux catégories. Le
 * même fichier devient le justificatif de chacune — un justificatif commun —
 * et la somme de leurs montants doit retrouver celle du reçu : le compte y
 * est. Le reçu a pu quitter la boîte avec la première écriture ; la suivante
 * reprend alors le justificatif de celle-ci.
 *
 * Une écriture qui a déjà un justificatif n'en reçoit pas d'autre : on ne
 * remplace pas une pièce sans le voir. Une écriture validée, elle, peut encore
 * recevoir celui qui lui manque — le justificatif ne change ni le montant, ni
 * la date, ni le compte, donc rien de ce que la validation verrouille (le FEC
 * n'en porte pas trace : sa date de validation, tirée de `updatedAt`, ne
 * bouge pas).
 *
 * Ce module est pur : la fenêtre d'association et le serveur partagent ces
 * types et ce classement.
 */

/** Ce que l'écran reçoit d'un reçu en attente : des dates en texte. */
export interface ReceiptView {
  id: string;
  /** `/api/uploads/accounting-<uuid>/<nom>` : lisible par un administrateur. */
  fileUrl: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  /** Ce que c'est, en quelques mots (« Courses kermesse »), facultatif. */
  label: string | null;
  /** Montant lu sur le reçu, en centimes, facultatif : il aide à trouver l'écriture. */
  amountCents: number | null;
  /** Date du reçu (ISO, minuit à Paris), facultative. */
  receiptDate: string | null;
  createdAt: string;
  version: number;
}

/** Nombre de reçus déposés en une fois. */
export const RECEIPTS_PER_UPLOAD = 20;

/**
 * Ce qu'un reçu peut être : un PDF ou une photo. Le stockage comptable accepte
 * davantage (tableurs, documents bureautiques) pour les relevés et les pièces
 * jointes ; la boîte, elle, s'en tient aux reçus.
 */
export const RECEIPT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"] as const;

export function isReceiptFilename(filename: string) {
  const dot = filename.lastIndexOf(".");
  return (
    dot >= 0 &&
    (RECEIPT_EXTENSIONS as readonly string[]).includes(filename.slice(dot).toLowerCase())
  );
}

/** Ce dont le classement a besoin d'une écriture. */
export interface EcritureCandidate {
  id: string;
  label: string;
  amountCents: number;
  occurredAt: string;
  counterparty: string | null;
  attachmentUrl: string | null;
}

const JOUR = 24 * 60 * 60 * 1000;

function mots(texte: string) {
  return new Set(
    texte
      .toLocaleLowerCase("fr")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((mot) => mot.length >= 3),
  );
}

/**
 * Proximité d'une écriture et d'un reçu, pour proposer d'abord la bonne :
 * même montant surtout, puis date voisine, puis mots communs (libellé,
 * tiers, nom du fichier). 0 quand rien ne les rapproche.
 */
export function proximite(
  recu: Pick<ReceiptView, "amountCents" | "receiptDate" | "label" | "filename">,
  ecriture: EcritureCandidate,
): number {
  let score = 0;
  if (recu.amountCents !== null) {
    if (recu.amountCents === ecriture.amountCents) score += 100;
    else if (Math.abs(recu.amountCents - ecriture.amountCents) <= Math.max(100, recu.amountCents * 0.02)) {
      score += 30;
    }
  }
  if (recu.receiptDate) {
    const ecart = Math.abs(Date.parse(ecriture.occurredAt) - Date.parse(recu.receiptDate)) / JOUR;
    if (ecart <= 3) score += 40;
    else if (ecart <= 15) score += 20;
    else if (ecart <= 45) score += 5;
  }
  const duRecu = mots(`${recu.label ?? ""} ${recu.filename.replace(/\.[a-z0-9]+$/i, "")}`);
  if (duRecu.size > 0) {
    const deLEcriture = mots(`${ecriture.label} ${ecriture.counterparty ?? ""}`);
    for (const mot of duRecu) if (deLEcriture.has(mot)) score += 10;
  }
  return score;
}

/**
 * Les écritures qui peuvent recevoir ce reçu — celles sans justificatif —,
 * les plus proches d'abord, puis les plus récentes.
 */
export function ecrituresPourRecu<T extends EcritureCandidate>(
  recu: Pick<ReceiptView, "amountCents" | "receiptDate" | "label" | "filename">,
  ecritures: T[],
): { ecriture: T; score: number }[] {
  return ecritures
    .filter((e) => !e.attachmentUrl)
    .map((ecriture) => ({ ecriture, score: proximite(recu, ecriture) }))
    .sort(
      (a, b) =>
        b.score - a.score || Date.parse(b.ecriture.occurredAt) - Date.parse(a.ecriture.occurredAt),
    );
}

/** Les reçus de la boîte, les plus proches de cette écriture d'abord, puis les plus récents. */
export function recusPourEcriture<T extends ReceiptView>(
  ecriture: EcritureCandidate,
  recus: T[],
): { recu: T; score: number }[] {
  return recus
    .map((recu) => ({ recu, score: proximite(recu, ecriture) }))
    .sort((a, b) => b.score - a.score || Date.parse(b.recu.createdAt) - Date.parse(a.recu.createdAt));
}

/** Écart entre le montant d'un reçu et le total des écritures qu'il justifie. */
export type EtatDuCompte =
  /** Montant du reçu inconnu : rien à comparer. */
  | { etat: "inconnu" }
  | { etat: "juste" }
  | { etat: "manque"; ecartCents: number }
  | { etat: "depasse"; ecartCents: number };

export function etatDuCompte(
  montantRecuCents: number | null,
  totalCents: number,
): EtatDuCompte {
  if (montantRecuCents === null) return { etat: "inconnu" };
  if (totalCents === montantRecuCents) return { etat: "juste" };
  return totalCents < montantRecuCents
    ? { etat: "manque", ecartCents: montantRecuCents - totalCents }
    : { etat: "depasse", ecartCents: totalCents - montantRecuCents };
}

/** Un justificatif déjà associé, et les écritures qui le portent. */
export interface JustificatifAssocie<T extends EcritureCandidate> {
  url: string;
  /** Nom du fichier tiré de l'adresse (`/api/uploads/accounting-<id>/<nom>`). */
  filename: string;
  ecritures: T[];
  totalCents: number;
}

/** Le nom lisible d'un fichier conservé, d'après son adresse. */
export function nomDuFichier(url: string) {
  const dernier = url.split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? url;
  try {
    return decodeURIComponent(dernier);
  } catch {
    return dernier;
  }
}

/**
 * Les écritures regroupées par justificatif. Un groupe de plus d'une écriture
 * est un justificatif commun.
 */
export function justificatifsAssocies<T extends EcritureCandidate>(
  ecritures: T[],
): Map<string, JustificatifAssocie<T>> {
  const groupes = new Map<string, JustificatifAssocie<T>>();
  for (const ecriture of ecritures) {
    if (!ecriture.attachmentUrl) continue;
    const groupe = groupes.get(ecriture.attachmentUrl);
    if (groupe) {
      groupe.ecritures.push(ecriture);
      groupe.totalCents += ecriture.amountCents;
    } else {
      groupes.set(ecriture.attachmentUrl, {
        url: ecriture.attachmentUrl,
        filename: nomDuFichier(ecriture.attachmentUrl),
        ecritures: [ecriture],
        totalCents: ecriture.amountCents,
      });
    }
  }
  return groupes;
}

/**
 * Les justificatifs déjà associés à d'autres écritures, que celle-ci pourrait
 * partager : les plus proches d'abord (date voisine, mots communs), puis les
 * plus récents. Le montant ne départage pas : le reçu entier n'est connu que
 * de la boîte, et l'écriture n'en couvre qu'une partie.
 */
export function justificatifsPourEcriture<T extends EcritureCandidate>(
  ecriture: EcritureCandidate,
  ecritures: T[],
): { justificatif: JustificatifAssocie<T>; score: number }[] {
  const autres = ecritures.filter((e) => e.id !== ecriture.id);
  const derniere = (j: JustificatifAssocie<T>) =>
    Math.max(...j.ecritures.map((e) => Date.parse(e.occurredAt)));
  return [...justificatifsAssocies(autres).values()]
    .map((justificatif) => ({
      justificatif,
      score: Math.max(
        ...justificatif.ecritures.map((autre) =>
          proximite(
            {
              amountCents: null,
              receiptDate: autre.occurredAt,
              label: `${autre.label} ${autre.counterparty ?? ""}`,
              filename: justificatif.filename,
            },
            ecriture,
          ),
        ),
      ),
    }))
    .sort((a, b) => b.score - a.score || derniere(b.justificatif) - derniere(a.justificatif));
}
