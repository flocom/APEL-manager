"use client";

import { Compass } from "lucide-react";

import { TOUR_EVENT } from "@/components/welcome-tour";

/** Relance le guide de première connexion, monté dans la mise en page. */
export function ReplayTourButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
    >
      <Compass className="h-4 w-4" aria-hidden="true" />
      Revoir le guide de découverte
    </button>
  );
}
