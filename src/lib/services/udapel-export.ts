import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { currentSchoolYear } from "@/lib/dates";
import { db } from "@/lib/db";
import { associationMembers } from "@/lib/db/schema";
import {
  CIVILITIES,
  CIVILITY_LABELS,
  isCivility,
  memberCompleteness,
  splitStreetNumber,
  type MemberInfoField,
} from "@/lib/member-info/completeness";
import {
  buildXlsx,
  XLSX_CONTENT_TYPE,
  type XlsxCell,
  type XlsxCellInput,
  type XlsxSheet,
  type XlsxStyle,
} from "@/lib/xlsx/writer";

import { getAssociationSettings } from "./association-settings";
import { recordAudit, type AuditActor } from "./audit";

/**
 * Le tableau des familles adhérentes que l'Apel départementale (UDAPEL)
 * demande chaque année, au format de son modèle : deux onglets — les familles
 * qui règlent la part nationale (17,50 €) via notre Apel, puis celles qui la
 * règlent dans un autre établissement —, trois lignes de titres, les en-têtes
 * en ligne 5 et une famille par ligne à partir de la ligne 6.
 *
 * Sont déclarées les fiches de l'année au statut « actif » : c'est la
 * définition d'un adhérent partout dans l'application (compteur des familles,
 * filtre de la liste), et la synchronisation HelloAsso y fait passer une
 * fiche dès que la cotisation est réglée. Une fiche « en attente » n'est pas
 * encore une adhésion, même si un règlement y est noté.
 *
 * Les informations obligatoires manquantes (voir `memberCompleteness`) sont
 * surlignées en jaune : le fichier reste téléchargeable, pour que le bureau
 * voie d'un coup d'œil ce qu'il faut encore obtenir des familles.
 */

const schoolYear = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{4}$/, "Format attendu : 2026-2027")
  .refine((value) => {
    const [start, end] = value.split("-").map(Number);
    return end === start + 1;
  }, "Les deux années doivent être consécutives");

export const udapelExportSchema = z.object({
  schoolYear: schoolYear.optional(),
});

export type UdapelMember = Pick<
  typeof associationMembers.$inferSelect,
  | "firstName"
  | "lastName"
  | "civility"
  | "streetNumber"
  | "addressLine1"
  | "addressLine2"
  | "locality"
  | "postalCode"
  | "city"
  | "country"
  | "phone"
  | "email"
  | "nationalFeeElsewhere"
  | "otherSchoolName"
>;

// ---------------------------------------------------------------------------
// Mise en page du modèle
// ---------------------------------------------------------------------------

const ROSE = "CE007F";
const TURQUOISE = "1DB3AE";
const JAUNE = "FFFF00";

/** Largeurs des colonnes A à M du modèle, en caractères. */
const LARGEURS = [6.71, 24.43, 12.71, 25.14, 14.57, 24.43, 20.29, 12.71, 25.71, 12.71, 13.86, 31.14, 21.57];

const DONNEE: XlsxStyle = { border: "thin", vertical: "center" };
const A_COMPLETER: XlsxStyle = { ...DONNEE, fill: JAUNE };
const EN_TETE: XlsxStyle = {
  bold: true,
  border: "thin",
  horizontal: "center",
  vertical: "center",
  wrap: true,
};

/** Un onglet du modèle, tel que l'Apel départementale l'a dessiné. */
interface Onglet {
  nom: string;
  /** Second onglet : la colonne M nomme l'établissement où la part est réglée. */
  autreEtablissement: boolean;
  accent: string;
  mention: string;
  /** En-têtes de la ligne 5, colonne A d'abord (textes du modèle, à l'espace près). */
  enTetes: string[];
  /** Dernière colonne des titres fusionnés des lignes 1 et 2. */
  finTitre: string;
  /** Cellule de l'année (« Adhésions 26 / 27 »). */
  colonneAnnee: number;
  /** « APEL et Commune : » puis le cadre où figurent l'Apel et sa commune. */
  libelle: { debut: number; fin: number };
  cadre: { debut: number; fin: number };
}

