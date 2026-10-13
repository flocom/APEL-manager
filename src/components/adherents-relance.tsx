"use client";

import { CheckCircle2, Eye, MailX, Send, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AccountingModal } from "@/components/accounting/modal";
import { libellesManquants } from "@/components/adherent-completion";
import { Button, Field, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/client";
import { formatShortDate } from "@/lib/dates";
import type {
  MemberRelanceRequest,
  MemberRelanceResult,
  MemberRelanceTarget,
} from "@/lib/member-info/types";
import { cn } from "@/lib/utils";

type Options = Omit<MemberRelanceRequest, "dryRun">;

const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) =>
  `${n} ${n > 1 ? motPluriel : mot}`;

/**
 * Relancer d'un coup les familles dont la fiche est incomplète.
 *
 * Trois temps, sans raccourci : on choisit qui relancer, on voit la liste
 * exacte des familles qui recevront le lien (et celles qu'on ne peut pas
 * joindre par e-mail), puis on confirme l'envoi. Rien ne part sans que le
 * bureau ait lu cette liste ; le bilan dit ensuite ce qui est parti.
 */
export function RelanceDialog({
  schoolYears,
  defaultYear,
  onClose,
}: {
  schoolYears: string[];
  defaultYear: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [options, setOptions] = useState<Options>({
    schoolYear: defaultYear,
    scope: "required",
    includeRecent: false,
    message: "",
  });
  const [apercu, setApercu] = useState<MemberRelanceResult | null>(null);
  const [bilan, setBilan] = useState<MemberRelanceResult | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  /** Toute modification des choix rend l'aperçu caduc. */
  function choisir(modifs: Partial<Options>) {
    setOptions((courantes) => ({ ...courantes, ...modifs }));
    setApercu(null);
    setConfirmer(false);
    setErreur(null);
  }

  async function lancer(dryRun: boolean) {
    setBusy(true);
    setErreur(null);
    try {
      const body: MemberRelanceRequest = {
        ...options,
        message: options.message?.trim() || null,
        dryRun,
      };
      const resultat = await api<MemberRelanceResult>(
        "/api/adherents/relances",
        { body },
      );
      if (dryRun) {
        setApercu(resultat);
      } else {
        setBilan(resultat);
        router.refresh();
      }
    } catch (error) {
      setErreur((error as Error).message);
    } finally {
      setBusy(false);
      setConfirmer(false);
    }
  }

  return (
    <AccountingModal
      title="Relancer les fiches incomplètes"
      eyebrow="Adhérents"
      busy={busy}
      onClose={onClose}
    >
      {bilan ? (
        <Bilan bilan={bilan} onClose={onClose} />
      ) : (
        <div className="space-y-5 p-5 sm:p-6">
          <p className="text-sm leading-6 text-slate-600">
            Chaque famille reçoit par e-mail un lien personnel, valable 30
            jours, pour compléter elle-même sa fiche : ce qui lui manque y est
            indiqué. Un lien déjà envoyé est remplacé par le nouveau.
          </p>

          <div className="sm:max-w-xs">
            <Field label="Année d’adhésion" htmlFor="relance-annee">
              <Select
                id="relance-annee"
                value={options.schoolYear}
                onChange={(event) =>
                  choisir({ schoolYear: event.currentTarget.value })
                }
                disabled={busy}
              >
                {schoolYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <fieldset disabled={busy}>
            <legend className="mb-2 text-sm font-bold text-slate-900">
              Fiches à relancer
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    value: "required",
                    titre: "Il manque une information obligatoire",
                    texte:
                      "Adresse postale, civilité, ou l’établissement où la part nationale est réglée.",
                  },
                  {
                    value: "any",
                    titre: "Il manque quoi que ce soit",
                    texte:
                      "Aussi les fiches où ne manquent que le téléphone ou le numéro dans la voie.",
                  },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xl border-2 p-3 focus-within:ring-[3px] focus-within:ring-brand-500/25",
                    options.scope === option.value
                      ? "border-brand-700 bg-brand-50/60"
                      : "border-slate-200 hover:border-brand-300",
                  )}
                >
                  <input
                    type="radio"
                    name="relance-portee"
                    value={option.value}
                    checked={options.scope === option.value}
                    onChange={() => choisir({ scope: option.value })}
                    className="mt-1 h-4 w-4 shrink-0 accent-brand-700"
                  />
                  <span className="min-w-0">
                    <span className="block font-bold text-slate-950">
                      {option.titre}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-600">
                      {option.texte}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={options.includeRecent}
              onChange={(event) =>
                choisir({ includeRecent: event.currentTarget.checked })
              }
              disabled={busy}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-700"
            />
            <span>
              Relancer aussi les familles déjà relancées il y a moins de 7
              jours
            </span>
          </label>

          <Field
            label="Mot du bureau (facultatif)"
            htmlFor="relance-message"
            hint="Ajouté en tête du message, avant la liste de ce qui manque."
          >
            <Textarea
              id="relance-message"
              rows={3}
              maxLength={1000}
              value={options.message ?? ""}
              onChange={(event) =>
                choisir({ message: event.currentTarget.value })
              }
              disabled={busy}
              placeholder="Merci de compléter votre fiche avant le 15 novembre…"
            />
          </Field>

          {erreur && (
            <p
              role="alert"
              className="rounded-xl border-2 border-coral-200 bg-coral-50 px-4 py-3 text-sm font-semibold text-coral-800"
            >
              {erreur}
            </p>
          )}

          {apercu && <Apercu apercu={apercu} />}

          {confirmer && apercu && (
            <div
              role="alertdialog"
              aria-labelledby="relance-confirmer"
              className="rounded-xl border-2 border-coral-300 bg-coral-50 p-4"
            >
              <p
                id="relance-confirmer"
                className="flex items-start gap-2 text-sm font-bold text-coral-900"
              >
                <TriangleAlert
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                Envoyer maintenant{" "}
                {pluriel(apercu.targets.length, "e-mail")} ?
              </p>
              <p className="mt-1 text-sm text-coral-900">
                Un e-mail parti ne se rappelle pas.
              </p>
              <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmer(false)}
                  disabled={busy}
                >
                  Revenir
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  icon={Send}
                  loading={busy}
                  onClick={() => lancer(false)}
                >
                  Confirmer l’envoi
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t-2 border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              Fermer
            </Button>
            {apercu ? (
              <Button
                type="button"
                icon={Send}
                onClick={() => setConfirmer(true)}
                disabled={busy || confirmer || apercu.targets.length === 0}
              >
                {apercu.targets.length > 0
                  ? `Envoyer ${pluriel(apercu.targets.length, "e-mail")}`
                  : "Aucun e-mail à envoyer"}
              </Button>
            ) : (
              <Button
                type="button"
                icon={Eye}
                loading={busy}
                onClick={() => lancer(true)}
              >
                Voir qui sera relancé
              </Button>
            )}
          </div>
        </div>
      )}
    </AccountingModal>
  );
}

