"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";

import { AccountingModal } from "@/components/accounting/modal";
import { Button, buttonClasses, Field, Select } from "@/components/ui";
import {
  cotisationPleine,
  tarifDeReference,
  viaAutreEtablissement,
} from "@/lib/adherent-export";
import type { AdherentView } from "@/lib/adherent-view";
import { currentSchoolYear } from "@/lib/dates";
import { formatEuros } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Export de la liste des adhérents d'une année pour l'APEL départementale
 * (voir `tableauAdherents`).
 *
 * L'écran annonce ce qui part avant le téléchargement : le nombre de familles,
 * le total des cotisations, les familles écartées parce qu'elles adhèrent par
 * un autre établissement, et les fiches qui partiraient incomplètes — une
 * adresse manquante, c'est un magazine qui n'arrive pas.
 */
export function AdherentsExportDialog({
  members,
  schoolYears,
  initialYear,
  tarifCotisationCents,
  onClose,
}: {
  members: AdherentView[];
  schoolYears: string[];
  initialYear: string;
  tarifCotisationCents: number | null;
  onClose: () => void;
}) {
  const [annee, setAnnee] = useState(initialYear);
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [enAttente, setEnAttente] = useState(false);
  const [autresEtablissements, setAutresEtablissements] = useState(false);

  const deLAnnee = members.filter(
    (m) =>
      m.schoolYear === annee &&
      (m.status === "active" || (enAttente && m.status === "pending")),
  );
  const pending = members.filter(
    (m) => m.schoolYear === annee && m.status === "pending",
  ).length;
  // Même règle que le serveur (`tableauAdherents`) : ce que l'écran annonce est
  // ce que le fichier contient.
  const pleine = cotisationPleine(
    deLAnnee,
    tarifDeReference(annee, currentSchoolYear(), tarifCotisationCents),
  );
  const reduites = deLAnnee.filter((m) => viaAutreEtablissement(m.membershipFeeCents, pleine));
  const retenus = autresEtablissements
    ? deLAnnee
    : deLAnnee.filter((m) => !viaAutreEtablissement(m.membershipFeeCents, pleine));
  const cotisations = retenus.reduce((t, m) => t + m.membershipFeeCents, 0);
  const sansAdresse = retenus.filter(
    (m) => !m.addressLine1 || !m.postalCode || !m.city,
  );
  const sansEmail = retenus.filter((m) => !m.email).length;

  const href = `/api/adherents/export?${new URLSearchParams({
    annee,
    format,
    ...(enAttente ? { enAttente: "1" } : {}),
    ...(autresEtablissements ? { autresEtablissements: "1" } : {}),
  }).toString()}`;

  const noms = (liste: AdherentView[]) =>
    `${liste
      .slice(0, 5)
      .map((m) => `${m.firstName} ${m.lastName}`)
      .join(", ")}${liste.length > 5 ? "…" : ""}`;

  return (
    <AccountingModal
      title="Exporter pour l’APEL départementale"
      eyebrow="Adhérents"
      busy={false}
      onClose={onClose}
    >
      <div className="space-y-5 p-5 sm:p-6">
        <Field label="Année scolaire" htmlFor="export-adherents-annee">
          <Select
            id="export-adherents-annee"
            data-autofocus
            value={annee}
            onChange={(e) => setAnnee(e.currentTarget.value)}
          >
            {schoolYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </Select>
        </Field>

        <fieldset>
          <legend className="mb-2 text-sm font-bold text-slate-900">Format</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                {
                  value: "xlsx",
                  icon: FileSpreadsheet,
                  title: "Excel (.xlsx)",
                  text: "Le format que demandent les APEL départementales.",
                },
                {
                  value: "csv",
                  icon: FileText,
                  title: "CSV",
                  text: "Le même tableau en texte, pour un autre logiciel.",
                },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border-2 p-3 focus-within:ring-[3px] focus-within:ring-brand-500/25",
                  format === option.value
                    ? "border-brand-700 bg-brand-50/60"
                    : "border-slate-200 hover:border-brand-300",
                )}
              >
                <input
                  type="radio"
                  name="export-adherents-format"
                  value={option.value}
                  checked={format === option.value}
                  onChange={() => setFormat(option.value)}
                  className="mt-1 h-4 w-4 accent-brand-700"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-bold text-slate-950">
                    <option.icon className="h-4 w-4 text-brand-700" aria-hidden="true" />
                    {option.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-600">
                    {option.text}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {(pending > 0 || reduites.length > 0) && (
          <div className="space-y-3">
            {pending > 0 && (
              <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={enAttente}
                  onChange={(e) => setEnAttente(e.currentTarget.checked)}
                  className="mt-0.5 h-4 w-4 accent-brand-700"
                />
                <span>
                  Inclure {pending > 1 ? `les ${pending} fiches` : "la fiche"} en attente
                  <span className="block text-xs text-slate-500">
                    Par défaut, seules les adhésions actives partent.
                  </span>
                </span>
              </label>
            )}
            {reduites.length > 0 && (
              <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={autresEtablissements}
                  onChange={(e) => setAutresEtablissements(e.currentTarget.checked)}
                  className="mt-0.5 h-4 w-4 accent-brand-700"
                />
                <span>
                  Inclure {reduites.length === 1 ? "la famille" : `les ${reduites.length} familles`}{" "}
                  adhérente{reduites.length > 1 ? "s" : ""} par un autre établissement (
                  {noms(reduites)})
                  <span className="block text-xs text-slate-500">
                    {reduites.length > 1
                      ? `Elles règlent moins que la cotisation pleine de ${formatEuros(pleine)} : leur part au mouvement est déjà remontée par leur autre établissement. Écartées par défaut ; incluses, elles sont signalées dans une colonne.`
                      : `Elle règle moins que la cotisation pleine de ${formatEuros(pleine)} : sa part au mouvement est déjà remontée par son autre établissement. Écartée par défaut ; incluse, elle est signalée dans une colonne.`}
                  </span>
                </span>
              </label>
            )}
          </div>
        )}

        <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <p>
            <strong>{retenus.length}</strong> adhésion{retenus.length > 1 ? "s" : ""}, pour{" "}
            <strong>{formatEuros(cotisations)}</strong> de cotisations. Une ligne par famille :
            nom et prénom du parent, e-mail, adresse postale et cotisation ; en pied, le
            nombre d’adhésions et le total.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Les dons, les notes internes, le téléphone et le règlement n’y figurent pas : ils
            restent à l’APEL de l’établissement.
          </p>
          {sansAdresse.length > 0 && (
            <p className="mt-2 font-semibold text-amber-800">
              {sansAdresse.length} fiche{sansAdresse.length > 1 ? "s n’ont" : " n’a"} pas
              d’adresse postale complète : {noms(sansAdresse)}. Complétez-
              {sansAdresse.length > 1 ? "les" : "la"} avant l’envoi si possible.
            </p>
          )}
          {sansEmail > 0 && (
            <p className="mt-1 text-amber-800">
              {sansEmail} fiche{sansEmail > 1 ? "s" : ""} sans e-mail.
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t-2 border-slate-100 pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Fermer
          </Button>
          {retenus.length === 0 ? (
            <Button type="button" icon={Download} disabled>
              Télécharger
            </Button>
          ) : (
            <a href={href} download className={buttonClasses("primary")}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Télécharger la liste
            </a>
          )}
        </div>
      </div>
    </AccountingModal>
  );
}
