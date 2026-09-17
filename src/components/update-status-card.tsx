"use client";

import {
  CircleAlert,
  Clock,
  DownloadCloud,
  PlugZap,
  RefreshCw,
  RotateCw,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { Badge, Button, Card } from "@/components/ui";
import { formatLongDateTime } from "@/lib/dates";
import type { UpdateStatus } from "@/lib/services/updates";

/** Durée pendant laquelle on attend le retour de l'application après un déclenchement. */
const SURVEILLANCE_MS = 4 * 60 * 1000;
const INTERVALLE_MS = 3000;

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

function StateBadge({
  state,
  stale,
}: {
  state: UpdateStatus["state"];
  stale: boolean;
}) {
  if (state === "up-to-date") {
    return (
      <Badge color={stale ? "slate" : "green"} icon={ShieldCheck}>
        {stale ? "À jour, d’après la dernière lecture" : "À jour"}
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

/** Encart d'information, neutre ou d'alerte selon le ton. */
function Encart({
  ton,
  icone: Icone,
  titre,
  children,
}: {
  ton: "neutre" | "attention" | "alerte";
  icone: typeof CircleAlert;
  titre: string;
  children: React.ReactNode;
}) {
  const teintes = {
    neutre: "border-slate-200 bg-slate-50 text-slate-500",
    attention: "border-amber-200 bg-amber-50 text-amber-700",
    alerte: "border-coral-300 bg-coral-50 text-coral-700",
  }[ton];
  const [bordure, fond, encre] = teintes.split(" ");
  return (
    <div className={`flex items-start gap-3 rounded-xl border-2 p-4 ${bordure} ${fond}`}>
      <Icone className={`mt-0.5 h-5 w-5 shrink-0 ${encre}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-bold text-brand-950">{titre}</p>
        <div className="mt-1 text-sm leading-6 text-slate-600">{children}</div>
      </div>
    </div>
  );
}

export function UpdateStatusCard({ status }: { status: UpdateStatus }) {
  const toast = useToast();
  const [current, setCurrent] = useState(status);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  /** Compte rendu de ce qui s'est réellement passé après un déclenchement. */
  const [suivi, setSuivi] = useState<
    | null
    | { etat: "attente"; message: string }
    | { etat: "installee" | "inchangee" | "perdue"; message: string }
  >(null);
  const vivant = useRef(true);

  useEffect(() => {
    vivant.current = true;
    return () => {
      vivant.current = false;
    };
  }, []);

  // L'écran est rendu côté serveur : quand la page se rafraîchit, la prop
  // apporte un état plus récent que celui gardé en mémoire ici.
  useEffect(() => {
    setCurrent(status);
  }, [status]);

  const recharger = useCallback(async () => {
    const response = await fetch("/api/updates?refresh=1", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`réponse ${response.status}`);
    return (await response.json()) as UpdateStatus;
  }, []);

  async function check() {
    setChecking(true);
    try {
      const refreshed = await recharger();
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

  /**
   * Après un déclenchement, on ne devine plus : on regarde. L'application est
   * interrogée jusqu'à ce qu'elle réponde de nouveau, puis sa révision est
   * comparée à celle d'avant. C'est la seule façon de distinguer « installée »
   * de « rien n'a bougé » — la requête de déclenchement, elle, meurt avec le
   * conteneur qu'elle vient de faire remplacer.
   */
  const surveiller = useCallback(
    async (revisionAvant: string) => {
      const limite = Date.now() + SURVEILLANCE_MS;
      let tombee = false;

      setSuivi({
        etat: "attente",
        message:
          "Demande envoyée. Si une version plus récente existe, l’application redémarre — cet écran dira ce qui a été installé.",
      });

      while (Date.now() < limite) {
        await new Promise((r) => setTimeout(r, INTERVALLE_MS));
        if (!vivant.current) return;

        // On interroge le contrôle de santé, et non l'état des mises à jour :
        // il répond sans consulter ni registre ni dépôt. Rafraîchir l'état
        // complet toutes les trois secondes épuiserait en une minute le quota
        // horaire de l'API GitHub et martèlerait le registre pour rien. Ce
        // point d'entrée atteste en outre que la base répond : une application
        // dont les migrations échouent n'est pas « revenue ».
        let sante: { revision: string | null; version: string } | null = null;
        try {
          const reponse = await fetch("/api/health", { cache: "no-store" });
          if (!reponse.ok) throw new Error(String(reponse.status));
          sante = (await reponse.json()) as { revision: string | null; version: string };
        } catch {
          // L'application ne répond plus : c'est le remplacement en cours.
          tombee = true;
          if (vivant.current) {
            setSuivi({
              etat: "attente",
              message:
                "L’application redémarre… cet écran se met à jour tout seul dès qu’elle répond.",
            });
          }
          continue;
        }

        if (!vivant.current) return;
        if (sante.revision && sante.revision !== revisionAvant) {
          // Une seule lecture complète, celle qui remet la carte à jour.
          try {
            setCurrent(await recharger());
          } catch {
            // Sans conséquence : le compte rendu ci-dessous suffit.
          }
          if (!vivant.current) return;
          setSuivi({
            etat: "installee",
            message: `Mise à jour installée : l’application tourne maintenant en ${sante.version} (${sante.revision}).`,
          });
          return;
        }
        if (tombee) {
          setSuivi({
            etat: "inchangee",
            message:
              "L’application est revenue, toujours dans la même version : le service de mise à jour n’avait rien de plus récent à installer.",
          });
          return;
        }
      }

      if (!vivant.current) return;
      setSuivi({
        etat: tombee ? "perdue" : "inchangee",
        message: tombee
          ? "L’application n’est pas revenue au bout de quatre minutes. Vérifiez sur le serveur : « docker compose ps » puis « docker compose logs app »."
          : "Le service de mise à jour n’a rien installé : aucune version plus récente n’est publiée.",
      });
    },
    [recharger],
  );

  async function applyNow() {
    setConfirmApply(false);
    setApplying(true);
    const revisionAvant = current.current.shortRevision;
    try {
      const response = await fetch("/api/updates/apply", { method: "POST" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        // Réponse sans explication entre 502 et 504 : c'est le proxy qui parle,
        // pas l'application. Une passerelle en défaut pendant que le conteneur
        // est justement remplacé annonce la mise à jour, elle ne l'infirme pas.
        if (!payload?.error && response.status >= 502 && response.status <= 504) {
          await surveiller(revisionAvant);
          return;
        }
        throw new Error(
          payload?.error ??
            `Mise à jour impossible (réponse ${response.status} du serveur).`,
        );
      }
      const { outcome } = (await response.json()) as {
        outcome: "no-update" | "restarting";
      };
      if (outcome === "restarting") {
        await surveiller(revisionAvant);
        return;
      }
      // L'updater a répondu sans nous interrompre : rien n'était à installer.
      // On revérifie tout de même, la version publiée a pu changer depuis.
      setSuivi({
        etat: "inchangee",
        message:
          "Le service de mise à jour a contrôlé le registre et rendu la main sans redémarrer l’application : rien n’a été installé.",
      });
      try {
        setCurrent(await recharger());
      } catch {
        // Sans conséquence : l'écran garde l'état qu'il avait.
      }
    } catch (error) {
      // Le conteneur peut disparaître avant de répondre : la requête échoue
      // alors côté navigateur alors que la mise à jour est bel et bien partie.
      if (error instanceof TypeError) {
        await surveiller(revisionAvant);
        return;
      }
      setSuivi(null);
      toast((error as Error).message, "error");
    } finally {
      if (vivant.current) setApplying(false);
    }
  }

  const buildTime = formatDate(current.current.buildTime);
  const checkedAt = formatDate(current.checkedAt);
  const { autoUpdate } = current;
  const injoignable =
    autoUpdate.enabled && autoUpdate.reachability === "unreachable";

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
        <StateBadge state={current.state} stale={current.stale} />
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {current.current.development && (
          <Encart
            ton="neutre"
            icone={CircleAlert}
            titre="Exécution hors image publiée"
          >
            Aucune version n&apos;est estampillée : la comparaison avec la
            version publiée n&apos;est pas possible. C&apos;est le cas en
            développement local ou après une construction manuelle.
          </Encart>
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
              value={
                current.latest.version
                  ? `${current.latest.version} (${current.latest.shortRevision})`
                  : current.latest.shortRevision
              }
            />
          )}
          <Line
            label="Mise à jour automatique"
            value={
              !autoUpdate.enabled
                ? "Désactivée"
                : autoUpdate.reachability === "reachable"
                  ? `Le service répond · contrôle prévu ${formatInterval(
                      autoUpdate.pollIntervalSeconds,
                    )}`
                  : "Activée, mais le service ne répond pas"
            }
          />
        </div>

        {/* Ce que le déclenchement a réellement produit : constaté, pas supposé. */}
        {suivi && (
          <Encart
            ton={
              suivi.etat === "perdue"
                ? "alerte"
                : suivi.etat === "installee"
                  ? "attention"
                  : "neutre"
            }
            icone={
              suivi.etat === "attente"
                ? Clock
                : suivi.etat === "installee"
                  ? ShieldCheck
                  : suivi.etat === "perdue"
                    ? CircleAlert
                    : RotateCw
            }
            titre={
              {
                attente: "Mise à jour en cours",
                installee: "Mise à jour installée",
                inchangee: "Aucune installation",
                perdue: "L’application n’est pas revenue",
              }[suivi.etat]
            }
          >
            <p>{suivi.message}</p>
            {suivi.etat === "installee" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={RefreshCw}
                className="mt-3"
                onClick={() => window.location.reload()}
              >
                Recharger la page
              </Button>
            )}
          </Encart>
        )}

        {injoignable && (
          <Encart
            ton="alerte"
            icone={PlugZap}
            titre="Le service de mise à jour ne répond pas"
          >
            Rien ne sera installé automatiquement tant qu&apos;il est arrêté.
            Sur le serveur :{" "}
            <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-slate-700">
              docker compose ps updater
            </code>{" "}
            puis{" "}
            <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] text-slate-700">
              docker compose up -d updater
            </code>
            .
          </Encart>
        )}

        {current.state === "outdated" && current.latest && (
          <Encart
            ton="attention"
            icone={DownloadCloud}
            titre="Une version plus récente est publiée"
          >
            {autoUpdate.enabled && !injoignable
              ? `Elle sera installée automatiquement lors du prochain contrôle (${formatInterval(
                  autoUpdate.pollIntervalSeconds,
                )}), sans intervention.`
              : "La mise à jour automatique n’assure pas l’installation : lancez « docker compose pull && docker compose up -d » sur le serveur."}
          </Encart>
        )}

        {/* Fusionné mais pas encore publié : ni « à jour » ni installable. */}
        {current.pending && (
          <Encart
            ton="neutre"
            icone={Clock}
            titre="Une version est en cours de publication"
          >
            Le commit{" "}
            <a
              href={current.pending.url}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-brand-700 underline underline-offset-2"
            >
              {current.pending.shortRevision}
            </a>{" "}
            {current.pending.committedAt
              ? ` a été fusionné le ${formatDate(current.pending.committedAt)} `
              : " est fusionné "}
            mais son image n&apos;est pas encore publiée. La construction dure une
            dizaine de minutes ; au-delà, vérifiez qu&apos;elle n&apos;a pas échoué.
          </Encart>
        )}

        {current.stale && (
          <Encart
            ton="neutre"
            icone={CircleAlert}
            titre="Version publiée lue précédemment"
          >
            Le registre n’a pas répondu cette fois : l’état ci-dessus repose sur
            la dernière lecture réussie, pas sur celle de maintenant.
          </Encart>
        )}

        {current.error && (
          <p className="text-sm font-medium text-slate-500">{current.error}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-medium text-slate-500">
            {checkedAt
              ? `Dernière vérification réussie : ${checkedAt}`
              : "Aucune vérification aboutie."}
          </p>
          <div className="flex flex-wrap gap-2">
            {/* Disponible dès que l'updater peut être sollicité : c'est
                précisément quand l'état est inconnu qu'on veut pouvoir forcer
                le contrôle à la main. */}
            {autoUpdate.canTriggerNow && (
              <Button
                type="button"
                icon={Rocket}
                loading={applying || suivi?.etat === "attente"}
                onClick={() => setConfirmApply(true)}
              >
                {current.state === "outdated"
                  ? "Installer maintenant"
                  : "Contrôler et installer"}
              </Button>
            )}
            {autoUpdate.enabled && !autoUpdate.canTriggerNow && (
              <p className="max-w-md text-xs font-medium leading-5 text-slate-500">
                L’installation immédiate n’est pas disponible : le jeton qui
                autorise cette page à demander un redémarrage au service de mise
                à jour n’a pas encore été généré. Il l’est tout seul au
                démarrage ; relancez la pile sur le serveur avec{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-700">
                  docker compose pull &amp;&amp; docker compose up -d
                </code>
                .
              </p>
            )}
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
      </div>

      <ConfirmDialog
        open={confirmApply}
        title={
          current.state === "outdated"
            ? "Installer la mise à jour maintenant ?"
            : "Contrôler et installer maintenant ?"
        }
        description={[
          current.state === "outdated"
            ? "L’application va redémarrer pour installer la nouvelle version et appliquer les migrations. La coupure dure quelques dizaines de secondes ; cet écran vous dira ensuite ce qui a été installé."
            : "Le service de mise à jour va contrôler le registre immédiatement. S’il y trouve une version plus récente, l’application redémarre pour l’installer ; sinon, rien ne bouge.",
          // Chaque version publiée garde son propre repère dans le registre :
          // le dire ici, avant la coupure, évite de le chercher au pire moment.
          current.current.shortRevision
            ? `Pour revenir à la version actuelle si besoin : APEL_IMAGE=${current.image.replace(/:[^:/]*$/, "")}:sha-${current.current.shortRevision} docker compose up -d app scheduler`
            : null,
        ]
          .filter(Boolean)
          .join(" ")}
        confirmLabel={
          current.state === "outdated" ? "Installer maintenant" : "Contrôler maintenant"
        }
        loading={applying}
        onConfirm={applyNow}
        onCancel={() => setConfirmApply(false)}
      />
    </Card>
  );
}
