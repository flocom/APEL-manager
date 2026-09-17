/**
 * Formes du procès-verbal d'assemblée générale.
 *
 * Fichier de types purs, sans aucun import : il est référencé par le schéma
 * Drizzle, qui est lui-même importé par la validation. Le moindre import ici
 * refermerait le cycle.
 *
 * LE PRINCIPE QUI COMMANDE TOUT LE RESTE. La loi du 1er juillet 1901 n'impose
 * ni de tenir une assemblée générale, ni d'en rédiger un procès-verbal. Presque
 * tout vient des statuts de l'association — et une seule obligation légale naît
 * de la séance : déclarer sous trois mois les changements de dirigeants ou de
 * statuts. Chaque mention affichée porte donc son niveau réel, et quand la règle
 * n'est pas connue, l'application le dit plutôt que d'inventer. Un outil qui
 * ment sur son propre fondement se fait remplacer par un fichier Word dès la
 * deuxième année.
 */

export type NiveauExigence =
  /** Découle d'un texte : art. 5 de la loi de 1901, RGPD. */
  | "legal"
  /** Découle des statuts de l'association — donc vérifiable, pas supposé. */
  | "statutaire"
  /** Réclamé en pratique par une banque, une mairie, la fédération. */
  | "tiers"
  /** Emprunt au droit des sociétés : utile, jamais obligatoire ici. */
  | "usage"
  | "facultatif";

/**
 * Ce que les statuts de l'association prévoient, lu une fois et réutilisé par
 * toutes les assemblées. Tout est facultatif : un champ vide signifie « règle
 * inconnue », et l'application s'abstient alors de tout verdict.
 */
export interface ReglesStatutaires {
  articleAG?: string;
  delaiConvocationJours?: number;
  auteurConvocation?: string;
  quorumAGO?: RegleQuorum;
  quorumAGE?: RegleQuorum;
  majoriteAGO?: RegleMajorite;
  majoriteAGE?: RegleMajorite;
  baseMajorite?: BaseMajorite;
  representationAutorisee?: boolean;
  plafondPouvoirs?: number;
  /** Beaucoup d'APEL comptent une voix par famille adhérente, pas par personne. */
  regleVoix?: "famille" | "personne";
  dureeMandatAnnees?: number;
  /** Date de clôture de l'exercice, telle qu'écrite dans les statuts. */
  clotureExercice?: string;
}

export type RegleMajorite =
  | "simple"
  | "absolue"
  | "deux_tiers"
  | "unanimite"
  | "non_precise";

export type BaseMajorite =
  | "suffrages_exprimes"
  | "presents_representes"
  | "non_precise";

export interface RegleQuorum {
  type: "fraction" | "nombre" | "aucun" | "inconnu";
  /** Dénominateur d'une fraction (4 pour « le quart »), ou nombre exigé. */
  valeur?: number | null;
  /** La phrase des statuts, recopiée telle quelle. */
  texte?: string;
}

/**
 * Une personne citée au procès-verbal. `memberId` la rattache à un adhérent
 * quand elle en est un — le chef d'établissement ou un représentant de la
 * fédération n'en sont pas, d'où la saisie libre toujours possible.
 */
export interface PvPersonne {
  memberId: string | null;
  nom: string;
  qualite: string;
}

export type ModeScrutin =
  | "main_levee"
  | "bulletin_secret"
  | "electronique"
  | "non_precise";

export interface PvVote {
  modeScrutin: ModeScrutin;
  baseMajorite: BaseMajorite;
  regleMajorite: RegleMajorite;
  votants: number | null;
  pour: number | null;
  contre: number | null;
  abstentions: number | null;
  blancsNuls: number | null;
  /** Conflit d'intérêts : qui s'est retiré du vote. */
  nePrennentPasPart: number | null;
  /** Certains points sont exposés sans être mis aux voix. */
  nonSoumiseAuVote: boolean;
}

export type NatureResolution =
  | "approbation_pv_precedent"
  | "rapport_moral"
  | "approbation_comptes"
  | "affectation_resultat"
  | "quitus"
  | "budget"
  | "cotisation"
  | "election"
  | "modification_statuts"
  | "transfert_siege"
  | "dissolution"
  | "devolution"
  | "pouvoirs_bancaires"
  | "libre";

