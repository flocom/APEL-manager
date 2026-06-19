import Link from "next/link";

import { Badge, buttonClasses, Card } from "@/components/ui";
import { canManageEvents, requireUser } from "@/lib/auth/rbac";
import { getAllEvents } from "@/lib/data";
import { formatDateTime, isOverdue } from "@/lib/dates";
import { EVENT_STATUS_COLORS, EVENT_STATUS_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const user = await requireUser();
  const events = await getAllEvents();
  const canManage = canManageEvents(user);

  const now = new Date();
  const upcoming = events
    .filter((e) => new Date(e.startAt) >= now)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const past = events
    .filter((e) => new Date(e.startAt) < now)
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Événements</h1>
          <p className="text-slate-500">Gérez l'agenda de l'APEL.</p>
        </div>
        {canManage && (
          <Link href="/dashboard/events/new" className={buttonClasses()}>
            + Nouvel événement
          </Link>
        )}
      </div>

      {events.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">
          Aucun événement.{" "}
          {canManage && (
            <Link href="/dashboard/events/new" className="text-brand-600 hover:underline">
              Créer le premier
            </Link>
          )}
        </Card>
      ) : (
        <>
          <Section title="À venir" events={upcoming} emptyLabel="Aucun événement à venir." />
          {past.length > 0 && (
            <Section title="Passés" events={past} emptyLabel="" dimmed />
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  events,
  emptyLabel,
  dimmed = false,
}: {
  title: string;
  events: Awaited<ReturnType<typeof getAllEvents>>;
  emptyLabel: string;
  dimmed?: boolean;
}) {
  if (events.length === 0 && !emptyLabel) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      {events.length === 0 ? (
        <Card className="p-6 text-sm text-slate-500">{emptyLabel}</Card>
      ) : (
        <div className={`grid gap-3 sm:grid-cols-2 ${dimmed ? "opacity-80" : ""}`}>
          {events.map((event) => {
            const openTasks = event.tasks.filter((t) => t.status !== "done");
            const lateTasks = openTasks.filter((t) => isOverdue(t.dueAt));
            return (
              <Link key={event.id} href={`/dashboard/events/${event.id}`}>
                <Card className="h-full p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-900">{event.title}</p>
                    <Badge color={EVENT_STATUS_COLORS[event.status]}>
                      {EVENT_STATUS_LABELS[event.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-brand-700">
                    {formatDateTime(event.startAt)}
                  </p>
                  {event.location && (
                    <p className="text-sm text-slate-500">📍 {event.location}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Badge color="slate">
                      {event.tasks.length} tâche{event.tasks.length > 1 ? "s" : ""}
                    </Badge>
                    {lateTasks.length > 0 && (
                      <Badge color="red">
                        {lateTasks.length} en retard
                      </Badge>
                    )}
                    <Badge color="blue">
                      {event.volunteerSlots.length} créneau
                      {event.volunteerSlots.length > 1 ? "x" : ""} bénévoles
                    </Badge>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
