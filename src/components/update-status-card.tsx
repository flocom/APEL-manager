"use client";

import {
  CircleAlert,
  DownloadCloud,
  RefreshCw,
  RotateCw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { Badge, Button, Card } from "@/components/ui";
import type { UpdateStatus } from "@/lib/services/updates";

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(date);
}

function formatInterval(seconds: number) {
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return hours === 1 ? "toutes les heures" : `toutes les ${hours} heures`;
  }
  if (seconds % 60 === 0) {
    return `toutes les ${seconds / 60} minutes`;
  }
  return `toutes les ${seconds} secondes`;
}

function StateBadge({ state }: { state: UpdateStatus["state"] }) {
  if (state === "up-to-date") {
    return (
      <Badge color="green" icon={ShieldCheck}>
        À jour
      </Badge>
    );
  }
  if (state === "outdated") {
    return (
      <Badge color="amber" icon={DownloadCloud}>
        Mise à jour disponible
      </Badge>
    );
  }
  if (state === "disabled") {
    return <Badge color="slate">Vérification désactivée</Badge>;
  }
  return <Badge color="slate">État inconnu</Badge>;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 py-2 last:border-b-0">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className="text-sm font-bold text-brand-950">{value}</span>
    </div>
  );
}

export function UpdateStatusCard({ status }: { status: UpdateStatus }) {
  const toast = useToast();
  const [current, setCurrent] = useState(status);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      const response = await fetch("/api/updates?refresh=1", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Vérification impossible.");
      }
      const refreshed = (await response.json()) as UpdateStatus;
      setCurrent(refreshed);
      toast(
        refreshed.state === "outdated"
          ? "Une nouvelle version est disponible."
          : "Vérification terminée.",
      );
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Vérification impossible.",
        "error",
      );
    } finally {
      setChecking(false);
    }
  }

  const buildTime = formatDate(current.current.buildTime);
  const checkedAt = formatDate(current.checkedAt);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-100 text-brand-800">
            <RotateCw className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-bold text-brand-950">
              Version et mises à jour
            </h2>
            <p className="text-sm text-slate-500">
              Version installée et suivi des versions publiées.
            </p>
          </div>
        </div>
        <StateBadge state={current.state} />
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {current.current.development && (
          <div className="flex items-start gap-3 rounded-xl border-2 border-slate-200 bg-slate-50 p-4">
            <CircleAlert
              className="mt-0.5 h-5 w-5 shrink-0 text-slate-500"
              aria-hidden="true"
            />
            <div>
              <p className="font-bold text-brand-950">
                Exécution hors image publiée
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Aucune version n&apos;est estampillée : la comparaison avec la
                version publiée n&apos;est pas possible. C&apos;est le cas en
                développement local ou après une construction manuelle.
              </p>
            </div>
          </div>
        )}

        <div>
          <Line label="Version installée" value={current.current.version} />
          {current.current.shortRevision && (
            <Line label="Révision" value={current.current.shortRevision} />
          )}
          {buildTime && <Line label="Construite le" value={buildTime} />}
          {current.latest && (
            <Line
              label="Dernière version publiée"
              value={current.latest.shortRevision}
            />
          )}
          <Line
            label="Mise à jour automatique"
            value={
              current.autoUpdate.enabled
                ? `Activée, ${formatInterval(
                    current.autoUpdate.pollIntervalSeconds,
                  )}`
                : "Désactivée"
            }
          />
        </div>

        {current.state === "outdated" && current.latest && (
          <div className="flex items-start gap-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
            <DownloadCloud
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
              aria-hidden="true"
            />
            <div>
              <p className="font-bold text-brand-950">
                Une version plus récente est publiée
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {current.autoUpdate.enabled
                  ? `Elle sera installée automatiquement lors du prochain contrôle (${formatInterval(
                      current.autoUpdate.pollIntervalSeconds,
                    )}), sans intervention.`
                  : "La mise à jour automatique est désactivée : lancez « docker compose pull && docker compose up -d » sur le serveur."}
              </p>
            </div>
          </div>
        )}

        {current.error && (
          <p className="text-sm font-medium text-slate-500">
            {current.error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-medium text-slate-500">
            {checkedAt
              ? `Dernière vérification : ${checkedAt}`
              : "Aucune vérification effectuée."}
          </p>
          <Button
            type="button"
            variant="outline"
            icon={RefreshCw}
            loading={checking}
            onClick={check}
            disabled={current.state === "disabled"}
          >
            {checking ? "Vérification…" : "Vérifier maintenant"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