export interface PvCandidat {
  id: string;
  memberId: string | null;
  nom: string;
  fonction: string;
  voix: number | null;
  /** L'acceptation des fonctions est ce que la préfecture vérifie. */
  accepte: boolean;
}

export interface PvResolution {
  id: string;
  nature: NatureResolution;
  intitule: string;
  texte: string;
  vote: PvVote;
  /** Nommer quelqu'un dans un débat : seulement à sa demande. */
  mentionsNominatives: string[];
  conflitsInterets: string[];
  candidats: PvCandidat[];
  textesStatuts: { article: string; ancienne: string; nouvelle: string }[];
}

export interface AgMinutesPayload {
  schema: 1;
  /** « L'AG a déjà eu lieu » est le cas courant, donc le défaut. */
  mode: "preparation" | "transcription";
  natureAssemblee: "AGO" | "AGE" | "mixte" | "constitutive";
  entete: {
    statutsVersionDate: string | null;
    affiliationApel: string;
  };
  seance: {
    date: string | null;
    heureOuverture: string;
    heureCloture: string;
    lieu: string;
    distanciel: { actif: boolean; outil: string; modalites: string };
    secondeConvocation: { actif: boolean; premiereSeanceDate: string | null };
  };
  convocation: {
    auteur: string;
    dateEnvoi: string | null;
    mode: string;
    nombreDestinataires: number | null;
    incidents: string;
    documentsJoints: string[];
  };
  ordreDuJour: { id: string; intitule: string }[];
  bureauSeance: {
    president: PvPersonne;
    secretaire: PvPersonne;
    scrutateurs: PvPersonne[];
    /** Sans voix délibérative : ni dans le quorum, ni dans les votes. */
    invites: PvPersonne[];
  };
  presences: {
    regleVoix: "famille" | "personne" | "non_precise";
    dateReference: string | null;
    effectifVotants: number | null;
    presents: number | null;
    representes: number | null;
    pouvoirsEcartes: number | null;
    quorum: RegleQuorum;
    feuilleEmargementAnnexee: boolean;
    incidentsSeance: string;
  };
  reglesVote: {
    modeScrutin: ModeScrutin;
    baseMajorite: BaseMajorite;
    regleMajorite: RegleMajorite;
  };
  rapports: {
    moral: string;
    exercice: { debut: string | null; fin: string | null };
    financier: {
      texte: string;
      produitsCents: number | null;
      chargesCents: number | null;
      resultatCents: number | null;
      tresorerieCents: number | null;
      /**
       * Les chiffres sont gelés au moment où ils sont repris : une écriture
       * saisie six mois après l'assemblée ne doit pas modifier rétroactivement
       * un procès-verbal signé.
       */
      sourceComptable: { extraitLe: string; brouillons: number } | null;
    };
    verificateur: string;
  };
  resolutions: PvResolution[];
  instances: {
    bureauEluPar: "AG" | "CA" | "non_precise";
    compositionApres: { nom: string; fonction: string; memberId: string | null }[];
    dureeEtEffetMandats: string;
    siegesVacants: string;
  };
  vieApel: {
    engagements: string;
    manifestations: string;
    representants: string;
  };
  age: {
    transfertSiege: string;
    dissolution: string;
    devolution: string;
  };
  formalites: {
    pouvoirsBancaires: string;
    mandataireFormalites: string;
    /** Art. 5 : trois mois pour déclarer dirigeants et statuts modifiés. */
    echeanceDeclaration: string | null;
    transmissionFederation: string;
  };
  cloture: {
    questionsDiverses: string;
    dateRedaction: string | null;
    signataires: PvPersonne[];
    mentionCertifieConforme: boolean;
    annexes: string[];
    prochaineAG: string | null;
  };
  diffusion: {
    controleDonneesSensibles: boolean;
    perimetre: string;
    archivage: string;
  };
  /** Ce qui aide à rédiger et ne s'imprime jamais. */
  redaction: {
    notesBrutes: string;
    aRetrouver: string[];
    derniereSection: string;
  };
}

