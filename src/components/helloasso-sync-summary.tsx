"use client";

import { ArrowRight, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { useToast } from "@/components/toast";
import { api } from "@/lib/client";
import { formatLongDateTime, formatRelative, formatShortDate } from "@/lib/dates";
import type {
  HelloAssoReviewItem,
  HelloAssoSyncResult,
  HelloAssoSyncSummary,
} from "@/lib/helloasso/types";
import { formatEuros } from "@/lib/money";

/**
 * Morceaux partagés par la carte HelloAsso des réglages et le bandeau de la
 * liste des adhérents : le bouton « Synchroniser », le bilan, et la liste des
 * adhésions à vérifier.
 */

export const REVIEW_REASON_LABELS: Record<
  HelloAssoReviewItem["reason"],
  string
> = {
  possible_duplicate: "Déjà réglée par un autre moyen : doublon possible",
  refunded: "Remboursée ou annulée sur HelloAsso",
  pending: "Paiement pas encore encaissé par HelloAsso",
};

function pluriel(n: number, singulier: string, plurielForme: string) {
  return `${n} ${n > 1 ? plurielForme : singulier}`;
}

/** « 2 créés, 1 complété, 14 déjà importés ». */
export function bilanCourt(summary: HelloAssoSyncSummary): string {
  return [
    pluriel(summary.created, "créé", "créés"),
    pluriel(summary.updated, "complété", "complétés"),
    pluriel(summary.unchanged, "déjà importé", "déjà importés"),
  ].join(", ");
}

const rienAEcouter = () => () => {};

/**
 * « il y a 3 heures » une fois la page hydratée ; la date en toutes lettres au
 * rendu serveur. Une durée relative calculée des deux côtés différerait d'une
 * minute à l'autre et ferait échouer l'hydratation.
 */
export function TempsEcoule({ iso }: { iso: string }) {
  const hydrate = useSyncExternalStore(
    rienAEcouter,
    () => true,
    () => false,
  );
  return (
    <time dateTime={iso} title={formatLongDateTime(iso)}>
      {hydrate ? formatRelative(iso) : `le ${formatLongDateTime(iso)}`}
    </time>
  );
}

/**
 * Lance `POST /api/helloasso/sync`, annonce le bilan et relit la page : les
 * adhérents créés apparaissent dans la liste, et l'échec éventuel, enregistré
 * par le serveur, s'affiche avec l'état.
 */
export function useHelloAssoSync() {
  const router = useRouter();
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);

  async function sync() {
    setSyncing(true);
    try {
      const { summary } = await api<HelloAssoSyncResult>(
        "/api/helloasso/sync",
        { body: {} },
      );
      toast(
        summary.review.length > 0
          ? `Synchronisation terminée : ${bilanCourt(summary)}. ${pluriel(summary.review.length, "adhésion", "adhésions")} à vérifier.`
          : `Synchronisation terminée : ${bilanCourt(summary)}.`,
      );
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setSyncing(false);
      router.refresh();
    }
  }

  return { syncing, sync };
}

/** Les adhésions laissées de côté par la synchronisation, à regarder. */
export function HelloAssoReviewList({
  items,
}: {
  items: HelloAssoReviewItem[];
}) {
  return (
    <ul className="divide-y-2 divide-slate-100 rounded-xl border-2 border-sand-200 bg-white">
      {items.map((item) => (
        <li
          key={`${item.itemId}-${item.reason}`}
          className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="min-w-0">
            <p className="break-words font-semibold text-slate-900">
              {item.firstName} {item.lastName}
              <span className="font-normal text-slate-500">
                {" "}
                · {formatEuros(item.amountCents)} ·{" "}
                {formatShortDate(item.orderDate)}
              </span>
            </p>
            {item.email && (
              <p className="break-all text-xs text-slate-500">{item.email}</p>
            )}
            <p className="mt-1 flex items-start gap-1.5 text-sm font-medium text-sand-800">
              <CircleAlert
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              {REVIEW_REASON_LABELS[item.reason]}
            </p>
          </div>
          {item.memberId && (
            <Link
              href={`/dashboard/adherents/${item.memberId}`}
              className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-900 hover:underline"
            >
              Voir la fiche
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">
                {" "}
                de {item.firstName} {item.lastName}
              </span>
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Le bilan détaillé d'une synchronisation : compteurs puis éléments à vérifier. */
export function HelloAssoSummaryView({
  summary,
}: {
  summary: HelloAssoSyncSummary;
}) {
  const compteurs = [
    { label: "Créés", valeur: summary.created },
    { label: "Complétés", valeur: summary.updated },
    { label: "Déjà importés", valeur: summary.unchanged },
  ];
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-2">
        {compteurs.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border-2 border-slate-200 bg-white px-3 py-2"
          >
            <dt className="text-xs font-semibold text-slate-500">{c.label}</dt>
            <dd className="text-xl font-black tracking-[-0.02em] text-brand-950">
              {c.valeur}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-slate-500">
        Année scolaire {summary.schoolYear} :{" "}
        {pluriel(summary.fetched, "adhésion lue", "adhésions lues")} sur
        HelloAsso
        {summary.trigger === "scheduled" ? " (synchronisation automatique)" : ""}
        .
      </p>
      {summary.review.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold text-brand-950">
            {pluriel(summary.review.length, "adhésion", "adhésions")} à vérifier
          </p>
          <HelloAssoReviewList items={summary.review} />
        </div>
      )}
    </div>
  );
}
