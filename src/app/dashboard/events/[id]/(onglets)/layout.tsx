import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  MapPin,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/auto-refresh";
import { EventDeleteButton } from "@/components/event-delete-button";
import { EventDetailNav } from "@/components/event-detail-nav";
import { Badge, buttonClasses, Card } from "@/components/ui";
import { canManageEvents, requireUser } from "@/lib/auth/rbac";
import { getEventWithDetails, getMeetingAttendance } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { EVENT_STATUS_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

const eventStatusBadge = {
  draft: "amber",
  published: "blue",
  archived: "slate",
} as const;

/**
 * Le cadre commun à tous les onglets d'un événement : le retour, la barre
 * d'actions, l'en-tête, et les onglets eux-mêmes.
 *
 * Ce gabarit ne se remonte pas d'un onglet à l'autre — Next le conserve et ne
 * rejoue que la page enfant. L'en-tête ne clignote donc plus à chaque
 * bascule, ce que l'ancienne page, rendue en entier à chaque fois, faisait.
 *
 * Il vit dans un groupe de routes `(onglets)`, qui ne paraît pas dans l'URL :
 * `/dashboard/events/[id]/edit` reste ainsi en dehors et ne reçoit ni
 * en-tête ni onglets, ce qui n'aurait pas de sens sur un formulaire.
 *
 * `getEventWithDetails` est mis en cache par requête : l'appeler ici et dans
 * la page enfant ne fait qu'une lecture.
 */
export default async function EventDetailLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const [user, event] = await Promise.all([
    requireUser(),
    getEventWithDetails(id),
  ]);
  if (!event) notFound();

  const estReunion = event.kind === "meeting";
  const canManage = canManageEvents(user);
  const canSeeBudget = user.role === "admin";
  const totalSignups = event.volunteerSlots.reduce(
    (sum, s) => sum + s.signups.length,
    0,
  );
  const presents = estReunion
    ? (await getMeetingAttendance(event.id)).filter((r) => r.status === "yes")
        .length
    : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <AutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/events"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft className="h-4 w-4" />
          Tous les événements
        </Link>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/events/${event.id}/ics`}
            className={buttonClasses("outline", "sm")}
          >
            <CalendarPlus className="h-4 w-4" />
            Ajouter à l’agenda
          </a>
          {canManage && (
            <>
              <Link
                href={`/dashboard/events/${event.id}/edit`}
                className={buttonClasses("primary", "sm")}
              >
                <Pencil className="h-4 w-4" />
                Modifier
              </Link>
              {/* La suppression vivait au bas d'un onglet : on la cherchait
                  sans la trouver. Ici elle suit « Modifier » — les deux gestes
                  qui touchent l'événement lui-même sont au même endroit, sur
                  tous les onglets. Le dialogue de confirmation porte le poids
                  du geste, pas la barre. */}
              <EventDeleteButton
                eventId={event.id}
                eventTitle={event.title}
                taskCount={event.tasks.length}
                slotCount={event.volunteerSlots.length}
                signupCount={totalSignups}
              />
            </>
          )}
        </div>
      </div>

      <Card className="overflow-hidden !rounded-2xl !shadow-none">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="border-l-4 border-brand-600 p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                color={eventStatusBadge[event.status]}
                className="!rounded-md"
              >
                {EVENT_STATUS_LABELS[event.status]}
              </Badge>
              <span className="text-xs font-semibold text-slate-600">
                Fiche événement
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-3xl">
              {event.title}
            </h1>
            <div className="mt-4 flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:gap-x-5">
              <p className="inline-flex items-start gap-2 font-semibold text-slate-800">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <span>
                  {formatDateTime(event.startAt)}
                  {event.endAt && (
                    <>
                      <span className="mx-1 text-slate-400">→</span>
                      {formatDateTime(event.endAt)}
                    </>
                  )}
                </span>
              </p>
              {event.location && (
                <p className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-sea-700" />
                  {event.location}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center border-t border-slate-200 bg-slate-50 px-5 py-4 lg:w-56 lg:border-l lg:border-t-0">
            <p className="text-sm leading-6 text-slate-600">
              Utilisez les onglets ci-dessous pour avancer étape par étape,
              sans tout afficher en même temps.
            </p>
          </div>
        </div>
      </Card>

      <EventDetailNav
        eventId={event.id}
        taskCount={event.tasks.length}
        signupCount={estReunion ? presents : totalSignups}
        showBudget={canSeeBudget && !estReunion}
        isMeeting={estReunion}
      />

      {children}
    </div>
  );
}
