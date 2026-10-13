import { formatShortDate } from "@/lib/dates";
import type { XlsxCell, XlsxSheet } from "@/lib/xlsx";

/**
 * Liste des adhérents d'une année, à transmettre à l'APEL départementale.
 *
 * L'APEL d'établissement la doit chaque année : la départementale tient le
 * fichier du mouvement, adresse « Famille & éducation » aux familles et appelle
 * la part de cotisation qui remonte (nationale, académique, départementale,
 * magazine). Les modèles des départementales (Côtes-d'Armor, Morbihan,
 * Maine-et-Loire…) se ressemblent : en tête l'établissement, puis une ligne
 * par famille — nom et prénom du parent, e-mail, adresse postale — et en pied
 * le nombre d'adhésions multiplié par la cotisation.
 *
 * Ce qui part n'est que ce dont elle a besoin. Le don reste à l'APEL de
 * l'établissement, les notes aussi (elles parlent de paiements en double ou de
 * familles à rappeler) ; le téléphone et le règlement n'y servent à rien.
 *
 * Une famille déjà adhérente par un autre établissement ne règle ici que la
 * part de l'établissement : sa cotisation au mouvement est déjà remontée
 * ailleurs, et la compter une seconde fois lui ferait payer deux fois la part
 * départementale. Elle est donc écartée par défaut — on la reconnaît à sa
 * cotisation inférieure à la cotisation pleine de l'année (`cotisationPleine`).
 */
export interface AdherentExportable {
  firstName: string;
  lastName: string;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  membershipFeeCents: number;
}

export interface OptionsExportAdherents {
  annee: string;
  associationName: string;
  schoolName: string;
  /** Inclure, en les signalant, les familles adhérentes par un autre établissement. */
  autresEtablissements: boolean;
  /** Tarif de référence de l'année (`tarifDeReference`), ou null pour le lire sur les fiches. */
  tarifPublieCents: number | null;
  exporteLe: Date;
}

/** Une cellule du tableau : texte, nombre, montant en centimes, ou rien. */
export type CelluleExport = string | number | { cents: number } | null;

export interface TableauAdherents {
  /** Lignes d'en-tête au-dessus du tableau (titre, établissement, date). */
  titre: string[];
  entetes: string[];
  lignes: CelluleExport[][];
  /** Ligne de pied : nombre d'adhésions × cotisation = total. */
  pied: CelluleExport[];
  cotisationPleineCents: number;
  totalCents: number;
  retenus: number;
  /** Familles à cotisation réduite, écartées ou signalées selon l'option. */
  autresEtablissements: number;
}

/**
 * La cotisation pleine de l'année, à laquelle se mesure une cotisation réduite.
 *
 * Le tarif publié dans la configuration fait foi, mais seulement pour l'année
 * en cours : il ne dit rien du tarif d'il y a deux ans. Sans lui, elle se lit
 * sur les fiches de l'année — le montant que paient le plus de familles, le
 * plus élevé en cas d'égalité. Les fiches à 0 € ne comptent pas : exonérées ou
 * pas encore renseignées, elles ne disent rien du tarif.
 */
export function cotisationPleine(
  adherents: Pick<AdherentExportable, "membershipFeeCents">[],
  tarifPublieCents: number | null = null,
) {
  if (tarifPublieCents !== null && tarifPublieCents > 0) return tarifPublieCents;
  const effectifs = new Map<number, number>();
  for (const a of adherents) {
    if (a.membershipFeeCents <= 0) continue;
    effectifs.set(a.membershipFeeCents, (effectifs.get(a.membershipFeeCents) ?? 0) + 1);
  }
  let pleine = 0;
  let max = 0;
  for (const [montant, n] of effectifs) {
    if (n > max || (n === max && montant > pleine)) {
      pleine = montant;
      max = n;
    }
  }
  return pleine;
}

/** Le tarif publié ne vaut que pour l'année scolaire en cours (voir `cotisationPleine`). */
export function tarifDeReference(
  annee: string,
  anneeEnCours: string,
  tarifPublieCents: number | null,
): number | null {
  return annee === anneeEnCours ? tarifPublieCents : null;
}

/**
 * Une famille adhérente par un autre établissement : elle règle quelque chose,
 * mais moins que la cotisation pleine. Une fiche à 0 € n'en est pas une.
 */
export function viaAutreEtablissement(cotisationCents: number, pleineCents: number) {
  return cotisationCents > 0 && cotisationCents < pleineCents;
}

/** Montant à la française pour le texte : « 23,00 € ». */
function euros(cents: number) {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")} €`;
}

