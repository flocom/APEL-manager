import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { Badge, buttonClasses, Card } from "@/components/ui";
import { getUpcomingPublishedEvents } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const events = await getUpcomingPublishedEvents();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="border-b border-slate-200 bg-gradient-to-b from-brand-50 to-slate-50">
          <div className="mx-auto max-w-5xl px-4 py-14 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Les événements de l'APEL
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-slate-600">
              Vide-greniers, kermesse, journée du Père Noël, ventes… Retrouvez
              ici tous nos prochains rendez-vous et donnez un coup de main en
              devenant bénévole.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-10">
          <h2 className="mb-5 text-xl font-semibold text-slate-900">
            Prochains événements
          </h2>

          {events.length === 0 ? (
            <Card className="p-8 text-center text-slate-500">
              Aucun événement à venir pour le moment. Revenez bientôt !
            </Card>
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
                  <Card key={event.id} className="flex flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-semibold text-slate-900">
                        {event.title}
                      </h3>
                      {remaining > 0 && (
                        <Badge color="amber">
                          {remaining} bénévole{remaining > 1 ? "s" : ""} recherché
                          {remaining > 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-medium text-brand-700">
                      {formatDateTime(event.startAt)}
                    </p>
                    {event.location && (
                      <p className="mt-0.5 text-sm text-slate-500">
                        📍 {event.location}
                      </p>
                    )}
                    {event.description && (
                      <p className="mt-3 line-clamp-3 text-sm text-slate-600">
                        {event.description}
                      </p>
                    )}
                    {event.volunteerSlots.length > 0 && (
                      <div className="mt-4 pt-1">
                        <Link
                          href={`/inscription/${event.shareToken}`}
                          className={buttonClasses("primary", "sm")}
                        >
                          S'inscrire comme bénévole
                        </Link>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-400">
        APEL Manager — espace de gestion de l'association des parents d'élèves.
      </footer>
    </div>
  );
}
