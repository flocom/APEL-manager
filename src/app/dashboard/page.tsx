import Link from "next/link";

import { TaskStatusSelect } from "@/components/task-status-select";
import { Badge, buttonClasses, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth/rbac";
import { canManageEvents } from "@/lib/auth/rbac";
import { getAllEvents, getTasksForUser } from "@/lib/data";
import { formatDateTime, formatRelative, isOverdue } from "@/lib/dates";
import { EVENT_STATUS_COLORS, EVENT_STATUS_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <Card className="p-4">
      <p className={`text-3xl font-bold ${accent}`}>{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [events, myTasks] = await Promise.all([
    getAllEvents(),
    getTasksForUser(user.id),
  ]);

  const now = new Date();
  const upcoming = events
    .filter((e) => new Date(e.startAt) >= now)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const openTasks = myTasks.filter((t) => t.status !== "done");
  const overdueTasks = openTasks.filter((t) => isOverdue(t.dueAt));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Bonjour {user.name.split(" ")[0]} 👋
        </h1>
        <p className="text-slate-500">Voici un aperçu de votre activité.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Événements à venir" value={upcoming.length} accent="text-brand-600" />
        <Stat label="Mes tâches en cours" value={openTasks.length} accent="text-slate-800" />
        <Stat label="Mes tâches en retard" value={overdueTasks.length} accent="text-red-600" />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Mes tâches</h2>
          <Link href="/dashboard/tasks" className="text-sm text-brand-600 hover:underline">
            Tout voir
          </Link>
        </div>
        {openTasks.length === 0 ? (
          <Card className="p-6 text-sm text-slate-500">
            Aucune tâche ne vous est assignée pour le moment. 🎉
          </Card>
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

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Prochains événements</h2>
          <div className="flex items-center gap-3">
            {canManageEvents(user) && (
              <Link href="/dashboard/events/new" className={buttonClasses("primary", "sm")}>
                + Nouvel événement
              </Link>
            )}
            <Link href="/dashboard/events" className="text-sm text-brand-600 hover:underline">
              Tout voir
            </Link>
          </div>
        </div>
        {upcoming.length === 0 ? (
          <Card className="p-6 text-sm text-slate-500">Aucun événement à venir.</Card>
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
                  <p className="mt-1 text-sm text-brand-700">
                    {formatDateTime(event.startAt)}
                  </p>
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
