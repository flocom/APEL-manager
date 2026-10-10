"use client";

import { ArrowRight, CircleAlert, HandCoins, RefreshCw } from "lucide-react";
import Link from "next/link";

import {
  bilanCourt,
  HelloAssoReviewList,
  TempsEcoule,
  useHelloAssoSync,
} from "@/components/helloasso-sync-summary";
import { Button } from "@/components/ui";
import type { HelloAssoStatus } from "@/lib/helloasso/types";

const REGLAGES = "/dashboard/settings#helloasso";

/**
 * Bandeau HelloAsso de la liste des adhérents. Il n'apparaît que si
 * « Comment régler » cite un formulaire d'adhésion HelloAsso :
 * - sans clés d'API, il rappelle qu'on peut synchroniser les paiements ;
 * - avec les clés, il dit quand la liste a été mise à jour, propose de le
 *   refaire, et signale ce que la synchronisation a laissé de côté.
 */
export function HelloAssoSyncBanner({ status }: { status: HelloAssoStatus }) {
  const { syncing, sync } = useHelloAssoSync();
  if (!status.form) return null;

  if (!status.configured) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border-2 border-sand-200 bg-sand-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <HandCoins
            className="mt-0.5 h-5 w-5 shrink-0 text-sand-700"
            aria-hidden="true"
          />
          <div>
            <p className="font-bold text-brand-950">
              Les cotisations se règlent sur HelloAsso
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Ajoutez les clés d’API HelloAsso dans la configuration : les
              adhésions payées en ligne arriveront seules dans cette liste.
            </p>
          </div>
        </div>
        <Link
          href={REGLAGES}
          className="inline-flex shrink-0 items-center gap-1.5 self-start text-sm font-semibold text-brand-700 hover:text-brand-900 hover:underline sm:self-center"
        >
          Ajouter les clés
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  const summary = status.lastSyncSummary;
  const echec = status.lastSyncStatus === "failed";
  const aVerifier = summary?.review ?? [];

  return (
    <div
      className={`rounded-2xl border-2 p-4 ${
        echec ? "border-coral-200 bg-coral-50" : "border-sea-200 bg-sea-50"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {echec ? (
            <CircleAlert
              className="mt-0.5 h-5 w-5 shrink-0 text-coral-700"
              aria-hidden="true"
            />
          ) : (
            <HandCoins
              className="mt-0.5 h-5 w-5 shrink-0 text-sea-700"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0">
            <p className="font-bold text-brand-950">
              {!status.lastSyncAt ? (
                "Pas encore synchronisé avec HelloAsso"
              ) : echec ? (
                <>
                  Échec de la synchronisation HelloAsso ·{" "}
                  <TempsEcoule iso={status.lastSyncAt} />
                </>
              ) : (
                <>
                  Synchronisé avec HelloAsso ·{" "}
                  <TempsEcoule iso={status.lastSyncAt} />
                </>
              )}
            </p>
            {echec && status.lastSyncError ? (
              <p className="mt-1 break-words text-sm leading-6 text-slate-700">
                {status.lastSyncError}{" "}
                <Link
                  href={REGLAGES}
                  className="font-semibold text-brand-700 underline hover:text-brand-900"
                >
                  Voir la configuration
                </Link>
              </p>
            ) : summary ? (
              <p className="mt-1 text-sm text-slate-600">
                Dernier passage : {bilanCourt(summary)}.
              </p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={RefreshCw}
          loading={syncing}
          onClick={sync}
          className="shrink-0 self-start sm:self-center"
        >
          Synchroniser
        </Button>
      </div>

      {aVerifier.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-bold text-sand-800">
            {aVerifier.length > 1
              ? `${aVerifier.length} adhésions à vérifier`
              : "1 adhésion à vérifier"}
          </summary>
          <div className="mt-2">
            <HelloAssoReviewList items={aVerifier} />
          </div>
        </details>
      )}
    </div>
  );
}
