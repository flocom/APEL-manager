import {
  CalendarDays,
  HandHeart,
  ListChecks,
  MapPin,
  Plus,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import { TaskStatusSelect } from "@/components/task-status-select";
import {
  Badge,
  buttonClasses,
  Card,
  EmptyState,
  PageHeader,
  Stat,
} from "@/components/ui";
import { canManageEvents, requireUser } from "@/lib/auth/rbac";
import { getAllEvents, getSignupsForUser, getTasksForUser } from "@/lib/data";
import { formatDateTime, formatRelative, isOverdue } from "@/lib/dates";
import { EVENT_STATUS_COLORS, EVENT_STATUS_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const [events, myTasks, signups] = await Promise.all([
    getAllEvents(),
    getTasksForUser(user.id),
    getSignupsForUser(user.id),
  ]);

  const now = new Date();
  const upcoming = events
    .filter((e) => new Date(e.startAt) >= now)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const openTasks = myTasks.filter((t) => t.status !== "done");
  const overdueTasks = openTasks.filter((t) => isOverdue(t.dueAt));

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Bonjour ${user.name.split(" ")[0]} 👋`}
        description="Voici un aperçu de votre activité."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Événements à venir" value={upcoming.length} icon={CalendarDays} tone="brand" />
        <Stat label="Mes tâches en cours" value={openTasks.length} icon={ListChecks} tone="slate" />
        <Stat label="Mes tâches en retard" value={overdueTasks.length} icon={TriangleAlert} tone="red" />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Mes tâches</h2>
          <Link href="/dashboard/tasks" className="text-sm font-medium text-brand-600 hover:underline">
            Tout voir
          </Link>
        </div>
        {openTasks.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Aucune tâche en cours"
            description="Rien ne vous est assigné pour le moment. 🎉"
          />
        ) : (
          <Card className="divide-y divide-slate-100">
            {openTasks.slice(0, 5).map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{task.title}</p>
                  <p className="text-sm text-slate-500">
                    {task.event.title} ·{" "}
                    <span className={isOverdue(task.dueAt) ? "font-medium text-red-600" : ""}>
                      échéance {formatRelative(task.dueAt)}
                    </span>
                  </p>
                </div>
                <TaskStatusSelect taskId={task.id} status={task.status} />
              </div>
            ))}
          </Card>
        )}
      </section>

      {signups.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">
            Mes inscriptions bénévoles
          </h2>
          <Card className="divide-y divide-slate-100">
            {signups.map((s) => (
              <Link
                key={s.id}
                href={`/dashboard/events/${s.slot.eventId}`}
                className="flex items-center gap-3 p-4 hover:bg-slate-50"
              >
                <HandHeart className="h-5 w-5 shrink-0 text-brand-500" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {s.slot.title}
                  </p>
                  <p className="text-sm text-slate-500">
                    {s.slot.event.title} · {formatDateTime(s.slot.event.startAt)}
                  </p>
                </div>
              </Link>
            ))}
          </Card>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Prochains événements</h2>
          <div className="flex items-center gap-3">
            {canManageEvents(user) && (
              <Link href="/dashboard/events/new" className={buttonClasses("primary", "sm")}>
                <Plus className="h-4 w-4" />
                Nouvel événement
              </Link>
            )}
            <Link href="/dashboard/events" className="text-sm font-medium text-brand-600 hover:underline">
              Tout voir
            </Link>
          </div>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Aucun événement à venir" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {upcoming.slice(0, 4).map((event) => (
              <Link key={event.id} href={`/dashboard/events/${event.id}`}>
                <Card className="h-full p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-900">{event.title}</p>
                    <Badge color={EVENT_STATUS_COLORS[event.status]}>
                      {EVENT_STATUS_LABELS[event.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-brand-700">
                    <CalendarDays className="h-4 w-4" />
                    {formatDateTime(event.startAt)}
                  </p>
                  {event.location && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
                      <MapPin className="h-4 w-4" />
                      {event.location}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-500">
                    {event.tasks.length} tâche{event.tasks.length > 1 ? "s" : ""} ·{" "}
                    {event.volunteerSlots.length} créneau
                    {event.volunteerSlots.length > 1 ? "x" : ""} bénévoles
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