function ListeFamilles({
  titre,
  explication,
  familles,
  avecDate = false,
}: {
  titre: string;
  explication?: string;
  familles: MemberRelanceTarget[];
  avecDate?: boolean;
}) {
  if (familles.length === 0) return null;
  return (
    <section className="rounded-xl border-2 border-slate-200">
      <div className="border-b-2 border-slate-100 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-bold text-slate-950">{titre}</h3>
        {explication && (
          <p className="mt-0.5 text-xs leading-5 text-slate-600">
            {explication}
          </p>
        )}
      </div>
      <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
        {familles.map((famille) => (
          <li key={famille.memberId} className="px-4 py-2.5 text-sm">
            <Link
              href={`/dashboard/adherents/${famille.memberId}`}
              className="font-semibold text-slate-950 underline-offset-2 hover:text-brand-800 hover:underline"
              target="_blank"
            >
              {famille.firstName} {famille.lastName}
            </Link>
            {famille.email && (
              <span className="block text-xs text-slate-500 [overflow-wrap:anywhere]">
                {famille.email}
              </span>
            )}
            <span className="mt-0.5 block text-xs text-slate-600">
              Il manque : {libellesManquants(famille.missing).toLocaleLowerCase("fr")}
              {avecDate && famille.lastRequestedAt
                ? ` · relancée le ${formatShortDate(famille.lastRequestedAt)}`
                : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Apercu({ apercu }: { apercu: MemberRelanceResult }) {
  const rien =
    apercu.targets.length === 0 &&
    apercu.withoutEmail.length === 0 &&
    apercu.recent.length === 0;
  return (
    <div className="space-y-3" aria-live="polite">
      <p className="text-sm font-semibold text-slate-900">
        {rien
          ? "Aucune fiche à relancer pour ces choix."
          : apercu.targets.length > 0
            ? `${pluriel(apercu.targets.length, "famille recevra", "familles recevront")} le lien.`
            : "Aucune famille ne recevra de lien."}
      </p>
      <ListeFamilles
        titre={`Destinataires (${apercu.targets.length})`}
        familles={apercu.targets}
      />
      <ListeFamilles
        titre={`Sans adresse e-mail (${apercu.withoutEmail.length})`}
        explication="Ces familles ne peuvent pas être relancées par e-mail : à contacter autrement."
        familles={apercu.withoutEmail}
      />
      <ListeFamilles
        titre={`Relancées il y a moins de 7 jours (${apercu.recent.length})`}
        explication="Laissées de côté. Cochez la case ci-dessus pour les relancer quand même."
        familles={apercu.recent}
        avecDate
      />
    </div>
  );
}

function Bilan({
  bilan,
  onClose,
}: {
  bilan: MemberRelanceResult;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4 p-5 sm:p-6" aria-live="polite">
      <p className="flex items-start gap-2 text-base font-bold text-slate-950">
        {bilan.sent > 0 && (
          <CheckCircle2
            className="mt-0.5 h-5 w-5 shrink-0 text-sea-600"
            aria-hidden="true"
          />
        )}
        {bilan.sent > 0
          ? `${pluriel(bilan.sent, "e-mail envoyé", "e-mails envoyés")}.`
          : "Aucun e-mail n’est parti."}
      </p>
      {bilan.failed > 0 && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-coral-200 bg-coral-50 px-4 py-3 text-sm font-semibold text-coral-800">
          <MailX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {pluriel(bilan.failed, "envoi a échoué", "envois ont échoué")}.
          Vérifiez les réglages d’envoi des e-mails avant de relancer.
        </p>
      )}
      <ListeFamilles
        titre={`À contacter autrement (${bilan.withoutEmail.length})`}
        explication="Fiches incomplètes sans adresse e-mail."
        familles={bilan.withoutEmail}
      />
      <div className="flex justify-end border-t-2 border-slate-100 pt-5">
        <Button type="button" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </div>
  );
}
