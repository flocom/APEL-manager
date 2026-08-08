import {
  ArrowLeft,
  CalendarDays,
  Coins,
  HeartHandshake,
  Mail,
  MessagesSquare,
  Sparkles,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { JoinForm } from "@/components/join-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getAssociationSettings } from "@/lib/services/association-settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getAssociationSettings();
  const title = `Rejoindre ${settings.associationName}`;
  const description = `Ce que fait ${settings.associationName} à ${settings.schoolName}, et comment en être.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
  };
}

const ACTIONS = [
  {
    icon: CalendarDays,
    title: "Organiser les temps forts",
    text: "Kermesse, vide-grenier, boom, venue du Père Noël : l’association monte les rendez-vous qui font l’année des enfants.",
  },
  {
    icon: Coins,
    title: "Financer les projets de l’école",
    text: "Les bénéfices des ventes et des événements reviennent aux classes : sorties, spectacles, matériel, voyages.",
  },
  {
    icon: MessagesSquare,
    title: "Porter la voix des parents",
    text: "L’association représente les familles auprès de la direction et relaie ce qui compte pour elles.",
  },
  {
    icon: Users,
    title: "Créer du lien entre familles",
    text: "On se croise, on prépare, on partage un café : c’est souvent là que les nouvelles familles trouvent leur place.",
  },
];

const ENGAGEMENTS = [
  "Deux heures sur un stand, une fois dans l’année : c’est déjà un vrai coup de main.",
  "Un savoir-faire ponctuel — affiches, pâtisserie, bricolage, photos — sans réunion à la clé.",
  "Une place au bureau, pour celles et ceux qui veulent s’impliquer davantage.",
];

export default async function RejoindrePage() {
  const settings = await getAssociationSettings();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />

      <main className="flex-1">
        <section className="relative isolate overflow-hidden bg-brand-950 text-white">
          <div
            aria-hidden="true"
            className="absolute -right-24 -top-24 h-64 w-64 rounded-full border-[44px] border-brand-800"
          />
          <div className="relative mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg text-sm font-extrabold text-brand-100 transition-colors hover:text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour à l’accueil
            </Link>
            <span className="mt-6 inline-flex items-center gap-2 rounded-lg bg-sea-200 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.14em] text-brand-950">
              <HeartHandshake className="h-4 w-4" strokeWidth={2.5} />
              {settings.associationName}
            </span>
            <h1 className="mt-6 text-4xl font-black leading-[1.05] tracking-[-0.04em] sm:text-5xl">
              Rejoindre l’association
            </h1>
            <p className="mt-5 max-w-2xl text-base font-medium leading-7 text-brand-100 sm:text-lg">
              {settings.associationName} réunit les parents d’élèves de{" "}
              {settings.schoolName}. On y donne le temps qu’on a, pas celui
              qu’on n’a pas — et chaque coup de main sert directement aux
              enfants.
            </p>
          </div>
        </section>

        <section className="bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-700">
              Ce que fait l’association
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.035em] text-brand-950">
              Quatre missions, toute l’année
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {ACTIONS.map(({ icon: Icon, title, text }) => (
                <article
                  key={title}
                  className="rounded-2xl border-2 border-slate-200 bg-white p-6"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-800">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-lg font-black tracking-[-0.02em] text-brand-950">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                    {text}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="rounded-2xl bg-brand-950 p-6 text-white sm:p-8">
              <div className="flex items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sea-500">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-2xl font-black tracking-[-0.03em]">
                    S’engager, à la mesure de chacun
                  </h2>
                  <ul className="mt-4 space-y-3">
                    {ENGAGEMENTS.map((item) => (
                      <li
                        key={item}
                        className="flex gap-3 text-sm font-medium leading-6 text-brand-100"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sea-300"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="contact" className="scroll-mt-20 bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-700">
              Prendre contact
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.035em] text-brand-950">
              Écrivez-nous
            </h2>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
              Pas besoin de savoir déjà ce que vous voulez faire : dites-nous
              qui vous êtes, on vous rappellera ce qui se prépare.
              {settings.contactEmail && (
                <>
                  {" "}
                  Vous préférez votre messagerie ?{" "}
                  <a
                    href={`mailto:${settings.contactEmail}`}
                    className="inline-flex items-center gap-1.5 font-bold text-brand-800 underline"
                  >
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    {settings.contactEmail}
                  </a>
                </>
              )}
            </p>
            <div className="mt-8 rounded-2xl border-2 border-slate-200 bg-white p-6 sm:p-8">
              <JoinForm contactEmail={settings.contactEmail} />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
