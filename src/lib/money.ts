/**
 * Les montants sont stockés en centimes, en entiers, pour que l'addition d'un
 * journal comptable reste exacte. La conversion et le formatage sont réunis ici
 * afin que l'appelant n'ait jamais à diviser par 100 lui-même.
 */

const EURO = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

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