export function tableauAdherents(
  adherents: AdherentExportable[],
  options: OptionsExportAdherents,
): TableauAdherents {
  const pleine = cotisationPleine(adherents, options.tarifPublieCents);
  const reduites = adherents.filter((a) => viaAutreEtablissement(a.membershipFeeCents, pleine));
  const retenus = options.autresEtablissements
    ? adherents
    : adherents.filter((a) => !viaAutreEtablissement(a.membershipFeeCents, pleine));

  const ordre = new Intl.Collator("fr", { sensitivity: "base" });
  const tries = [...retenus].sort(
    (a, b) => ordre.compare(a.lastName, b.lastName) || ordre.compare(a.firstName, b.firstName),
  );

  const signaler = options.autresEtablissements && reduites.length > 0;
  const entetes = [
    "N°",
    "Nom",
    "Prénom",
    "E-mail",
    "Adresse",
    "Complément d'adresse",
    "Code postal",
    "Ville",
    "Cotisation",
    ...(signaler ? ["Adhésion"] : []),
  ];

  const lignes = tries.map((a, index): CelluleExport[] => [
    index + 1,
    a.lastName.toLocaleUpperCase("fr"),
    a.firstName,
    a.email,
    a.addressLine1,
    a.addressLine2,
    a.postalCode,
    a.city,
    { cents: a.membershipFeeCents },
    ...(signaler
      ? [viaAutreEtablissement(a.membershipFeeCents, pleine) ? "Via un autre établissement" : "Principale"]
      : []),
  ]);

  const totalCents = retenus.reduce((t, a) => t + a.membershipFeeCents, 0);
  const n = retenus.length;
  const libelleNombre = `${n} adhésion${n > 1 ? "s" : ""}`;
  const uniforme = retenus.every((a) => a.membershipFeeCents === pleine);
  // « Total » dans la colonne Ville, le montant sous les cotisations : le pied
  // se lit d'un trait, « 21 adhésions × 23,00 € … Total 483,00 € ».
  const pied: CelluleExport[] = [
    null,
    uniforme && n > 0 ? `${libelleNombre} × ${euros(pleine)}` : `Total : ${libelleNombre}`,
    null,
    null,
    null,
    null,
    null,
    "Total",
    { cents: totalCents },
    ...(signaler ? [null] : []),
  ];

  return {
    titre: [
      `Liste des adhérents ${options.annee}`,
      `${options.associationName} — ${options.schoolName}`,
      `Exportée le ${formatShortDate(options.exporteLe)}`,
    ],
    entetes,
    lignes,
    pied,
    cotisationPleineCents: pleine,
    totalCents,
    retenus: n,
    autresEtablissements: reduites.length,
  };
}

/** Montant pour un tableur, sans symbole, pour qu'il le lise comme un nombre : « 23,00 ». */
function montantCsv(cents: number) {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}

/**
 * Cellule CSV « ; ». Un nom ou un e-mail viennent souvent d'un formulaire
 * public (HelloAsso) : une valeur qui commence par « = », « + », « - » ou « @ »
 * serait prise pour une formule par le tableur qui ouvre le fichier. On la
 * neutralise par une apostrophe, comme le recommande l'OWASP.
 */
function celluleCsv(valeur: CelluleExport) {
  if (valeur === null) return "";
  if (typeof valeur === "number") return String(valeur);
  if (typeof valeur !== "string") return montantCsv(valeur.cents);
  const sure = /^[=+\-@\t\r]/.test(valeur) ? `'${valeur}` : valeur;
  return /[;"\r\n]/.test(sure) ? `"${sure.replaceAll('"', '""')}"` : sure;
}

/** Le même tableau en CSV « ; » UTF-8 avec BOM, comme le grand livre. */
export function formatAdherentsCsv(tableau: TableauAdherents): string {
  const lignes = [
    ...tableau.titre.map((t) => celluleCsv(t)),
    "",
    tableau.entetes.map(celluleCsv).join(";"),
    ...tableau.lignes.map((l) => l.map(celluleCsv).join(";")),
    "",
    tableau.pied.map(celluleCsv).join(";"),
  ];
  return `﻿${lignes.join("\r\n")}\r\n`;
}

function celluleXlsx(valeur: CelluleExport, bold = false): XlsxCell {
  if (valeur === null) return null;
  if (typeof valeur !== "object") return bold ? { value: valeur, bold } : valeur;
  return { value: valeur.cents / 100, euros: true, bold };
}

/** Le tableau en feuille Excel : titre en gras, en-tête figé et filtrable, pied en gras. */
export function feuilleAdherents(tableau: TableauAdherents, annee: string): XlsxSheet {
  return {
    name: `Adhérents ${annee}`,
    rows: [
      ...tableau.titre.map((t, i): XlsxCell[] => [celluleXlsx(t, i === 0)]),
      [],
      tableau.entetes,
      ...tableau.lignes.map((l) => l.map((c) => celluleXlsx(c))),
      // Une ligne vide sépare le pied du tableau : le filtre et le tri
      // d'Excel s'arrêtent avant, et le total ne se mêle pas aux familles.
      [],
      tableau.pied.map((c) => celluleXlsx(c, true)),
    ],
    columnWidths: [5, 22, 18, 30, 32, 22, 11, 22, 12, 26],
    headerRow: tableau.titre.length + 1,
  };
}
