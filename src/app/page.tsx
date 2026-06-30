import { ArrowRight, CalendarDays, Hand, MapPin } from "lucide-react";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { Badge, buttonClasses, Card, EmptyState } from "@/components/ui";
import { Waves } from "@/components/waves";
import { APP_NAME, SCHOOL_NAME } from "@/lib/app-config";
import { getUpcomingPublishedEvents } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const events = await getUpcomingPublishedEvents();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden bg-gradient-to-b from-brand-100 via-sea-100/70 to-sea-50">
          {/* Décor flottant (caché sur petits écrans) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 hidden select-none sm:block"
          >
            <span className="absolute left-[8%] top-12 animate-float text-4xl">🐚</span>
            <span className="absolute right-[10%] top-16 animate-float text-5xl [animation-delay:1s]">
              ⛵
            </span>
            <span className="absolute bottom-28 left-[14%] animate-float text-3xl [animation-delay:2s]">
              ⚓
            </span>
            <span className="absolute bottom-24 right-[16%] animate-float text-4xl [animation-delay:.5s]">
              🌊
            </span>
          </div>

          <div className="relative mx-auto max-w-5xl px-4 pb-24 pt-16 text-center">
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-brand-700 shadow-sm ring-1 ring-white/60 backdrop-blur">
              🌊 APEL · {SCHOOL_NAME}
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Les rendez-vous de l&apos;APEL
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-slate-700 sm:text-lg">
              Vide-greniers, kermesse, journée du Père Noël, ventes… Retrouvez
              tous nos prochains rendez-vous et donnez un coup de main en
              devenant bénévole. Toute aide compte&nbsp;! ⚓
            </p>
            <div className="mt-7 flex justify-center gap-3">
              <a href="#evenements" className={buttonClasses("primary", "md")}>
                Voir les événements
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          <Waves className="absolute inset-x-0 bottom-0 h-10 w-full text-white sm:h-14" />
        </section>

        <section
          id="evenements"
          className="mx-auto max-w-5xl scroll-mt-20 bg-white px-4 py-12"
        >
          <h2 className="mb-6 flex items-center gap-2 text-xl font-bold text-slate-900">
            <span className="text-2xl">📅</span> Prochains événements
          </h2>

          {events.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Aucun événement à venir"
              description="Revenez bientôt, de nouveaux rendez-vous seront publiés ici. 🐚"
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {events.map((event) => {
                const capacity = event.volunteerSlots.reduce(
                  (sum, s) => sum + s.capacity,
                  0,
                );
                const taken = event.volunteerSlots.reduce(
                  (sum, s) => sum + s.signups.length,
                  0,
                );
                const remaining = capacity - taken;

                return (
                  <Link
                    key={event.id}
                    href={`/inscription/${event.shareToken}`}
                    className="group"
                  >
                    <Card className="flex h-full flex-col p-5 transition-all duration-150 hover:-translate-y-1 hover:shadow-buoy">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-lg font-semibold text-slate-900">
                          {event.title}
                        </h3>
                        {remaining > 0 && (
                          <Badge color="coral" icon={Hand}>
                            {remaining} place{remaining > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-brand-700">
                        <CalendarDays className="h-4 w-4" />
                        {formatDateTime(event.startAt)}
                      </p>
                      {event.location && (
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                          <MapPin className="h-4 w-4" />
                          {event.location}
                        </p>
                      )}
                      {event.description && (
                        <p className="mt-3 line-clamp-3 text-sm text-slate-600">
                          {event.description}
                        </p>
                      )}
                      <div className="mt-4 flex items-center gap-1 pt-1 text-sm font-semibold text-brand-600 transition-all group-hover:gap-2">
                        {remaining > 0
                          ? "Voir & se proposer"
                          : "Voir l'événement"}
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <footer className="relative mt-8 border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-500">
        <p>
          {APP_NAME} — avec le cœur, pour nos enfants. 💙
        </p>
        <Link href="/confidentialite" className="mt-1 inline-block hover:underline">
          Politique de confidentialité
        </Link>
      </footer>
    </div>
  );
}
