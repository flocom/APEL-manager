import type { Metadata } from "next";
import { CalendarX2 } from "lucide-react";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Lien d'inscription indisponible",
  robots: { index: false },
};

/** Un lien d'inscription inconnu, ou celui d'un rendez-vous non ouvert. */
export default function LienIndisponible() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 items-center px-4 py-12 sm:px-6">
        <section className="w-full rounded-2xl border-2 border-slate-200 bg-white p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-950 text-white">
            <CalendarX2 className="h-7 w-7" />
          </span>
          <h1 className="mt-5 text-2xl font-black tracking-[-0.03em] text-brand-950">
            Lien d&apos;inscription indisponible
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-slate-600">
            Cet événement n&apos;existe pas ou n&apos;accepte pas
            d&apos;inscriptions pour le moment.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-950 px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
          >
            Retour à l&apos;accueil
          </Link>
        </section>
      </main>
    </div>
  );
}
