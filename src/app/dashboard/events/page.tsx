import { fr } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  List,
  MapPin,
  PartyPopper,
  Plus,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import { CalendarMonth } from "@/components/calendar-month";
import { EventWorkspaceNav } from "@/components/event-workspace-nav";
import {
  Badge,
  buttonClasses,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { canManageEvents, requireUser } from "@/lib/auth/rbac";
import { getAllEvents } from "@/lib/data";
import { APP_TIMEZONE, isOverdue } from "@/lib/dates";
import { EVENT_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const eventStatusBadge = {
  draft: "amber",
  published: "blue",
  archived: "slate",
} as const;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string }>;
}) {
  const user = await requireUser();
  const events = await getAllEvents();
  const canManage = canManageEvents(user);
  const isCalendar = (await searchParams).vue === "calendrier";

  const now = new Date();
  const scheduledEvents = events.filter((event) => event.status !== "archived");
  const archived = events.filter((event) => event.status === "archived");
  const upcoming = scheduledEvents
    .filter((e) => new Date(e.startAt) >= now)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const past = scheduledEvents
    .filter((e) => new Date(e.startAt) < now)
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Événements"
        description="Planifiez, coordonnez et suivez tous les temps forts de l'APEL."
        icon={PartyPopper}
      >
        {canManage && (
          <Link href="/dashboard/events/new" className={buttonClasses()}>
            <Plus className="h-4 w-4" />
            Nouvel événement
          </Link>
        )}
      </PageHeader>

      {canManage && <EventWorkspaceNav active="events" />}

      {events.length === 0 ? (
        <EmptyState
          icon={PartyPopper}
          title="Aucun événement"
          description="Créez votre premier événement pour commencer à l'organiser."
          action={
            canManage ? (
              <Link href="/dashboard/events/new" className={buttonClasses("primary", "sm")}>
                <Plus className="h-4 w-4" />
                Nouvel événement
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">
                {upcoming.length} événement{upcoming.length > 1 ? "s" : ""} à
                venir
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Ouvrez un événement pour gérer sa préparation et ses bénévoles.
              </p>
            </div>
            <ViewToggle isCalendar={isCalendar} />
          </div>

          {isCalendar ? (
            <CalendarView events={scheduledEvents} />
          ) : (
            <>
              <Section title="À venir" events={upcoming} emptyLabel="Aucun événement à venir." />
              {past.length > 0 && (
                <CollapsedEvents title="Événements passés" events={past} />
              )}
              {archived.length > 0 && (
                <CollapsedEvents title="Événements archivés" events={archived} />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ViewToggle({ isCalendar }: { isCalendar: boolean }) {
  const base =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2";
  return (
    <div className="ml-auto inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
      <Link
        href="/dashboard/events"
        aria-current={!isCalendar ? "page" : undefined}
        className={cn(
          base,
          !isCalendar
            ? "bg-brand-600 text-white"
            : "text-slate-600 hover:bg-white hover:text-slate-950",
        )}
      >
        <List className="h-4 w-4" />
        Liste
      </Link>
      <Link
        href="/dashboard/events?vue=calendrier"
        aria-current={isCalendar ? "page" : undefined}
        className={cn(
          base,
          isCalendar
            ? "bg-brand-600 text-white"
            : "text-slate-600 hover:bg-white hover:text-slate-950",
        )}
      >
        <CalendarDays className="h-4 w-4" />
        Calendrier
      </Link>
    </div>
  );
}

function CalendarView({
  events,
}: {
  events: Awaited<ReturnType<typeof getAllEvents>>;
}) {
  const now = new Date();
  const calEvents = events.map((e) => ({
    id: e.id,
    title: e.title,
    status: e.status,
    day: formatInTimeZone(e.startAt, APP_TIMEZONE, "yyyy-MM-dd"),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-600" /> Publié
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-sand-700" /> Brouillon
        </span>
      </div>
      <CalendarMonth
        events={calEvents}
        initialYear={Number(formatInTimeZone(now, APP_TIMEZONE, "yyyy"))}
        initialMonth={Number(formatInTimeZone(now, APP_TIMEZONE, "M"))}
        todayKey={formatInTimeZone(now, APP_TIMEZONE, "yyyy-MM-dd")}
      />
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
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-slate-700">
          {title}
        </h2>
        <span className="h-0.5 flex-1 bg-slate-200" />
        <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-slate-100 px-2 text-xs font-bold text-slate-600">
          {events.length}
        </span>
      </div>
      {events.length === 0 ? (
        <Card className="!rounded-2xl !shadow-none p-7 text-sm text-slate-500">
          {emptyLabel}
        </Card>
      ) : (
        <EventRows events={events} dimmed={dimmed} />
      )}
    </section>
  );
}

function EventRows({
  events,
  dimmed = false,
}: {
  events: Awaited<ReturnType<typeof getAllEvents>>;
  dimmed?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="divide-y divide-slate-200">
        {events.map((event) => {
          const openTasks = event.tasks.filter((task) => task.status !== "done");
          const completedTasks = event.tasks.length - openTasks.length;
          const lateTasks = openTasks.filter((task) => isOverdue(task.dueAt));
          const progress =
            event.tasks.length > 0
              ? Math.round((completedTasks / event.tasks.length) * 100)
              : 0;

          return (
            <Link
              key={event.id}
              href={`/dashboard/events/${event.id}`}
              className={cn(
                "group grid min-h-28 grid-cols-[4.5rem_minmax(0,1fr)_auto] items-stretch gap-0 bg-white transition-colors hover:bg-brand-50/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:grid-cols-[5.25rem_minmax(0,1fr)_12rem_auto]",
                dimmed && "bg-slate-50/70",
              )}
            >
              <div
                className={cn(
                  "flex flex-col items-center justify-center border-r border-slate-200 px-2 text-center",
                  dimmed ? "bg-slate-100" : "bg-brand-50",
                )}
              >
                <span className="text-2xl font-black leading-none text-brand-950">
                  {formatInTimeZone(event.startAt, APP_TIMEZONE, "dd")}
                </span>
                <span className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-brand-700">
                  {formatInTimeZone(event.startAt, APP_TIMEZONE, "MMM", {
                    locale: fr,
                  })}
                </span>
                <span className="mt-0.5 text-xs font-medium text-slate-500">
                  {formatInTimeZone(event.startAt, APP_TIMEZONE, "yyyy")}
                </span>
              </div>

              <div className="min-w-0 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 truncate font-bold tracking-tight text-slate-950 transition-colors group-hover:text-brand-700">
                    {event.title}
                  </h3>
                  <Badge
                    color={eventStatusBadge[event.status]}
                    className="!rounded-md"
                  >
                    {EVENT_STATUS_LABELS[event.status]}
                  </Badge>
                  {lateTasks.length > 0 && (
                    <span className="rounded-md bg-coral-50 px-2 py-1 text-[11px] font-bold text-coral-800">
                      {lateTasks.length} à traiter
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatInTimeZone(
                      event.startAt,
                      APP_TIMEZONE,
                      "HH'h'mm",
                    )}
                  </span>
                  {event.location && (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{event.location}</span>
                    </span>
                  )}
                </div>
                <div className="mt-3 sm:hidden">
                  <EventProgress
                    completed={completedTasks}
                    total={event.tasks.length}
                    progress={progress}
                  />
                </div>
              </div>

              <div className="hidden border-l border-slate-100 px-4 py-4 sm:flex sm:flex-col sm:justify-center">
                <EventProgress
                  completed={completedTasks}
                  total={event.tasks.length}
                  progress={progress}
                />
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <UsersRound className="h-3.5 w-3.5" />
                  {event.volunteerSlots.length} créneau
                  {event.volunteerSlots.length > 1 ? "x" : ""}
                </p>
              </div>

              <div className="grid w-11 place-items-center text-slate-400 transition-colors group-hover:text-brand-700">
                <ChevronRight className="h-5 w-5" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function EventProgress({
  completed,
  total,
  progress,
}: {
  completed: number;
  total: number;
  progress: number;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
        <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" />
        {total === 0 ? "Préparation à définir" : `${completed}/${total} tâches`}
      </p>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-label="Avancement de la préparation"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span
          className="block h-full rounded-full bg-brand-600"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function CollapsedEvents({
  title,
  events,
}: {
  title: string;
  events: Awaited<ReturnType<typeof getAllEvents>>;
}) {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-sm font-bold text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500">
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        {title}
        <span className="ml-auto rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
          {events.length}
        </span>
      </summary>
      <div className="border-t border-slate-200 p-3">
        <EventRows events={events} dimmed />
      </div>
    </details>
  );
}
