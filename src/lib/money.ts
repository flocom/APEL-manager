/**
 * Les montants sont stockés en centimes, en entiers, pour que l'addition d'un
 * journal comptable reste exacte. La conversion et le formatage sont réunis ici
 * afin que l'appelant n'ait jamais à diviser par 100 lui-même.
 */

const EURO = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

/**
 * Plafond d'un montant saisi, en centimes : un million d'euros.
 *
 * Aucune association de parents n'encaisse ni ne dépense autant en une seule
 * écriture ; au-delà, c'est une faute de frappe (des centimes tapés comme des
 * euros, un zéro de trop). L'ancien plafond collait à la limite d'un entier
 * 32 bits : deux écritures à ce montant suffisaient à faire déborder le total
 * du grand livre, et la page Comptabilité ne s'affichait plus du tout.
 */
export const MONTANT_MAX_CENTIMES = 100_000_000;

/**
 * Convertit une somme renvoyée par Postgres en nombre JavaScript.
 *
 * Les sommes sont calculées en `bigint` — une somme d'entiers 32 bits déborde
 * vite — et le pilote les rend sous forme de chaîne, pour ne rien perdre. La
 * conversion n'est sûre que tant que le total reste un entier exact en
 * JavaScript (9 × 10¹⁵ centimes) : au-delà, on préfère une erreur franche à un
 * total faux affiché au trésorier.
 */
export function centimesDepuisSql(valeur: unknown): number {
  const nombre = Number(valeur ?? 0);
  if (!Number.isSafeInteger(nombre)) {
    throw new Error(`Montant hors des limites de calcul : ${String(valeur)}`);
  }
  return nombre;
}

/** Montant en centimes → « 1 234,56 € ». */
export function formatEuros(cents: number): string {
  return EURO.format(cents / 100);
}

/**
 * Montant sans son signe, quand celui-ci est déjà porté par la mise en forme
 * (une dépense affichée en rouge précédée d'un « − »).
 */
export function formatEurosAbsolute(cents: number): string {
  return EURO.format(Math.abs(cents) / 100);
}
