/**
 * Contrat entre le serveur et les écrans pour la synchronisation HelloAsso.
 *
 * Le déroulé :
 * 1. Le bureau colle le lien de son formulaire d'adhésion HelloAsso dans
 *    « Comment régler » (réglages de l'association). Tant qu'aucune clé d'API
 *    n'est enregistrée, l'écran des réglages et la liste des adhérents
 *    rappellent qu'on peut synchroniser en ajoutant les clés.
 * 2. Un administrateur enregistre l'identifiant et le secret client
 *    (`PATCH /api/settings/helloasso`) ; le serveur les essaie aussitôt
 *    auprès de HelloAsso et refuse des clés rejetées.
 * 3. `POST /api/helloasso/sync` (bouton « Synchroniser ») ou la tâche
 *    planifiée (`GET /api/cron/helloasso`) relit les adhésions de l'année
 *    scolaire en cours et met à jour la liste des adhérents.
 *
 * Ce fichier ne contient que des types : il est importé des deux côtés.
 */
import type { HelloAssoFormRef } from "@/lib/helloasso/form-link";

/** État affiché par l'écran des réglages et la liste des adhérents. */
export type HelloAssoStatus = {
  /** Identifiant et secret client enregistrés. */
  configured: boolean;
  clientId: string | null;
  clientSecretLastFour: string | null;
  /** Instant ISO où HelloAsso a accepté les clés pour la dernière fois. */
  verifiedAt: string | null;
  /** Le formulaire synchronisé, lu dans « Comment régler » ; null sinon. */
  form: HelloAssoFormRef | null;
  /** « Comment régler » cite un lien HelloAsso (synchronisable ou non). */
  linkDetected: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: "success" | "failed" | null;
  lastSyncError: string | null;
  lastSyncSummary: HelloAssoSyncSummary | null;
};

/** `PATCH /api/settings/helloasso`. */
export type HelloAssoSettingsInput = {
  clientId?: string | null;
  /** Vide ou absent : le secret enregistré est conservé. */
  clientSecret?: string | null;
  /** Efface l'identifiant et le secret (arrête la synchronisation). */
  clear?: boolean;
};

/** Une adhésion qu'un humain doit regarder. */
export type HelloAssoReviewItem = {
  /** `item.id` HelloAsso. */
  itemId: string;
  orderId: string;
  /** Instant ISO de la commande. */
  orderDate: string;
  firstName: string;
  lastName: string;
  email: string | null;
  amountCents: number;
  /**
   * - `possible_duplicate` : un adhérent de la même année, déjà marqué payé
   *   (par un autre moyen, ou par une autre adhésion HelloAsso), porte ce nom
   *   ou cette adresse — rien n'est importé ;
   * - `refunded` : l'adhésion importée a été remboursée ou annulée sur
   *   HelloAsso — la fiche n'est pas modifiée, le bureau décide ;
   * - `pending` : le paiement n'est pas encore encaissé (prélèvement SEPA en
   *   attente…) — il sera importé à une prochaine synchronisation.
   */
  reason: "possible_duplicate" | "refunded" | "pending";
  /** Adhérent concerné, s'il existe. */
  memberId: string | null;
};

export type HelloAssoSyncSummary = {
  /** Instant ISO du début de la synchronisation. */
  startedAt: string;
  /** Année scolaire synchronisée (« 2026-2027 »). */
  schoolYear: string;
  form: HelloAssoFormRef;
  /** Adhésions lues sur HelloAsso pour l'année (dons exclus). */
  fetched: number;
  /** Adhérents créés. */
  created: number;
  /** Adhérents existants (non payés) complétés avec le paiement HelloAsso. */
  updated: number;
  /** Déjà importées lors d'une synchronisation précédente. */
  unchanged: number;
  /** Adhésions laissées de côté, à regarder (voir `reason`). */
  review: HelloAssoReviewItem[];
  trigger: "manual" | "scheduled";
};

/** Réponse de `POST /api/helloasso/sync`. */
export type HelloAssoSyncResult = {
  summary: HelloAssoSyncSummary;
  status: HelloAssoStatus;
};
