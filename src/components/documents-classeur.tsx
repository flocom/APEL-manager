"use client";

import {
  BadgeCheck,
  Check,
  FileText,
  Landmark,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import type { AssociationDocumentView } from "@/components/documents-manager";
import { formatShortDate, yearInParis } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * L'état du classeur de l'association.
 *
 * Ce sont les quatre pièces qu'on vous réclame et qu'il faut retrouver vite :
 * les statuts pour la banque, l'assurance pour la mairie, le règlement pour
 * l'établissement, le dernier procès-verbal pour la préfecture. Le module les
 * signale quand elles manquent, sans en faire une liste de reproches — une
 * association qui démarre n'a rien de tout cela, et ce n'est pas une faute.
 */

interface Emplacement {
  cle: string;
  titre: string;
  icone: LucideIcon;
  present: boolean;
  detail: string;
}

// Les dates des pièces sont des minuits de Paris, soit la veille en UTC : lues
// dans le fuseau de la machine, le serveur (UTC) et le navigateur écrivaient
// deux jours différents, et React rejetait la page (erreur #418).
function annee(iso: string): number {
  return yearInParis(iso);
}

export function etatDuClasseur(documents: AssociationDocumentView[]): Emplacement[] {
  const vivants = documents.filter((d) => d.status !== "archived");
  const dernier = (type: AssociationDocumentView["type"]) =>
    vivants
      .filter((d) => d.type === type)
      .sort((a, b) => b.documentDate.localeCompare(a.documentDate))[0] ?? null;

  const statuts = dernier("statutes");
  const assurance = dernier("insurance");
  const reglement = dernier("internal_rules");
  const pv = dernier("ag_minutes");

  // L'assurance se renouvelle chaque année scolaire : une attestation de
  // l'an dernier ne prouve plus rien. On tolère l'année civile en cours et la
  // précédente, l'année scolaire étant à cheval sur les deux.
  const maintenant = yearInParis(new Date());
  const assuranceAJour =
    assurance !== null && annee(assurance.documentDate) >= maintenant - 1;

  return [
    {
      cle: "statutes",
      titre: "Statuts",
      icone: ScrollText,
      present: statuts !== null,
      detail: statuts
        ? `Déposés, version du ${formatShortDate(statuts.documentDate)}`
        : "C’est la première pièce que réclame une banque ou une mairie.",
    },
    {
      cle: "insurance",
      titre: "Assurance",
      icone: ShieldCheck,
      present: assuranceAJour,
      detail: assuranceAJour
        ? `Attestation ${annee(assurance!.documentDate)}`
        : assurance
          ? `La dernière attestation date de ${annee(assurance.documentDate)}.`
          : "Aucune attestation déposée.",
    },
    {
      cle: "internal_rules",
      titre: "Règlement intérieur",
      icone: Landmark,
      present: reglement !== null,
      detail: reglement ? "Déposé" : "Facultatif, utile s’il existe.",
    },
    {
      cle: "ag_minutes",
      titre: "Dernier PV d’AG",
      icone: FileText,
      present: pv !== null && pv.status === "final",
      detail: pv
        ? pv.status === "final"
          ? `Assemblée du ${formatShortDate(pv.documentDate)}`
          : "Un procès-verbal est en brouillon."
        : "Aucun procès-verbal d’assemblée générale.",
    },
  ];
}

export function ClasseurBandeau({
  documents,
  onVoir,
}: {
  documents: AssociationDocumentView[];
  onVoir: (type: AssociationDocumentView["type"]) => void;
}) {
  const emplacements = etatDuClasseur(documents);
  const complets = emplacements.filter((e) => e.present).length;
  const total = emplacements.length;
  const tout = complets === total;

  return (
    <section
      aria-label="État du classeur"
      className={cn(
        "overflow-hidden rounded-2xl border-2",
        tout ? "border-sea-200 bg-sea-50/60" : "border-slate-200 bg-white",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "grid h-10 w-10 place-items-center rounded-xl",
              tout ? "bg-sea-700 text-white" : "bg-brand-100 text-brand-800",
            )}
          >
            {tout ? <Check className="h-5 w-5" /> : <BadgeCheck className="h-5 w-5" />}
          </span>
          <div>
            <h2 className="font-bold text-brand-950">Le classeur de l’association</h2>
            <p className="text-sm text-slate-500">
              {tout
                ? "Tout est là : les quatre pièces qu’on vous réclamera sont déposées."
                : `${complets} pièce${complets > 1 ? "s" : ""} sur ${total}. Les autres se déposent quand vous les avez.`}
            </p>
          </div>
        </div>
        <p
          aria-hidden="true"
          className={cn(
            "text-2xl font-black tabular-nums",
            tout ? "text-sea-800" : "text-brand-900",
          )}
        >
          {complets}/{total}
        </p>
      </div>

      <ul className="grid gap-px border-t-2 border-slate-100 bg-slate-100 sm:grid-cols-2 xl:grid-cols-4">
        {emplacements.map((emplacement) => (
          <li key={emplacement.cle}>
            <button
              type="button"
              onClick={() => onVoir(emplacement.cle as AssociationDocumentView["type"])}
              className="flex h-full w-full items-start gap-3 bg-white p-4 text-left transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                  emplacement.present
                    ? "bg-sea-100 text-sea-800"
                    : "border-2 border-dashed border-slate-300 text-slate-400",
                )}
              >
                <emplacement.icone className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-bold text-slate-950">
                  {emplacement.titre}
                  {emplacement.present && (
                    <Check className="h-3.5 w-3.5 text-sea-700" aria-hidden="true" />
                  )}
                  <span className="sr-only">
                    {emplacement.present ? " — déposé" : " — manquant"}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                  {emplacement.detail}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {!tout && (
        <p className="border-t-2 border-slate-100 bg-slate-50/60 px-5 py-3 text-xs leading-5 text-slate-500">
          Une association qui démarre n’a rien de tout cela, et ce n’est pas une
          faute. Ces repères servent le jour où l’on vous demande une pièce dans
          la journée.{" "}
          <Link
            href="/dashboard/documents/regles"
            className="font-bold text-brand-700 underline underline-offset-2"
          >
            Renseigner ce que prévoient vos statuts
          </Link>
        </p>
      )}
    </section>
  );
}
