"use client";

import {
  CircleAlert,
  DownloadCloud,
  RefreshCw,
  RotateCw,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { Badge, Button, Card } from "@/components/ui";
import { formatLongDateTime } from "@/lib/dates";
import type { UpdateStatus } from "@/lib/services/updates";

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatLongDateTime(date);
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
  const [applying, setApplying] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);

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
      // Un contrôle qui n'a pas abouti ne doit pas s'annoncer comme terminé :
      // l'état affiché vient alors de la dernière réponse connue.
      if (refreshed.error) {
        toast(refreshed.error, "error");
      } else {
        toast(
          refreshed.state === "outdated"
            ? "Une nouvelle version est disponible."
            : "Vérification terminée.",
        );
      }
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Vérification impossible.",
        "error",
      );
    } finally {
      setChecking(false);
    }
  }

  async function applyNow() {
    setConfirmApply(false);
    setApplying(true);
    try {
      const response = await fetch("/api/updates/apply", { method: "POST" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error || "Mise à jour impossible.");
      }
      const { outcome } = (await response.json()) as {
        outcome: "started" | "restarting";
      };
      toast(
        outcome === "restarting"
          ? "Mise à jour lancée. L’application redémarre, rechargez la page dans un instant."
          : "Contrôle effectué : aucune version plus récente à installer.",
      );
    } catch (error) {
      // Le conteneur peut disparaître avant de répondre : la requête échoue
      // alors côté navigateur alors que la mise à jour est bel et bien partie.
      toast(
        error instanceof TypeError
          ? "Mise à jour lancée. L’application redémarre, rechargez la page dans un instant."
          : (error as Error).message,
        error instanceof TypeError ? "success" : "error",
      );
    } finally {
      setApplying(false);
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
              {current.autoUpdate.canTriggerNow && (
                <Button
                  type="button"
                  size="sm"
                  icon={Rocket}
                  loading={applying}
                  onClick={() => setConfirmApply(true)}
                  className="mt-3"
                >
                  Appliquer maintenant
                </Button>
              )}
              {current.autoUpdate.enabled &&
                !current.autoUpdate.canTriggerNow && (
                  <p className="mt-2 text-xs font-medium leading-5 text-slate-500">
                    L’installation immédiate n’est pas disponible : le jeton
                    qui autorise cette page à demander un redémarrage au
                    service de mise à jour n’a pas encore été généré. Il l’est
                    tout seul au démarrage ; relancez la pile sur le serveur
                    avec{" "}
                    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-700">
                      docker compose pull &amp;&amp; docker compose up -d
                    </code>
                    .
                  </p>
                )}
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
              ? `Dernière vérification réussie : ${checkedAt}`
              : "Aucune vérification aboutie."}
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

      <ConfirmDialog
        open={confirmApply}
        title="Installer la mise à jour maintenant ?"
        description="L’application va redémarrer pour installer la nouvelle version et appliquer les migrations. La coupure dure quelques dizaines de secondes ; les requêtes en cours patientent au lieu d’échouer."
        confirmLabel="Installer maintenant"
        loading={applying}
        onConfirm={applyNow}
        onCancel={() => setConfirmApply(false)}
      />
    </Card>
  );
}
