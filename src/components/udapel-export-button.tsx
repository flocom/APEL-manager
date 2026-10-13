"use client";

import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";

import { buttonClasses, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Téléchargement du tableau des familles adhérentes au format de l'Apel
 * départementale (UDAPEL), pour l'année choisie. Les informations
 * obligatoires manquantes y sont surlignées en jaune ; `incompleteByYear`
 * permet d'annoncer avant le téléchargement combien de fiches sont à
 * compléter.
 */
export function UdapelExportButton({
  schoolYears,
  defaultYear,
  incompleteByYear,
  className,
}: {
  schoolYears: string[];
  defaultYear: string;
  /** Fiches actives où il manque une information obligatoire, par année. */
  incompleteByYear?: Record<string, number>;
  className?: string;
}) {
  const years = schoolYears.includes(defaultYear)
    ? schoolYears
    : [defaultYear, ...schoolYears];
  const [year, setYear] = useState(defaultYear);
  const incomplete = incompleteByYear?.[year] ?? 0;
  const href = `/api/adherents/export/udapel?${new URLSearchParams({
    schoolYear: year,
  }).toString()}`;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {years.length > 1 && (
          <Select
            aria-label="Année du tableau UDAPEL"
            value={year}
            onChange={(event) => setYear(event.target.value)}
            className="w-auto min-w-0 py-2 sm:w-36"
          >
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        )}
        <a
          href={href}
          download
          className={buttonClasses("outline")}
          title="Liste des familles adhérentes, au format demandé par l’Apel départementale"
        >
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          Tableau UDAPEL{years.length > 1 ? "" : ` ${year}`}
        </a>
      </div>
      {incomplete > 0 && (
        <p className="text-xs font-semibold text-sand-800">
          {incomplete} fiche{incomplete > 1 ? "s" : ""} à compléter : les cases
          manquantes sont en jaune dans le tableau.
        </p>
      )}
    </div>
  );
}
