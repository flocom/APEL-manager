import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Hand,
  HeartHandshake,
  MapPin,
  MessageCircle,
  MousePointerClick,
} from "lucide-react";
import Link from "next/link";

import { FormattedText } from "@/components/formatted-text";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getUpcomingPublishedEvents } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { getAssociationSettings } from "@/lib/services/association-settings";

export const dynamic = "force-dynamic";

const participationSteps = [
  {
    icon: CalendarDays,
    number: "01",
    title: "Je choisis",
    description: "Je découvre les événements et les créneaux disponibles.",
  },
  {
    icon: MousePointerClick,
    number: "02",
    title: "Je m’inscris",
    description: "Je laisse mes coordonnées en moins d’une minute.",
  },
  {
    icon: HeartHandshake,
    number: "03",
    title: "Je participe",
    description: "Je rejoins l’équipe pour faire de ce moment une réussite.",
  },
];

export default async function HomePage() {
  const [events, settings] = await Promise.all([
    getUpcomingPublishedEvents(),
    getAssociationSettings(),
  ]);
  const openPlaces = events.reduce(
    (sum, event) =>
      sum +
      event.volunteerSlots.reduce(
        (slotSum, slot) =>
          slotSum + Math.max(0, slot.capacity - slot.signups.length),
        0,
      ),
    0,
  );

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />

      <main className="flex-1">
        <section className="relative isolate overflow-hidden bg-brand-950 text-white">
          <div
            aria-hidden="true"
            className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[44px] border-brand-800"
          />
          <div
            aria-hidden="true"
            className="absolute bottom-10 left-[48%] hidden h-4 w-40 -rotate-6 rounded-sm bg-sea-500 lg:block"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-brand-700"
          />

          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_.95fr] lg:gap-20 lg:py-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-lg bg-sea-200 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.14em] text-brand-950">
                <HeartHandshake className="h-4 w-4" strokeWidth={2.5} />
                {settings.associationName} · {settings.schoolName}
              </span>
              <h1 className="mt-7 max-w-3xl text-4xl font-black leading-[1.03] tracking-[-0.05em] sm:text-6xl lg:text-7xl">
                Les parents font bouger{" "}
                <span className="text-sea-300">l&apos;école.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base font-medium leading-7 text-brand-100 sm:text-lg">
                Découvrez les rendez-vous de l&apos;association{" "}
                {settings.associationName} et choisissez simplement comment
                donner un coup de main. Un créneau, une mission, un beau moment
                partagé.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href="#evenements"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sea-300 px-5 py-3 text-sm font-extrabold text-brand-950 transition-colors hover:bg-sea-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
                >
                  Voir les événements
                  <ArrowRight className="h-4 w-4" />
                </a>
                <Link
                  href="/rejoindre"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-white px-5 py-3 text-sm font-extrabold text-white transition-colors hover:bg-white hover:text-brand-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
                >
                  <HeartHandshake className="h-4 w-4" />
                  Rejoindre l&apos;association
                </Link>
                <span className="inline-flex min-h-12 items-center gap-2 px-2 text-sm font-semibold text-brand-100">
                  <CheckCircle2 className="h-5 w-5 text-sea-200" />
                  Inscription sans compte
                </span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-lg lg:mx-0">
              <div
                aria-hidden="true"
                className="absolute -right-4 -top-4 h-20 w-20 rounded-xl bg-sea-200"
              />
              <div
                aria-hidden="true"
                className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-brand-600"
              />

              <div className="relative rounded-2xl bg-white p-5 text-brand-950 sm:p-7">
                <div className="flex items-center justify-between gap-5 border-b-2 border-slate-100 pb-5">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-700">
                      Association des parents
                    </p>
                    <p className="mt-1 break-words text-lg font-black tracking-[-0.02em] text-brand-950 sm:text-xl">
                      {settings.schoolName}
                    </p>
                  </div>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-950 text-white">
                    <HeartHandshake className="h-6 w-6" />
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 py-5">
                  <a
                    href="#evenements"
                    className="group rounded-2xl bg-brand-50 p-4 transition-colors hover:bg-brand-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                  >
                    <CalendarDays className="h-5 w-5 text-brand-700" />
                    <p className="mt-5 text-4xl font-black tracking-[-0.04em] text-brand-950">
                      {events.length}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-sm font-bold text-slate-600">
                      événement{events.length > 1 ? "s" : ""} à venir
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-1" />
                    </p>
                  </a>
                  <a
                    href="#evenements"
                    className="group rounded-2xl bg-sea-200 p-4 transition-colors hover:bg-sea-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                  >
                    <Hand className="h-5 w-5 text-brand-950" />
                    <p className="mt-5 text-4xl font-black tracking-[-0.04em] text-brand-950">
                      {openPlaces}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-sm font-bold text-brand-950">
                      coup{openPlaces > 1 ? "s" : ""} de main recherché
                      {openPlaces > 1 ? "s" : ""}
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-1" />
                    </p>
                  </a>
                </div>

                <div className="flex items-center gap-3 rounded-2xl bg-brand-950 p-4 text-white">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sea-500">
                    <Hand className="h-5 w-5" />
                  </span>
                  <p className="text-sm font-semibold leading-5 text-brand-100">
                    Chaque coup de main compte, même le plus petit.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="evenements"
          className="scroll-mt-20 bg-slate-50 py-16 sm:py-20"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-700">
                  Agenda de l&apos;association
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-brand-950 sm:text-5xl">
                  Les prochains rendez-vous
                </h2>
              </div>
              <p className="max-w-md text-sm font-medium leading-6 text-slate-600">
                Trouvez l&apos;événement qui vous correspond et rejoignez
                l&apos;équipe en quelques clics.
              </p>
            </div>

            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-200 bg-white px-6 py-14 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-950 text-white">
                  <CalendarDays className="h-7 w-7" />
                </span>
                <p className="mt-4 font-extrabold text-brand-950">
                  Aucun événement à venir
                </p>
                <p className="mt-1 max-w-sm text-sm font-medium text-slate-500">
                  Revenez bientôt, de nouveaux rendez-vous seront publiés ici.
                </p>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                {events.map((event, index) => {
                  const capacity = event.volunteerSlots.reduce(
                    (sum, slot) => sum + slot.capacity,
                    0,
                  );
                  const taken = event.volunteerSlots.reduce(
                    (sum, slot) => sum + slot.signups.length,
                    0,
                  );
                  const remaining = Math.max(0, capacity - taken);

                  return (
                    <Link
                      key={event.id}
                      href={`/inscription/${event.shareToken}`}
                      className="group rounded-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300"
                    >
                      <article className="flex h-full flex-col overflow-hidden rounded-2xl border-2 border-slate-200 bg-white transition-colors group-hover:border-brand-600">
                        <div
                          className={`h-2 ${
                            index % 2 === 0 ? "bg-brand-700" : "bg-sea-500"
                          }`}
                        />
                        <div className="flex flex-1 flex-col p-6">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="text-xl font-black leading-tight tracking-[-0.025em] text-brand-950">
                              {event.title}
                            </h3>
                            {remaining > 0 && (
                              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sea-200 px-2.5 py-1.5 text-xs font-extrabold text-brand-950">
                                <Hand className="h-3.5 w-3.5" />
                                {remaining} place{remaining > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                          <p className="mt-4 flex items-center gap-2 text-sm font-extrabold text-brand-700">
                            <CalendarDays className="h-4 w-4" />
                            {formatDateTime(event.startAt)}
                          </p>
                          {event.location && (
                            <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-500">
                              <MapPin className="h-4 w-4" />
                              {event.location}
                            </p>
                          )}
                          {event.publicDescription && (
                            <FormattedText
                              text={event.publicDescription}
                              className="mt-4 break-words text-sm font-medium leading-6 text-slate-600"
                            />
                          )}
                          <div className="mt-auto flex items-center gap-2 pt-6 text-sm font-extrabold text-brand-700">
                            {remaining > 0
                              ? "Voir et se proposer"
                              : "Voir l’événement"}
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                          </div>
                        </div>
                      </article>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="border-y-2 border-slate-100 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-700">
                Participer, c&apos;est simple
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-brand-950 sm:text-5xl">
                Trois étapes. Un vrai impact.
              </h2>
            </div>

            <div className="mt-9 grid gap-4 md:grid-cols-3">
              {participationSteps.map(
                ({ icon: Icon, number, title, description }, index) => (
                  <div
                    key={number}
                    className={`rounded-2xl p-6 ${
                      index === 1
                        ? "bg-brand-100 text-brand-950"
                        : "bg-brand-950 text-white"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`grid h-11 w-11 place-items-center rounded-xl ${
                          index === 1
                            ? "bg-brand-950 text-white"
                            : "bg-white text-brand-950"
                        }`}
                      >
                        <Icon className="h-5 w-5" strokeWidth={2.5} />
                      </span>
                      <span
                        className={`text-sm font-black ${
                          index === 1 ? "text-brand-800" : "text-brand-300"
                        }`}
                      >
                        {number}
                      </span>
                    </div>
                    <h3 className="mt-8 text-xl font-black">{title}</h3>
                    <p
                      className={`mt-2 text-sm font-medium leading-6 ${
                        index === 1 ? "text-brand-900" : "text-brand-100"
                      }`}
                    >
                      {description}
                    </p>
                  </div>
                ),
              )}
            </div>

            {settings.whatsappGroupUrl && (
              <a
                href={settings.whatsappGroupUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-lg text-sm font-extrabold text-brand-800 underline underline-offset-2 transition-colors hover:text-brand-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Toutes les infos au fil de l’eau : le groupe WhatsApp de
                l’association
                <span className="sr-only"> (ouvre WhatsApp dans un nouvel onglet)</span>
              </a>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
