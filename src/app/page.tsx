import { ArrowRight, CalendarDays, MapPin, PartyPopper, Sparkles } from "lucide-react";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { Badge, buttonClasses, Card, EmptyState } from "@/components/ui";
import { APP_NAME } from "@/lib/app-config";
import { getUpcomingPublishedEvents } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const events = await getUpcomingPublishedEvents();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="border-b border-slate-200 bg-gradient-to-b from-brand-50 via-brand-50/40 to-slate-50">
          <div className="mx-auto max-w-5xl px-4 py-16 text-center">
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-brand-700 shadow-sm ring-1 ring-brand-100">
              <Sparkles className="h-3.5 w-3.5" />
              Association de parents d'élèves
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Les événements de l'APEL
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">
              Vide-greniers, kermesse, journée du Père Noël, ventes… Retrouvez
              tous nos prochains rendez-vous et donnez un coup de main en
              devenant bénévole.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <a href="#evenements" className={buttonClasses("primary", "md")}>
                Voir les événements
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>

        <section id="evenements" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-12">
          <h2 className="mb-6 text-xl font-semibold text-slate-900">
            Prochains événements
          </h2>

          {events.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Aucun événement à venir"
              description="Revenez bientôt, de nouveaux rendez-vous seront publiés ici."
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
                    <Card className="flex h-full flex-col p-5 transition-shadow hover:shadow-md">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-lg font-semibold text-slate-900">
                          {event.title}
                        </h3>
                        {remaining > 0 && (
                          <Badge color="amber" icon={PartyPopper}>
                            {remaining} bénévole{remaining > 1 ? "s" : ""}
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
                      <div className="mt-4 flex items-center gap-1 pt-1 text-sm font-medium text-brand-600 transition-all group-hover:gap-2">
                        {remaining > 0
                          ? "Voir l'événement & se proposer"
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

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-500">
        <p>{APP_NAME} — association de parents d'élèves.</p>
        <Link href="/confidentialite" className="mt-1 inline-block hover:underline">
          Politique de confidentialité
        </Link>
      </footer>
    </div>
  );
}
