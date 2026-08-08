import {
  Clock3,
  Database,
  ShieldCheck,
  Target,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getAssociationSettings } from "@/lib/services/association-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Politique de confidentialité" };

const sectionIcons = [ShieldCheck, Database, Target, Clock3, UserRoundCheck];

export default async function PrivacyPage() {
  const settings = await getAssociationSettings();
  const sections = [
    {
      title: "Responsable",
      content: (
        <>
          Les données collectées sur ce site sont traitées par
          l&apos;association {settings.associationName}, qui organise les
          événements.
          {settings.schoolName ? ` Établissement : ${settings.schoolName}.` : ""}
          {settings.contactEmail ? ` Contact : ${settings.contactEmail}.` : ""}
        </>
      ),
    },
    {
      title: "Données collectées",
      content: (
        <>
          Lors d&apos;une inscription comme bénévole : votre nom, et
          l&apos;e-mail et/ou le téléphone que vous indiquez. Pour les membres
          connectés : nom, e-mail et, si vous le renseignez, votre identifiant
          Telegram.
        </>
      ),
    },
    {
      title: "Finalité",
      content: (
        <>
          Ces données servent uniquement à organiser les événements de
          l&apos;association : vous contacter au sujet d&apos;un créneau, vous
          envoyer une confirmation et un rappel. Elles ne sont ni vendues ni
          cédées à des tiers.
        </>
      ),
    },
    {
      title: "Conservation",
      content: (
        <>
          Les inscriptions bénévoles sont conservées le temps de
          l&apos;organisation de l&apos;événement puis supprimées. Vous pouvez
          vous désinscrire à tout moment via le lien reçu par e-mail.
        </>
      ),
    },
    {
      title: "Vos droits",
      content: (
        <>
          Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de
          rectification et de suppression de vos données. Pour l&apos;exercer,
          contactez l&apos;association
          {settings.contactEmail ? ` à ${settings.contactEmail}` : ""}.
        </>
      ),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <section className="relative overflow-hidden rounded-2xl bg-brand-950 p-7 text-white sm:p-10">
          <div
            aria-hidden="true"
            className="absolute -right-8 -top-8 h-32 w-32 rounded-full border-[24px] border-brand-800"
          />
          <div
            aria-hidden="true"
            className="absolute bottom-5 right-24 h-3 w-24 -rotate-6 rounded-sm bg-sea-500"
          />
          <div className="relative max-w-2xl">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-white text-brand-950">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <p className="mt-7 text-xs font-extrabold uppercase tracking-[0.16em] text-sea-200">
              Vos données, en toute clarté
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-5xl">
              Politique de confidentialité
            </h1>
            <p className="mt-4 max-w-xl text-sm font-medium leading-6 text-brand-100">
              Nous collectons uniquement les informations nécessaires à
              l&apos;organisation des événements de l&apos;association{" "}
              {settings.associationName}.
            </p>
          </div>
        </section>

        <div className="mt-6 grid gap-4">
          {sections.map(({ title, content }, index) => {
            const Icon = sectionIcons[index];
            return (
              <section
                key={title}
                className="grid gap-4 rounded-2xl border-2 border-slate-200 bg-white p-6 sm:grid-cols-[48px_1fr] sm:p-7"
              >
                <span
                  className={`grid h-12 w-12 place-items-center rounded-xl ${
                    index === sections.length - 1
                      ? "bg-sea-200 text-brand-950"
                      : "bg-brand-50 text-brand-700"
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={2.5} />
                </span>
                <div>
                  <h2 className="text-lg font-black tracking-[-0.02em] text-brand-950">
                    {title}
                  </h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                    {content}
                  </p>
                </div>
              </section>
            );
          })}
        </div>

        <Link
          href="/"
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-950 px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
        >
          ← Retour à l&apos;accueil
        </Link>
      </main>

      <SiteFooter />
    </div>
  );
}