const EN_TETES_COMMUNS = ["Civilité", "Nom", "Prénom"];

const ONGLETS: [Onglet, Onglet] = [
  {
    nom: "17,50 € via votre Apel",
    autreEtablissement: false,
    accent: ROSE,
    mention: "* uniquement les familles réglant les 17,50 € via votre Apel",
    enTetes: [
      ...EN_TETES_COMMUNS,
      "Complément / Lieu Dit",
      "N° Voie",
      "Voie",
      "Complément",
      "CP",
      "Ville",
      "Pays",
      "téléphone ",
      "Email",
    ],
    finTitre: "J",
    colonneAnnee: 11,
    libelle: { debut: 6, fin: 7 },
    cadre: { debut: 8, fin: 11 },
  },
  {
    nom: "17,50 € via une autre Apel",
    autreEtablissement: true,
    accent: TURQUOISE,
    mention: "* uniquement les familles réglant les 17,50 € via un autre établissement",
    enTetes: [
      ...EN_TETES_COMMUNS,
      "Complément Voie",
      "N° Voie",
      "Voie",
      "Lieu Dit",
      "CP",
      "Ville",
      "Pays",
      "téléphone ",
      "Email",
      "Autre établissement",
    ],
    finTitre: "K",
    colonneAnnee: 12,
    libelle: { debut: 6, fin: 8 },
    cadre: { debut: 10, fin: 12 },
  },
];

/** Colonnes surlignées quand un champ obligatoire manque (A = 0). */
const COLONNES_OBLIGATOIRES: Partial<Record<MemberInfoField, number[]>> = {
  civility: [0],
  // Voie ou lieu-dit : les deux cases restent jaunes tant que ni l'une ni l'autre n'est remplie.
  street: [5, 6],
  postalCode: [7],
  city: [8],
  country: [9],
  otherSchoolName: [12],
};

function lettre(index: number) {
  return String.fromCharCode(65 + index);
}

/** « 2026-2027 » → « Adhésions 26 / 27 », comme sur le modèle. */
function libelleAnnee(year: string) {
  const [debut, fin] = year.split("-");
  return `Adhésions ${debut.slice(2)} / ${fin.slice(2)}`;
}

/**
 * La commune du siège social, tirée de l'adresse saisie dans les réglages
 * (« 3 rue de l'Église, 85100 Les Sables-d'Olonne » → « LES SABLES-D'OLONNE »).
 * Une adresse sans code postal n'est retenue que si elle ne contient aucun
 * chiffre : c'est alors vraisemblablement le seul nom de la commune.
 */
export function communeDuSiege(headquarters: string | null | undefined): string | null {
  const value = (headquarters ?? "").trim();
  if (!value) return null;
  const match = value.match(/\b\d{5}\s+([^,\n]+)/);
  const commune = match ? match[1] : /\d/.test(value) ? null : value;
  return commune?.trim().toLocaleUpperCase("fr-FR") || null;
}

