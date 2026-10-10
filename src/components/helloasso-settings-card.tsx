"use client";

import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  HandCoins,
  KeyRound,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  HelloAssoSummaryView,
  TempsEcoule,
  useHelloAssoSync,
} from "@/components/helloasso-sync-summary";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Field, Input } from "@/components/ui";
import { api } from "@/lib/client";
import { formatLongDateTime } from "@/lib/dates";
import type {
  HelloAssoSettingsInput,
  HelloAssoStatus,
} from "@/lib/helloasso/types";

/** Identifiant du champ « Comment régler » de la carte des réglages généraux. */
const CHAMP_COMMENT_REGLER = "membership-fee-note";

/**
 * Carte « HelloAsso » des réglages : les clés d'API, le formulaire suivi (lu
 * dans « Comment régler ») et la synchronisation des adhésions payées en
 * ligne. L'ancre `#helloasso` y mène depuis les rappels de l'application.
 */
export function HelloAssoSettingsCard({
  status,
}: {
  status: HelloAssoStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const { syncing, sync } = useHelloAssoSync();
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clientId, setClientId] = useState(status.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  // Le rappel de la liste des adhérents mène ici par `#helloasso`. Arrivée
  // par navigation côté client, la page des réglages se charge après coup :
  // le navigateur a déjà renoncé à l'ancre, on la rejoint donc nous-mêmes.
  useEffect(() => {
    if (window.location.hash === "#helloasso") {
      document
        .getElementById("helloasso")
        ?.scrollIntoView({ block: "start" });
    }
  }, []);

  async function patch(body: HelloAssoSettingsInput, message: string) {
    await api<{ status: HelloAssoStatus }>("/api/settings/helloasso", {
      method: "PATCH",
      body,
    });
    toast(message);
    router.refresh();
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = clientId.trim();
    const secret = clientSecret.trim();
    // Contrôlé ici en plus du serveur : une erreur zod n'y deviendrait que
    // « Données invalides ».
    if (!id || /\s/.test(id) || id.length > 200) {
      setErreur(
        id
          ? "L’identifiant client tient en un seul mot, sans espace."
          : "Collez l’identifiant client fourni par HelloAsso.",
      );
      document.getElementById("helloasso-client-id")?.focus();
      return;
    }
    if (!status.configured && !secret) {
      setErreur("Collez aussi le secret client fourni par HelloAsso.");
      document.getElementById("helloasso-client-secret")?.focus();
      return;
    }
    setErreur(null);
    setSaving(true);
    try {
      await patch(
        { clientId: id, ...(secret ? { clientSecret: secret } : {}) },
        "Clés HelloAsso enregistrées : HelloAsso les a acceptées.",
      );
      setClientSecret("");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setClearing(true);
    try {
      await patch({ clear: true }, "Clés HelloAsso supprimées.");
      setClientId("");
      setClientSecret("");
      setConfirmClear(false);
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setClearing(false);
    }
  }

  function allerAuChamp(event: React.MouseEvent<HTMLAnchorElement>) {
    const champ = document.getElementById(CHAMP_COMMENT_REGLER);
    if (!champ) return;
    event.preventDefault();
    champ.scrollIntoView({ behavior: "smooth", block: "center" });
    champ.focus({ preventScroll: true });
  }

  return (
    <Card
      id="helloasso"
      className="scroll-mt-24 overflow-hidden lg:scroll-mt-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-slate-100 bg-brand-50 px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-700 text-white">
            <HandCoins className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-bold text-brand-950">HelloAsso</h2>
            <p className="mt-1 text-sm text-slate-600">
              Les adhésions payées en ligne arrivent seules dans la liste des
              adhérents.
            </p>
          </div>
        </div>
        <HelloAssoBadge status={status} />
      </div>

      <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[1.2fr_.8fr]">
        <div className="min-w-0 space-y-6">
          <p className="text-sm leading-6 text-slate-600">
            Avec les clés d’API de votre compte HelloAsso, l’application relit
            les paiements du formulaire d’adhésion de l’année scolaire en cours
            : elle crée les adhérents qui manquent et marque payés ceux qui
            étaient déjà inscrits. La synchronisation se fait automatiquement,
            et à la demande avec le bouton « Synchroniser maintenant ».
          </p>

          {/* Le formulaire suivi : on ne le saisit pas ici, c'est le lien déjà
              publié dans « Comment régler ». */}
          {status.form ? (
            <div className="flex items-start gap-3 rounded-xl border-2 border-sea-200 bg-sea-50 p-4">
              <CheckCircle2
                className="mt-0.5 h-5 w-5 shrink-0 text-sea-700"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="font-bold text-brand-950">
                  Formulaire suivi
                </p>
                <a
                  href={status.form.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-900 hover:underline"
                >
                  <span className="break-all">
                    {status.form.organizationSlug} / {status.form.formSlug}
                  </span>
                  <ExternalLink
                    className="h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="sr-only"> (ouvre HelloAsso)</span>
                </a>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Le lien publié dans « Comment régler ». Pour suivre un autre
                  formulaire, changez ce lien.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border-2 border-sand-200 bg-sand-50 p-4">
              <CircleAlert
                className="mt-0.5 h-5 w-5 shrink-0 text-sand-700"
                aria-hidden="true"
              />
              <div>
                <p className="font-bold text-brand-950">
                  {status.linkDetected
                    ? "Ce lien HelloAsso n’est pas un formulaire d’adhésion"
                    : "Aucun formulaire HelloAsso"}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {status.linkDetected
                    ? "Une billetterie ou une boutique ne se synchronise pas. "
                    : ""}
                  Collez le lien de votre formulaire d’adhésion HelloAsso dans{" "}
                  <a
                    href={`#${CHAMP_COMMENT_REGLER}`}
                    onClick={allerAuChamp}
                    className="font-semibold text-brand-700 underline hover:text-brand-900"
                  >
                    « Comment régler »
                  </a>
                  , plus haut, puis enregistrez les réglages.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={save} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Identifiant client (Client ID)"
                htmlFor="helloasso-client-id"
              >
                <Input
                  id="helloasso-client-id"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  maxLength={200}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Identifiant client"
                />
              </Field>
              <Field
                label="Secret client (Client secret)"
                htmlFor="helloasso-client-secret"
                hint={
                  status.clientSecretLastFour
                    ? `Secret enregistré : •••• ${status.clientSecretLastFour}. Laissez vide pour le conserver.`
                    : "Il sera chiffré et ne sera plus jamais affiché."
                }
              >
                <div className="relative">
                  <KeyRound
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    id="helloasso-client-secret"
                    type="password"
                    className="pl-10"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    maxLength={500}
                    placeholder={
                      status.configured
                        ? "Conserver le secret actuel"
                        : "Secret client"
                    }
                    autoComplete="new-password"
                  />
                </div>
              </Field>
            </div>

            {erreur && (
              <p
                role="alert"
                className="flex items-start gap-2 text-sm font-semibold text-coral-700"
              >
                <CircleAlert
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                {erreur}
              </p>
            )}

            {status.configured && status.verifiedAt && (
              <p className="text-sm font-semibold text-sea-800">
                Clés acceptées par HelloAsso le{" "}
                {formatLongDateTime(status.verifiedAt)}.
              </p>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <ShieldCheck
                  className="h-4 w-4 shrink-0 text-sea-600"
                  aria-hidden="true"
                />
                Le secret est chiffré avant son stockage.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {status.configured && (
                  <Button
                    type="button"
                    variant="dangerOutline"
                    icon={Trash2}
                    onClick={() => setConfirmClear(true)}
                  >
                    Supprimer les clés
                  </Button>
                )}
                <Button type="submit" loading={saving} icon={Save}>
                  Enregistrer les clés
                </Button>
              </div>
            </div>
          </form>

          <details className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer text-sm font-bold text-brand-950">
              Où trouver ces clés ?
            </summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
              <li>
                Connectez-vous à HelloAsso avec un compte qui administre
                l’association.
              </li>
              <li>
                Sur HelloAsso : <strong>Mon compte › Intégrations et API</strong>.
              </li>
              <li>
                Dans la partie consacrée aux clés d’API, générez une clé si
                aucune n’existe, puis copiez l’
                <strong>identifiant client</strong> (Client ID) et le{" "}
                <strong>secret client</strong> (Client secret).
              </li>
              <li>
                Collez-les ici et enregistrez : l’application les essaie
                aussitôt auprès de HelloAsso et refuse des clés invalides.
              </li>
            </ol>
          </details>
        </div>

        <section
          aria-labelledby="helloasso-sync-title"
          className="min-w-0 space-y-4 border-t-2 border-slate-100 pt-6 xl:border-l-2 xl:border-t-0 xl:pl-6 xl:pt-0"
        >
          <div>
            <h3
              id="helloasso-sync-title"
              className="font-bold text-brand-950"
            >
              Synchronisation
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {status.lastSyncAt ? (
                <>
                  Dernière synchronisation <TempsEcoule iso={status.lastSyncAt} />
                  .
                </>
              ) : (
                "Aucune synchronisation pour l’instant."
              )}
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            icon={RefreshCw}
            loading={syncing}
            onClick={sync}
            disabled={!status.configured || !status.form}
            className="w-full"
          >
            Synchroniser maintenant
          </Button>
          {(!status.configured || !status.form) && (
            <p className="text-sm text-slate-500">
              {!status.configured
                ? "Enregistrez d’abord les clés d’API."
                : "Ajoutez d’abord le lien du formulaire dans « Comment régler »."}
            </p>
          )}

          {status.lastSyncStatus === "failed" && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border-2 border-coral-200 bg-coral-50 p-4 text-sm"
            >
              <CircleAlert
                className="mt-0.5 h-5 w-5 shrink-0 text-coral-700"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="font-bold text-coral-800">
                  La dernière synchronisation a échoué
                </p>
                {status.lastSyncError && (
                  <p className="mt-1 break-words leading-6 text-slate-700">
                    {status.lastSyncError}
                  </p>
                )}
              </div>
            </div>
          )}

          {status.lastSyncSummary && (
            <div>
              {status.lastSyncStatus === "failed" && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Dernier bilan réussi
                </p>
              )}
              <HelloAssoSummaryView summary={status.lastSyncSummary} />
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Supprimer les clés HelloAsso ?"
        description="La synchronisation s’arrête. Les adhérents déjà importés restent dans la liste."
        confirmLabel="Supprimer les clés"
        loading={clearing}
        onConfirm={clear}
        onCancel={() => setConfirmClear(false)}
      />
    </Card>
  );
}

function HelloAssoBadge({ status }: { status: HelloAssoStatus }) {
  if (!status.configured) {
    return <Badge color="slate">Non configuré</Badge>;
  }
  if (!status.form) {
    return <Badge color="amber">Formulaire manquant</Badge>;
  }
  if (status.lastSyncStatus === "failed") {
    return <Badge color="coral">Synchronisation en échec</Badge>;
  }
  return (
    <Badge color="sea" icon={CheckCircle2}>
      Connecté
    </Badge>
  );
}
