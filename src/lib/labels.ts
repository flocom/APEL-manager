import type { EventStatus, TaskStatus } from "@/lib/db/schema";

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