function texte(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

/**
 * Les cellules d'une famille, colonne A d'abord, et le nombre d'informations
 * obligatoires manquantes. Le n° de voie vient du champ dédié, ou à défaut du
 * début de la voie saisie d'un bloc (fiches d'avant le champ).
 */
export function ligneUdapel(
  member: UdapelMember,
  autreEtablissement: boolean,
): { cells: XlsxCellInput[]; manquants: MemberInfoField[] } {
  const { required } = memberCompleteness(member);
  const voie = texte(member.addressLine1);
  const numeroSaisi = texte(member.streetNumber);
  const decoupe = numeroSaisi ? { number: numeroSaisi, street: voie } : splitStreetNumber(voie);
  const numero = decoupe.number;
  const pays = texte(member.country) ?? "France";

  const valeurs: (string | number | null)[] = [
    isCivility(member.civility) ? member.civility : texte(member.civility),
    texte(member.lastName)?.toLocaleUpperCase("fr-FR") ?? null,
    texte(member.firstName),
    texte(member.addressLine2),
    // Un numéro sans indice s'écrit en nombre, comme sur le modèle ; « 12 bis » reste du texte.
    numero && /^\d+$/.test(numero) ? Number(numero) : numero,
    decoupe.street,
    texte(member.locality),
    texte(member.postalCode)?.replace(/\s+/g, "") ?? null,
    texte(member.city)?.toLocaleUpperCase("fr-FR") ?? null,
    pays,
    texte(member.phone),
    texte(member.email),
  ];
  if (autreEtablissement) valeurs.push(texte(member.otherSchoolName));

  const jaunes = new Set(required.flatMap((field) => COLONNES_OBLIGATOIRES[field] ?? []));
  const cells = valeurs.map((value, i): XlsxCell => {
    const base = jaunes.has(i) ? A_COMPLETER : DONNEE;
    // Code postal et téléphone en texte : « 01000 » ou « 06 12… » gardent leur zéro.
    const style = i === 7 || i === 10 ? { ...base, text: true } : base;
    return { value, style };
  });
  return { cells, manquants: required };
}

function compareFamilles(a: UdapelMember, b: UdapelMember) {
  const options = { sensitivity: "base" } as const;
  return (
    a.lastName.trim().localeCompare(b.lastName.trim(), "fr", options) ||
    a.firstName.trim().localeCompare(b.firstName.trim(), "fr", options)
  );
}

function feuille(
  onglet: Onglet,
  familles: UdapelMember[],
  contexte: { schoolYear: string; apelEtCommune: string },
): { sheet: XlsxSheet; incompletes: number } {
  const { autreEtablissement } = onglet;
  const nbColonnes = onglet.enTetes.length;
  const derniere = lettre(nbColonnes - 1);

  const lignes = [...familles].sort(compareFamilles).map((member) => ligneUdapel(member, autreEtablissement));
  const incompletes = lignes.filter((ligne) => ligne.manquants.length > 0).length;

  const ligne1: XlsxCellInput[] = [];
  ligne1[2] = {
    value: "LISTE DES FAMILLES ADHERENTES  *",
    style: { bold: true, size: 26, color: "FFFFFF", fill: onglet.accent, horizontal: "center", vertical: "center" },
  };
  ligne1[onglet.colonneAnnee] = {
    value: libelleAnnee(contexte.schoolYear),
    style: { bold: true, size: 12, color: TURQUOISE, horizontal: "right", vertical: "center", wrap: true },
  };
  // Le fond de la fusion ne couvre que les cellules qui le portent.
  for (let c = 3; c <= onglet.finTitre.charCodeAt(0) - 65; c++) {
    ligne1[c] = { value: null, style: { fill: onglet.accent } };
  }

  const ligne2: XlsxCellInput[] = [];
  ligne2[2] = {
    value: onglet.mention,
    style: { bold: true, color: onglet.accent, horizontal: "center", vertical: "center" },
  };

  const ligne3: XlsxCellInput[] = [];
  ligne3[onglet.libelle.debut] = {
    value: "APEL et  Commune :",
    style: { horizontal: "right", vertical: "center" },
  };
  const cadre: XlsxStyle = { bold: true, border: "medium", horizontal: "center", vertical: "center" };
  for (let c = onglet.cadre.debut; c <= onglet.cadre.fin; c++) {
    ligne3[c] = { value: c === onglet.cadre.debut ? contexte.apelEtCommune : null, style: cadre };
  }

  // Ligne 4, vide sur le modèle : les codes de civilité attendus, et la
  // légende du jaune quand il y en a.
  const civilites = CIVILITIES.map((code) => `${code} = ${CIVILITY_LABELS[code]}`).join(" · ");
  const ligne4: XlsxCellInput[] = [
    {
      value: `Civilité : ${civilites}.${incompletes ? " En jaune : information obligatoire manquante, à compléter avant l'envoi." : ""}`,
      style: { italic: true, size: 8, color: "555555", vertical: "center" },
    },
  ];

  const enTetes = onglet.enTetes.map((value) => ({ value, style: EN_TETE }));
  const premiere = 6;
  const fin = premiere + lignes.length - 1;

  return {
    incompletes,
    sheet: {
      name: onglet.nom,
      columnWidths: LARGEURS.slice(0, nbColonnes),
      rows: [
        { cells: ligne1, height: 33.75 },
        { cells: ligne2, height: 15 },
        { cells: ligne3, height: 21 },
        { cells: ligne4, height: 15.75 },
        { cells: enTetes, height: 25.5 },
        ...lignes.map((ligne) => ligne.cells),
      ],
      merges: [
        `C1:${onglet.finTitre}1`,
        `C2:${onglet.finTitre}2`,
        `${lettre(onglet.libelle.debut)}3:${lettre(onglet.libelle.fin)}3`,
        `${lettre(onglet.cadre.debut)}3:${lettre(onglet.cadre.fin)}3`,
      ],
      freezeRows: 5,
      autoFilter: lignes.length ? `A5:${derniere}${fin}` : undefined,
      printTitleRows: [5, 5],
      landscape: true,
    },
  };
}

/**
 * Le classeur d'une année, sans lecture en base : les deux onglets du modèle
 * remplis avec les familles données.
 */
export function buildUdapelWorkbook(input: {
  schoolYear: string;
  associationName: string;
  commune: string | null;
  members: UdapelMember[];
}) {
  const apelEtCommune = [input.associationName.trim(), input.commune].filter(Boolean).join(" – ");
  const contexte = { schoolYear: input.schoolYear, apelEtCommune };
  const ici = feuille(
    ONGLETS[0],
    input.members.filter((member) => !member.nationalFeeElsewhere),
    contexte,
  );
  const ailleurs = feuille(
    ONGLETS[1],
    input.members.filter((member) => member.nationalFeeElsewhere),
    contexte,
  );
  const body = buildXlsx([ici.sheet, ailleurs.sheet], {
    title: `Liste des familles adhérentes ${input.schoolYear}`,
    creator: input.associationName.trim() || undefined,
  });
  return {
    body,
    rows: input.members.length,
    viaApel: ici.sheet.rows.length - 5,
    viaAutreApel: ailleurs.sheet.rows.length - 5,
    incompletes: ici.incompletes + ailleurs.incompletes,
  };
}

/**
 * Le fichier à remettre à l'Apel départementale pour une année scolaire
 * (l'année en cours par défaut).
 */
export async function exportUdapel(input: unknown, actor: AuditActor) {
  const parsed = udapelExportSchema.parse(input);
  const year = parsed.schoolYear ?? currentSchoolYear();
  const [settings, members] = await Promise.all([
    getAssociationSettings(),
    db
      .select({
        firstName: associationMembers.firstName,
        lastName: associationMembers.lastName,
        civility: associationMembers.civility,
        streetNumber: associationMembers.streetNumber,
        addressLine1: associationMembers.addressLine1,
        addressLine2: associationMembers.addressLine2,
        locality: associationMembers.locality,
        postalCode: associationMembers.postalCode,
        city: associationMembers.city,
        country: associationMembers.country,
        phone: associationMembers.phone,
        email: associationMembers.email,
        nationalFeeElsewhere: associationMembers.nationalFeeElsewhere,
        otherSchoolName: associationMembers.otherSchoolName,
      })
      .from(associationMembers)
      .where(
        and(
          eq(associationMembers.schoolYear, year),
          eq(associationMembers.status, "active"),
        ),
      ),
  ]);

  const workbook = buildUdapelWorkbook({
    schoolYear: year,
    associationName: settings.associationName,
    commune: communeDuSiege(settings.headquarters),
    members,
  });

  // Des comptes seulement : aucun nom ni adresse au journal.
  await recordAudit(actor, "adherent.export_udapel", "association_member", undefined, {
    schoolYear: year,
    rows: workbook.rows,
    viaApel: workbook.viaApel,
    viaAutreApel: workbook.viaAutreApel,
    incompletes: workbook.incompletes,
  });

  return {
    filename: `Tableau-adhesions-UDAPEL-${year}.xlsx`,
    contentType: XLSX_CONTENT_TYPE,
    ...workbook,
  };
}
