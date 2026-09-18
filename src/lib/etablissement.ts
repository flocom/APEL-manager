/**
 * « de » devant le nom d'un établissement scolaire.
 *
 * L'application sert plusieurs associations, et les noms d'établissement ne se
 * ressemblent pas : « École Notre Dame des Flots », « Collège Saint-Joseph »,
 * « Sainte-Marie ». La règle d'élision seule donnait « les parents d'élèves
 * d'École Notre Dame des Flots », qu'aucun parent n'écrirait — il manque
 * l'article devant le nom commun.
 *
 * On ne traite que ce qu'on sait traiter : quand le nom commence par un nom
 * commun d'établissement, on pose l'article qui lui convient ; sinon on s'en
 * tient à l'élision, qui suffit pour « de Sainte-Marie » ou « d'Ozanam ».
 */

interface NomCommun {
  /** Début du nom, en minuscules sans accents. */
  prefixe: string;
  genre: "m" | "f";
  /** Vrai quand le mot commence par une voyelle : l'article s'élide. */
  voyelle: boolean;
}

const NOMS_COMMUNS: NomCommun[] = [
  { prefixe: "ecole", genre: "f", voyelle: true },
  { prefixe: "institution", genre: "f", voyelle: true },
  { prefixe: "maison", genre: "f", voyelle: false },
  { prefixe: "college", genre: "m", voyelle: false },
  { prefixe: "lycee", genre: "m", voyelle: false },
  { prefixe: "groupe scolaire", genre: "m", voyelle: false },
  { prefixe: "ensemble scolaire", genre: "m", voyelle: true },
  { prefixe: "institut", genre: "m", voyelle: true },
  { prefixe: "cours", genre: "m", voyelle: false },
];

function sansAccents(valeur: string): string {
  return valeur.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Vrai quand « de » s'élide devant ce mot. */
function commenceParUneVoyelle(nom: string): boolean {
  return /^[aeiouyàâäéèêëîïôöûü]/i.test(nom.trim());
}

/**
 * Rend « de l'École Sainte-Marie », « du Collège Saint-Joseph », « de
 * Sainte-Marie » ou « d'Ozanam », selon le nom reçu.
 */
export function deEtablissement(nom: string): string {
  const propre = nom.trim();
  if (!propre) return "";

  const compare = sansAccents(propre);
  const commun = NOMS_COMMUNS.find(
    (c) =>
      compare === c.prefixe ||
      compare.startsWith(`${c.prefixe} `) ||
      compare.startsWith(`${c.prefixe}-`),
  );

  if (commun) {
    // « Institut » est masculin et commence par une voyelle : « de l'Institut »,
    // et non « du Institut ». L'élision l'emporte sur le genre.
    if (commun.voyelle) return `de l’${propre}`;
    return commun.genre === "m" ? `du ${propre}` : `de la ${propre}`;
  }

  return commenceParUneVoyelle(propre) ? `d’${propre}` : `de ${propre}`;
}
