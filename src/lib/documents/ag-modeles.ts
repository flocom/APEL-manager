import type { NatureResolution, RegleMajorite } from "./ag-types";

/**
 * Textes types de résolutions.
 *
 * Ils font gagner l'essentiel du temps : devant une page blanche, un secrétaire
 * de séance recopie le procès-verbal de l'an dernier, ou renonce. Les crochets
 * marquent ce qui reste à compléter — ils sont volontairement voyants, pour
 * qu'un oubli saute aux yeux à la relecture plutôt qu'à la préfecture.
 *
 * Ce sont des textes types, pas des textes justes : l'écran le dit au-dessus de
 * la liste, et rien ici ne remplace une lecture des statuts.
 */

export interface ModeleResolution {
  nature: NatureResolution;
  libelle: string;
  intitule: string;
  texte: string;
  /** Majorité usuelle, proposée et jamais imposée. */
  majorite?: RegleMajorite;
  /** Réservé aux assemblées extraordinaires. */
  extraordinaire?: boolean;
}

export const MODELES_RESOLUTIONS: ModeleResolution[] = [
  {
    nature: "approbation_pv_precedent",
    libelle: "PV précédent",
    intitule: "Approbation du procès-verbal de l’assemblée précédente",
    texte:
      "L’assemblée générale, après lecture du procès-verbal de l’assemblée générale du [date de la séance précédente], l’approuve sans réserve.",
    majorite: "simple",
  },
  {
    nature: "rapport_moral",
    libelle: "Rapport moral",
    intitule: "Approbation du rapport moral et d’activité",
    texte:
      "L’assemblée générale, après avoir entendu la lecture du rapport moral et d’activité présenté par [nom du président] au titre de l’exercice clos le [date de clôture], l’approuve.",
    majorite: "simple",
  },
  {
    nature: "approbation_comptes",
    libelle: "Comptes de l’exercice",
    intitule: "Approbation des comptes de l’exercice clos",
    texte:
      "L’assemblée générale, après avoir entendu la lecture du rapport financier présenté par [nom du trésorier], approuve les comptes de l’exercice clos le [date de clôture], lesquels font apparaître un total de produits de [produits] €, un total de charges de [charges] € et un résultat de [résultat] €.",
    majorite: "simple",
  },
  {
    nature: "affectation_resultat",
    libelle: "Affectation du résultat",
    intitule: "Affectation du résultat de l’exercice",
    texte:
      "L’assemblée générale décide d’affecter le résultat de l’exercice, soit [résultat] €, au report à nouveau de l’association.",
    majorite: "simple",
  },
  {
    nature: "quitus",
    libelle: "Quitus",
    intitule: "Quitus aux membres du bureau",
    texte:
      "L’assemblée générale donne quitus entier et sans réserve aux membres du bureau pour leur gestion au titre de l’exercice clos le [date de clôture].",
    majorite: "simple",
  },
  {
    nature: "budget",
    libelle: "Budget prévisionnel",
    intitule: "Approbation du budget prévisionnel",
    texte:
      "L’assemblée générale approuve le budget prévisionnel de l’exercice [exercice], équilibré en produits et en charges à la somme de [montant] €.",
    majorite: "simple",
  },
  {
    nature: "cotisation",
    libelle: "Cotisation",
    intitule: "Montant de la cotisation",
    texte:
      "L’assemblée générale fixe le montant de la cotisation annuelle à [montant] € par famille pour l’année scolaire [année scolaire], part reversée à la fédération APEL comprise.",
    majorite: "simple",
  },
  {
    nature: "election",
    libelle: "Élection",
    intitule: "Élection des membres du conseil d’administration",
    texte:
      "L’assemblée générale procède à l’élection des membres du conseil d’administration. Après dépouillement, sont élus pour une durée de [durée] an(s) les candidats dont les noms et les voix figurent ci-dessous. Chacun des élus présents a accepté ses fonctions.",
    majorite: "simple",
  },
  {
    nature: "pouvoirs_bancaires",
    libelle: "Pouvoirs bancaires",
    intitule: "Pouvoirs bancaires",
    texte:
      "L’assemblée générale donne pouvoir à [nom et qualité] pour faire fonctionner, sous sa seule signature, les comptes ouverts au nom de l’association auprès de [établissement bancaire], et met fin aux pouvoirs antérieurement consentis à [nom du prédécesseur].",
    majorite: "simple",
  },
  {
    nature: "modification_statuts",
    libelle: "Modification des statuts",
    intitule: "Modification des statuts",
    texte:
      "L’assemblée générale extraordinaire décide de modifier l’article [numéro] des statuts, dont la rédaction est désormais la suivante : « [nouvelle rédaction] ». Les statuts ainsi modifiés sont annexés au présent procès-verbal.",
    majorite: "deux_tiers",
    extraordinaire: true,
  },
  {
    nature: "transfert_siege",
    libelle: "Transfert du siège",
    intitule: "Transfert du siège social",
    texte:
      "L’assemblée générale extraordinaire décide de transférer le siège social de l’association à l’adresse suivante : [nouvelle adresse], à compter du [date d’effet].",
    majorite: "deux_tiers",
    extraordinaire: true,
  },
  {
    nature: "dissolution",
    libelle: "Dissolution",
    intitule: "Dissolution de l’association",
    texte:
      "L’assemblée générale extraordinaire prononce la dissolution de l’association à compter du [date d’effet] et désigne [nom du liquidateur] en qualité de liquidateur, avec les pouvoirs les plus étendus pour réaliser l’actif et acquitter le passif.",
    majorite: "deux_tiers",
    extraordinaire: true,
  },
  {
    nature: "devolution",
    libelle: "Dévolution de l’actif",
    intitule: "Dévolution de l’actif net",
    texte:
      "L’assemblée générale extraordinaire décide que l’actif net subsistant après liquidation sera dévolu à [nom de l’association bénéficiaire], association poursuivant un but analogue. En aucun cas les membres de l’association ne peuvent se voir attribuer une part quelconque des biens.",
    majorite: "deux_tiers",
    extraordinaire: true,
  },
  {
    nature: "libre",
    libelle: "Résolution libre",
    intitule: "",
    texte: "L’assemblée générale ",
  },
];

/** Ordre du jour type d'une assemblée générale ordinaire d'APEL. */
export const ORDRE_DU_JOUR_TYPE = [
  "Approbation du procès-verbal de l’assemblée générale précédente",
  "Rapport moral et rapport d’activité de l’année écoulée",
  "Rapport financier et présentation des comptes de l’exercice clos",
  "Approbation des comptes et quitus au bureau",
  "Budget prévisionnel et montant de la cotisation",
  "Renouvellement des membres du conseil d’administration",
  "Projets et manifestations de l’année à venir",
  "Questions diverses",
];
