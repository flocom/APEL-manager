/**
 * Comptes du plan comptable associatif (règlement ANC n° 2018-06) proposés
 * pour les catégories : partagé entre l'écran des catégories, qui affiche le
 * compte retenu, et l'export comptable (FEC), qui l'utilise.
 */

/** Plan comptable des associations (règlement ANC n° 2018-06), comptes usuels d'une APEL. */
const CATEGORY_RULES: { type: "income" | "expense"; pattern: RegExp; code: string; label: string }[] = [
  { type: "income", pattern: /COTIS|ADHESION/, code: "756000", label: "Cotisations" },
  { type: "income", pattern: /DON|MECENAT|LEGS/, code: "754000", label: "Dons manuels" },
  { type: "income", pattern: /SUBVENTION/, code: "740000", label: "Subventions d’exploitation" },
  { type: "income", pattern: /INTERET|FINANCIER|LIVRET/, code: "768000", label: "Autres produits financiers" },
  { type: "income", pattern: /VENTE|MANIFESTATION|KERMESSE|FETE|BILLET|BUVETTE|REPAS/, code: "707000", label: "Ventes de marchandises" },
  { type: "income", pattern: /PARTICIPATION|SORTIE|VOYAGE/, code: "706000", label: "Prestations de services" },
  { type: "expense", pattern: /FRAIS BANCAIRE|BANQUE|BANCAIRE|COMMISSION|AGIOS/, code: "627000", label: "Services bancaires et assimilés" },
  { type: "expense", pattern: /ASSURANCE/, code: "616000", label: "Primes d’assurance" },
  { type: "expense", pattern: /COTISATION|FEDERATION|APEL DEPARTEMENTALE|UDAPEL/, code: "628100", label: "Cotisations (liées à l’activité)" },
  { type: "expense", pattern: /FOURNITURE|FONCTIONNEMENT|PAPETERIE/, code: "606400", label: "Fournitures administratives" },
  { type: "expense", pattern: /CADEAU|ANIMATION/, code: "623400", label: "Cadeaux" },
  { type: "expense", pattern: /PROJET|ECOLE|DON VERSE|AIDE/, code: "657000", label: "Aides et subventions versées" },
  { type: "expense", pattern: /ACHAT|MANIFESTATION|KERMESSE|FETE|MARCHANDISE/, code: "607000", label: "Achats de marchandises" },
  { type: "expense", pattern: /DEPLACEMENT|TRANSPORT/, code: "625100", label: "Voyages et déplacements" },
  { type: "expense", pattern: /LOCATION/, code: "613000", label: "Locations" },
];
export const DEFAULT_CODES = {
  income: { code: "758000", label: "Produits divers de gestion courante" },
  expense: { code: "658000", label: "Charges diverses de gestion courante" },
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
}

/** Compte proposé pour une catégorie d'après son nom (affiché aussi dans l'écran des catégories). */
export function defaultCategoryLedger(name: string, type: "income" | "expense") {
  const key = normalize(name);
  const rule = CATEGORY_RULES.find((r) => r.type === type && r.pattern.test(key));
  return rule ? { code: rule.code, label: rule.label } : DEFAULT_CODES[type];
}

/** Compte du plan : chiffres seulement, complété à six chiffres (« 756 » → « 756000 »). */
export function normalizeLedgerCode(code: string): string {
  const digits = code.replace(/\D/g, "");
  return digits.length >= 6 ? digits : digits.padEnd(6, "0");
}
