import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { formatEurosAbsolute } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Les pièces communes aux onglets d'un événement.
 *
 * Elles vivaient toutes dans la page : elles sont désormais partagées entre le
 * gabarit de la fiche et les pages de chaque onglet. La barre d'onglets, qui
 * doit savoir où l'on se trouve, vit à part dans `event-detail-nav.tsx`.
 *
 * Les onglets sont devenus de vraies routes — `/preparation`, `/benevoles`,
 * `/presences`, `/budget` — et non plus un paramètre `?onglet=`. La raison
 * n'est pas esthétique : le routeur de Next 15 abandonnait une navigation sur
 * deux lorsque seule la chaîne de requête changeait (mesuré : 12 clics perdus
 * sur 24), alors qu'une navigation par chemin n'a jamais échoué. Le
 * préchargement ramenait la perte à 2 sur 96 ; le chemin la supprime.
 */

export function OverviewLink({
  href,
  icon: Icon,
  label,
  value,
  hint,
  progress,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  progress?: number;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            {label}
          </p>
          <p className="mt-1 font-black text-slate-950">{value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p>
        </div>
        <ChevronRight className="mt-2 h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700" />
      </div>
      {progress !== undefined && (
        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-label="Avancement de la préparation"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span
            className="block h-full rounded-full bg-brand-600"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </Link>
  );
}

export function SectionHeading({
  icon: Icon,
  title,
  description,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700",
          compact ? "h-9 w-9" : "h-11 w-11",
        )}
      >
        <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
      </span>
      <div>
        <h2
          className={cn(
            "font-bold text-slate-950",
            compact ? "text-base" : "text-xl",
          )}
        >
          {title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export function BudgetStat({
  label,
  cents,
  tone,
}: {
  label: string;
  cents: number;
  tone: "green" | "red" | "brand";
}) {
  const tones = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    red: "border-coral-200 bg-coral-50 text-coral-800",
    brand: "border-brand-200 bg-brand-50 text-brand-800",
  } as const;
  return (
    <div className={cn("rounded-2xl border-2 p-4", tones[tone])}>
      <p className="text-xs font-extrabold uppercase tracking-[0.14em]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black tabular-nums">
        {cents < 0 ? "−" : ""}
        {formatEurosAbsolute(cents)}
      </p>
    </div>
  );
}
