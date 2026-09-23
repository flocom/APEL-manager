import type {
  AccountRequestDropReason,
  EventStatus,
  TaskStatus,
} from "@/lib/db/schema";

type BadgeColor = "slate" | "green" | "amber" | "red" | "blue";

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Brouillon",
  published: "Publié",
  archived: "Archivé",
};

export const EVENT_STATUS_COLORS: Record<EventStatus, BadgeColor> = {
  draft: "amber",
  published: "green",
  archived: "slate",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  done: "Terminé",
};

/**
 * Les modes de règlement d'une cotisation, dans l'ordre où on les propose.
 *
 * « HelloAsso » est à part, et c'est tout l'intérêt de ce champ : l'argent
 * encaissé par la plateforme n'est pas encore sur le compte de l'association.
 */
export const PAYMENT_METHODS = [
  "especes",
  "cheque",
  "virement",
  "helloasso",
  "autre",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  especes: "Espèces",
  cheque: "Chèque",
  virement: "Virement",
  helloasso: "HelloAsso",
  autre: "Autre",
};

/**
 * Les modes dont l'argent est déjà sur un compte de l'association, donc
 * immédiatement portables en comptabilité. Les autres attendent leur versement.
 */
export const PAYMENT_METHODS_DIRECTS: readonly PaymentMethod[] = [
  "especes",
  "cheque",
  "virement",
  "autre",
];

/**
 * Natures de document, dans l'ordre où elles sont proposées. Les deux
 * premières ont leur propre onglet ; les suivantes forment le classeur des
 * documents officiels de l'association — ceux qu'une mairie, une banque ou
 * l'école peuvent réclamer.
 */
export const ASSOCIATION_DOCUMENT_TYPES = [
  "ag_minutes",
  "attestation",
  "statutes",
  "internal_rules",
  "insurance",
  "agreement",
  "other",
] as const;

export type AssociationDocumentType =
  (typeof ASSOCIATION_DOCUMENT_TYPES)[number];

export const ASSOCIATION_DOCUMENT_TYPE_LABELS: Record<
  AssociationDocumentType,
  string
> = {
  ag_minutes: "PV d’assemblée générale",
  attestation: "Attestation",
  statutes: "Statuts",
  internal_rules: "Règlement intérieur",
  insurance: "Assurance",
  agreement: "Convention ou contrat",
  other: "Autre document",
};

/** Natures regroupées sous l'onglet « Documents de l'association ». */
export const OFFICIAL_DOCUMENT_TYPES = [
  "statutes",
  "internal_rules",
  "insurance",
  "agreement",
  "other",
] as const satisfies readonly AssociationDocumentType[];

/** Demandes de compte écartées par un plafond, comptées motif par motif. */
export type DroppedAccountRequests = Record<AccountRequestDropReason, number>;

/**
 * Ce que chaque motif de refus dit au bureau, et ce qu'il lui demande.
 *
 * Un seul texte pour les quatre laissait croire que tout venait d'un robot
 * sans conséquence. Or deux refus se voient (les plafonds de l'heure
 * répondent « réessayez plus tard »), deux restent muets (la personne lit
 * qu'un lien lui est parti), et un seul appelle un geste : les comptes en
 * attente, qui ferment le formulaire tant que personne ne les traite.
 *
 * L'ordre des clés est celui de l'affichage : ce qui attend le bureau d'abord,
 * ce qui ne demande rien ensuite. Écrit ici, et non dans chaque écran, pour
 * que le bandeau de l'écran Utilisateurs et le récapitulatif quotidien disent
 * la même chose.
 */
const REFUS_DE_DEMANDES_DE_COMPTE: Record<
  AccountRequestDropReason,
  { refusVisible: boolean; motif: string; explication: string }
> = {
  comptes_en_attente: {
    refusVisible: false,
    motif: "trop de comptes attendent une décision",
    explication:
      "Les nouvelles demandes sont refusées tant que les comptes en attente n’ont pas été validés ou refusés. Qui a fait une demande entre-temps a lu qu’un lien lui était parti, sans rien recevoir : une fois le tri fait, il lui faudra la refaire.",
  },
  plafond_general: {
    refusVisible: true,
    motif: "trop de demandes en une heure, toutes connexions confondues",
    explication:
      "Le formulaire a refusé tout le monde, parents compris, jusqu’à l’heure suivante, en invitant à réessayer plus tard. Un tel afflux vient d’ordinaire d’un robot réparti sur de nombreuses connexions : s’il se répète, activez la protection anti-robot dans Configuration.",
  },
  plafond_connexion: {
    refusVisible: true,
    motif: "trop de demandes depuis une même connexion",
    explication:
      "C’est d’ordinaire un robot, et il n’y a rien à faire : seule cette connexion a été arrêtée, avec l’invitation à réessayer une heure plus tard. Les autres visiteurs n’ont rien vu.",
  },
  plafond_adresse: {
    refusVisible: false,
    motif: "trop de demandes pour une même adresse",
    explication:
      "Cette adresse avait déjà reçu plusieurs messages dans la journée : les demandes suivantes n’en font plus partir. C’est d’ordinaire quelqu’un qui cherche à encombrer une boîte, et il n’y a rien à faire. Si un parent dit n’avoir rien reçu, qu’il regarde ses courriers indésirables ou réessaie le lendemain.",
  },
};

/** Les motifs de refus, dans l'ordre où les écrans les présentent. */
export const ACCOUNT_REQUEST_DROP_REASONS = Object.keys(
  REFUS_DE_DEMANDES_DE_COMPTE,
) as AccountRequestDropReason[];

/**
 * Les lignes à montrer au bureau : une par motif rencontré, dans l'ordre de
 * `ACCOUNT_REQUEST_DROP_REASONS`, avec le nombre déjà accordé.
 */
export function droppedAccountRequestNotices(
  parMotif: DroppedAccountRequests,
): {
  reason: AccountRequestDropReason;
  nombre: string;
  motif: string;
  explication: string;
}[] {
  return ACCOUNT_REQUEST_DROP_REASONS.filter(
    (reason) => parMotif[reason] > 0,
  ).map((reason) => {
    const n = parMotif[reason];
    const s = n > 1 ? "s" : "";
    const { refusVisible, motif, explication } =
      REFUS_DE_DEMANDES_DE_COMPTE[reason];
    return {
      reason,
      // « refusée » quand la personne l'a lu à l'écran, « sans suite » quand
      // on lui a répondu comme à tout le monde.
      nombre: refusVisible
        ? `${n} demande${s} de compte refusée${s}`
        : `${n} demande${s} de compte sans suite`,
      motif,
      explication,
    };
  });
}

/** Le total, tous motifs confondus : pour un sujet d'e-mail ou un compteur. */
export function totalDroppedAccountRequests(
  parMotif: DroppedAccountRequests,
): number {
  return ACCOUNT_REQUEST_DROP_REASONS.reduce(
    (total, reason) => total + parMotif[reason],
    0,
  );
}