/** Les neuf sections, dans l'ordre où un secrétaire de séance les remplit. */
export const AG_SECTIONS = [
  { cle: "seance", titre: "L’association et la séance" },
  { cle: "convocation", titre: "La convocation" },
  { cle: "bureau", titre: "Qui présidait, qui était invité" },
  { cle: "presences", titre: "Qui était là, et combien de voix" },
  { cle: "rapports", titre: "Les rapports et les comptes" },
  { cle: "resolutions", titre: "Les résolutions et les votes" },
  { cle: "instances", titre: "Les élections et les instances" },
  { cle: "cloture", titre: "La clôture" },
  { cle: "suites", titre: "Suites, diffusion et archivage" },
] as const;

export type AgSectionCle = (typeof AG_SECTIONS)[number]["cle"];

export function personneVide(): PvPersonne {
  return { memberId: null, nom: "", qualite: "" };
}

export function voteVide(): PvVote {
  return {
    modeScrutin: "non_precise",
    baseMajorite: "non_precise",
    regleMajorite: "non_precise",
    votants: null,
    pour: null,
    contre: null,
    abstentions: null,
    blancsNuls: null,
    nePrennentPasPart: null,
    nonSoumiseAuVote: false,
  };
}

/** Brouillon de départ : tout est vide, rien n'est affirmé. */
export function payloadVide(
  options: {
    mode?: AgMinutesPayload["mode"];
    nature?: AgMinutesPayload["natureAssemblee"];
    date?: string | null;
  } = {},
): AgMinutesPayload {
  return {
    schema: 1,
    mode: options.mode ?? "transcription",
    natureAssemblee: options.nature ?? "AGO",
    entete: { statutsVersionDate: null, affiliationApel: "" },
    seance: {
      date: options.date ?? null,
      heureOuverture: "",
      heureCloture: "",
      lieu: "",
      distanciel: { actif: false, outil: "", modalites: "" },
      secondeConvocation: { actif: false, premiereSeanceDate: null },
    },
    convocation: {
      auteur: "",
      dateEnvoi: null,
      mode: "",
      nombreDestinataires: null,
      incidents: "",
      documentsJoints: [],
    },
    ordreDuJour: [],
    bureauSeance: {
      president: personneVide(),
      secretaire: personneVide(),
      scrutateurs: [],
      invites: [],
    },
    presences: {
      regleVoix: "non_precise",
      dateReference: null,
      effectifVotants: null,
      presents: null,
      representes: null,
      pouvoirsEcartes: null,
      quorum: { type: "inconnu", valeur: null, texte: "" },
      feuilleEmargementAnnexee: false,
      incidentsSeance: "",
    },
    reglesVote: {
      modeScrutin: "main_levee",
      baseMajorite: "non_precise",
      regleMajorite: "non_precise",
    },
    rapports: {
      moral: "",
      exercice: { debut: null, fin: null },
      financier: {
        texte: "",
        produitsCents: null,
        chargesCents: null,
        resultatCents: null,
        tresorerieCents: null,
        sourceComptable: null,
      },
      verificateur: "",
    },
    resolutions: [],
    instances: {
      bureauEluPar: "non_precise",
      compositionApres: [],
      dureeEtEffetMandats: "",
      siegesVacants: "",
    },
    vieApel: { engagements: "", manifestations: "", representants: "" },
    age: { transfertSiege: "", dissolution: "", devolution: "" },
    formalites: {
      pouvoirsBancaires: "",
      mandataireFormalites: "",
      echeanceDeclaration: null,
      transmissionFederation: "",
    },
    cloture: {
      questionsDiverses: "",
      dateRedaction: null,
      signataires: [],
      mentionCertifieConforme: false,
      annexes: [],
      prochaineAG: null,
    },
    diffusion: {
      controleDonneesSensibles: false,
      perimetre: "",
      archivage: "",
    },
    redaction: { notesBrutes: "", aRetrouver: [], derniereSection: "seance" },
  };
}
