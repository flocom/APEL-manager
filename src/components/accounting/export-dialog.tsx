"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useMemo, useState } from "react";

import { Button, buttonClasses, Field, Input } from "@/components/ui";
import { toDateInput } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { AccountingModal } from "./modal";

const SIREN_KEY = "apel:siren-export";

function readSiren() {
  try {
    return window.localStorage.getItem(SIREN_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Exercices proposés : l'année scolaire en cours (septembre–août), la précédente, l'année civile. */
function presets(today: string) {
  const [year, month] = today.split("-").map(Number);
  const schoolStart = month >= 9 ? year : year - 1;
  return [
    { label: `Année scolaire ${schoolStart}-${schoolStart + 1}`, from: `${schoolStart}-09-01`, to: `${schoolStart + 1}-08-31` },
    { label: `Année scolaire ${schoolStart - 1}-${schoolStart}`, from: `${schoolStart - 1}-09-01`, to: `${schoolStart}-08-31` },
    { label: `Année civile ${year}`, from: `${year}-01-01`, to: `${year}-12-31` },
    { label: `Année civile ${year - 1}`, from: `${year - 1}-01-01`, to: `${year - 1}-12-31` },
  ];
}

/**
 * Export comptable : le FEC (Fichier des Écritures Comptables, le format
 * réglementaire que relit l'administration fiscale ou l'expert-comptable) ou
 * le même grand livre en tableur. Seules les écritures validées y figurent :
 * l'écran signale les brouillons de la période, à valider avant la clôture.
 */
export function AccountingExportDialog({
  entries,
  onClose,
}: {
  entries: { status: "draft" | "posted"; occurredAt: string }[];
  onClose: () => void;
}) {
  const choices = useMemo(() => presets(toDateInput(new Date())), []);
  const [from, setFrom] = useState(choices[0].from);
  const [to, setTo] = useState(choices[0].to);
  const [format, setFormat] = useState<"fec" | "csv">("fec");
  const [siren, setSiren] = useState(readSiren);

  const inPeriod = entries.filter((entry) => {
    const day = toDateInput(entry.occurredAt);
    return day >= from && day <= to;
  });
  const posted = inPeriod.filter((entry) => entry.status === "posted").length;
  const drafts = inPeriod.length - posted;
  const sirenDigits = siren.replace(/\s+/g, "");
  const invalidPeriod = !from || !to || from > to;
  const invalidSiren = sirenDigits !== "" && !/^\d{9}$/.test(sirenDigits);

  const href = `/api/accounting/export?${new URLSearchParams({
    format,
    from,
    to,
    ...(format === "fec" && sirenDigits ? { siren: sirenDigits } : {}),
  }).toString()}`;

  return (
    <AccountingModal title="Export comptable" eyebrow="Clôture et contrôle" busy={false} onClose={onClose}>
      <div className="space-y-5 p-5 sm:p-6">
        <fieldset>
          <legend className="mb-2 text-sm font-bold text-slate-900">Exercice</legend>
          <div className="flex flex-wrap gap-2">
            {choices.map((choice) => (
              <button
                key={choice.label}
                type="button"
                onClick={() => {
                  setFrom(choice.from);
                  setTo(choice.to);
                }}
                className={cn(
                  "rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:ring-[3px] focus-visible:ring-brand-500/25",
                  from === choice.from && to === choice.to
                    ? "border-brand-700 bg-brand-50 text-brand-900"
                    : "border-slate-200 text-slate-600 hover:border-brand-300",
                )}
              >
                {choice.label}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Du" htmlFor="export-from">
              <Input id="export-from" type="date" value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
            </Field>
            <Field label="Au (date de clôture)" htmlFor="export-to">
              <Input id="export-to" type="date" value={to} onChange={(e) => setTo(e.currentTarget.value)} />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-bold text-slate-900">Format</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                {
                  value: "fec",
                  icon: FileText,
                  title: "FEC — fichier réglementaire",
                  text: "Fichier des Écritures Comptables (art. A. 47 A-1 du LPF), en partie double, pour l’administration fiscale ou l’expert-comptable.",
                },
                {
                  value: "csv",
                  icon: FileSpreadsheet,
                  title: "Grand livre — tableur",
                  text: "Les mêmes écritures en CSV pour Excel ou LibreOffice, avec catégorie, événement et présence du justificatif.",
                },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border-2 p-3 focus-within:ring-[3px] focus-within:ring-brand-500/25",
                  format === option.value ? "border-brand-700 bg-brand-50/60" : "border-slate-200 hover:border-brand-300",
                )}
              >
                <input
                  type="radio"
                  name="export-format"
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
                  <span className="mt-0.5 block text-xs leading-5 text-slate-600">{option.text}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {format === "fec" && (
          <Field
            label="SIREN de l’association (facultatif)"
            htmlFor="export-siren"
            hint="Le nom réglementaire du fichier est « SIRENFECAAAAMMJJ.txt ». Sans SIREN (association non immatriculée), le fichier s’appelle « FECAAAAMMJJ.txt »."
            error={invalidSiren ? "Neuf chiffres." : undefined}
          >
            <Input
              id="export-siren"
              inputMode="numeric"
              autoComplete="off"
              value={siren}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setSiren(value);
                try {
                  window.localStorage.setItem(SIREN_KEY, value);
                } catch {
                  // Mémoire du navigateur indisponible : sans conséquence.
                }
              }}
              placeholder="Ex. 123 456 789"
            />
          </Field>
        )}

        <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <p>
            <strong>{posted}</strong> écriture{posted > 1 ? "s" : ""} validée{posted > 1 ? "s" : ""} sur la période,
            en partie double (compte de trésorerie 512 / 530 contre le compte de la catégorie), numérotées dans
            l’ordre chronologique, avec les soldes de départ en à-nouveaux (journal AN).
          </p>
          {drafts > 0 && (
            <p className="mt-2 font-semibold text-amber-800">
              {drafts} brouillon{drafts > 1 ? "s" : ""} de la période n’{drafts > 1 ? "y figurent" : "y figure"} pas :
              seule une écriture validée, donc définitive, a sa place dans un export comptable. Validez-les avant
              la clôture.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Les comptes du plan comptable associatif viennent des catégories (onglet Catégories) et des comptes
            de trésorerie ; sans compte choisi, un compte usuel est déduit du nom.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t-2 border-slate-100 pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Fermer
          </Button>
          {invalidPeriod || invalidSiren ? (
            <Button type="button" icon={Download} disabled>
              Télécharger
            </Button>
          ) : (
            <a
              href={href}
              download
              className={buttonClasses("primary")}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Télécharger {format === "fec" ? "le FEC" : "le grand livre"}
            </a>
          )}
        </div>
      </div>
    </AccountingModal>
  );
}
