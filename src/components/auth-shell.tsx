import {
  CalendarDays,
  CheckCircle2,
  HeartHandshake,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { getAssociationSettings } from "@/lib/services/association-settings";

const highlights = [
  {
    icon: CalendarDays,
    title: "Un agenda partagé",
    description: "Tous les rendez-vous et les échéances au même endroit.",
  },
  {
    icon: CheckCircle2,
    title: "Des actions claires",
    description: "Chaque membre sait quoi faire et à quel moment.",
  },
  {
    icon: HeartHandshake,
    title: "Une équipe mobilisée",
    description: "Les bonnes volontés se coordonnent sans friction.",
  },
];

function Brand({
  appName,
  schoolName,
  inverse = false,
}: {
  appName: string;
  schoolName: string;
  inverse?: boolean;
}) {
  return (
    <Link
      href="/"
      className="inline-flex min-w-0 items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
    >
      <span className="flex h-[62px] w-[116px] shrink-0 items-center justify-center rounded-xl bg-white px-2">
        <Image
          src="/logo-notre-dame-des-flots.png"
          alt="Notre Dame des Flots"
          width={425}
          height={228}
          priority
          className="h-auto w-full object-contain"
        />
      </span>
      <span className="min-w-0">
        <span
          className={`block break-words text-sm font-extrabold tracking-[-0.02em] ${
            inverse ? "text-white" : "text-brand-950"
          }`}
        >
          {appName}
        </span>
        <span
          className={`mt-0.5 block break-words text-xs font-medium ${
            inverse ? "text-brand-200" : "text-slate-500"
          }`}
        >
          {schoolName}
        </span>
      </span>
    </Link>
  );
}

export async function AuthShell({
  title,
  description,
  eyebrow = "Espace membre",
  children,
}: {
  title: string;
  description: ReactNode;
  eyebrow?: string;
  children: ReactNode;
}) {
  const settings = await getAssociationSettings();

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(440px,.95fr)]">
      <aside className="relative hidden min-h-screen overflow-hidden bg-brand-950 px-10 py-9 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col xl:px-14 xl:py-11">
        <div
          aria-hidden="true"
          className="absolute -right-16 -top-16 h-48 w-48 rounded-full border-[34px] border-brand-800"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-0 right-0 h-40 w-40 translate-x-1/3 translate-y-1/3 rounded-full bg-brand-700"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-24 right-20 h-3 w-28 -rotate-12 rounded-sm bg-sea-500"
        />

        <div className="relative z-10">
          <Brand
            appName={settings.associationName}
            schoolName={settings.schoolName}
            inverse
          />
        </div>

        <div className="relative z-10 my-auto max-w-2xl py-10">
          <div className="inline-flex items-center gap-2 rounded-lg bg-sea-200 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-brand-950">
            <ShieldCheck className="h-4 w-4" />
            L&apos;outil des équipes APEL
          </div>

          <h2 className="mt-7 max-w-xl text-4xl font-black leading-[1.06] tracking-[-0.045em] text-white xl:text-5xl">
            Faire vivre l&apos;école,{" "}
            <span className="text-sea-200">simplement.</span>
          </h2>
          <p className="mt-5 max-w-lg text-base font-medium leading-7 text-brand-100">
            Un espace clair et efficace pour organiser les événements,
            coordonner les bénévoles et avancer ensemble.
          </p>

          <div className="mt-9 grid grid-cols-3 gap-3">
            {highlights.map(
              ({
                icon: Icon,
                title: itemTitle,
                description: itemDescription,
              }) => (
                <div
                  key={itemTitle}
                  className="rounded-2xl border-2 border-brand-800 bg-brand-900 p-4"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-brand-950">
                    <Icon className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                  <p className="mt-3 text-sm font-extrabold leading-snug text-white">
                    {itemTitle}
                  </p>
                  <p className="mt-1 text-xs font-medium leading-5 text-brand-200">
                    {itemDescription}
                  </p>
                </div>
              ),
            )}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-xs font-semibold text-brand-200">
          <ShieldCheck className="h-4 w-4" />
          Espace privé · Accès sécurisé
        </div>
      </aside>

      <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-8 sm:py-12 lg:px-12">
        <div
          aria-hidden="true"
          className="absolute right-8 top-8 hidden h-10 w-10 rounded-xl bg-brand-200 lg:block"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-10 left-8 hidden h-14 w-14 rounded-full bg-sea-500 lg:block"
        />

        <div className="relative w-full max-w-[460px]">
          <div className="mb-7 lg:hidden">
            <Brand
              appName={settings.associationName}
              schoolName={settings.schoolName}
            />
          </div>

          <section className="rounded-2xl border-2 border-slate-200 bg-white p-6 sm:p-8">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-700">
              {eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-brand-950 sm:text-4xl">
              {title}
            </h1>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
              {description}
            </p>
            <div className="mt-7">{children}</div>
          </section>

          <div className="mt-5 flex items-center justify-center gap-3 text-xs font-semibold text-slate-500">
            <Link
              href="/"
              className="rounded-md transition-colors hover:text-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              Retour au site
            </Link>
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-sea-500"
            />
            <Link
              href="/confidentialite"
              className="rounded-md transition-colors hover:text-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              Confidentialité
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
