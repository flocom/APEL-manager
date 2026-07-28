import {
  ArrowRight,
  CalendarDays,
  HandHeart,
  ListChecks,
  MapPin,
  Plus,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { TaskStatusSelect } from "@/components/task-status-select";
import { Badge } from "@/components/ui";
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
    .filter((event) => new Date(event.startAt) >= now)
    .sort(
      (a, b) =>
        new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
  const openTasks = myTasks.filter((task) => task.status !== "done");
  const overdueTasks = openTasks.filter((task) => isOverdue(task.dueAt));

  return (
    <div className="space-y-9">
      <section className="overflow-hidden rounded-2xl border border-brand-900 bg-brand-950 text-white">
        <div className="h-1.5 bg-sea-500" aria-hidden />
        <div className="flex flex-wrap items-end justify-between gap-6 px-6 py-7 sm:px-8 sm:py-8">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-brand-200">
              <span
                className="h-2.5 w-2.5 rounded-sm bg-sea-200"
                aria-hidden
              />
              Tableau de bord
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] sm:text-4xl">
              Bonjour {user.name.split(" ")[0]}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-100 sm:text-base">
              Vos événements, vos tâches et les besoins bénévoles réunis dans
              un espace clair.
            </p>
          </div>
          {canManageEvents(user) && (
            <Link
              href="/dashboard/events/new"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brand-100 bg-brand-100 px-4 py-2.5 text-sm font-bold text-brand-950 transition-colors hover:border-sea-200 hover:bg-sea-200 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-950"
            >
              <Plus className="h-4 w-4 text-brand-700" />
              Créer un événement
            </Link>
          )}
        </div>
      </section>

      <section aria-label="Indicateurs clés">
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          <FlatStat
            label="Événements à venir"
            helper="Dans votre agenda"
            value={upcoming.length}
            icon={CalendarDays}
            tone="brand"
          />
          <FlatStat
            label="Tâches en cours"
            helper="À suivre"
            value={openTasks.length}
            icon={ListChecks}
            tone="navy"
          />
          <FlatStat
            label="À traiter maintenant"
            helper={
              overdueTasks.length > 0
                ? "Action requise"
                : "Tout est à jour"
            }
            value={overdueTasks.length}
            icon={TriangleAlert}
            tone={overdueTasks.length > 0 ? "overdue" : "neutral"}
            className="sm:col-span-2 md:col-span-1"
          />
        </div>
      </section>

      <div className="grid items-start gap-8 lg:grid-cols-[1.08fr_.92fr]">
        <section>
          <SectionTitle
            eyebrow="Priorités"
            title="Mes tâches"
            href="/dashboard/tasks"
            accent="sea"
          />
          {openTasks.length === 0 ? (
            <FlatEmpty
              icon={ListChecks}
              title="Aucune tâche en cours"
              description="Votre liste est à jour. Vous êtes prêt pour la suite."
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {openTasks.slice(0, 5).map((task) => {
                const overdue = isOverdue(task.dueAt);
                return (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-3 border-b border-slate-200 p-4 transition-colors last:border-b-0 hover:bg-slate-50 sm:p-5"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-bold text-slate-950">
                        {task.title}
                      </p>
                      <p className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                        <span className="min-w-0 break-words">
                          {task.event.title}
                        </span>
                        <span aria-hidden>·</span>
                        <span
                          className={
                            overdue
                              ? "shrink-0 font-bold text-coral-700"
                              : "shrink-0"
                          }
                        >
                          {overdue ? "À traiter " : "Démarre "}
                          {formatRelative(task.dueAt)}
                        </span>
                      </p>
                    </div>
                    <TaskStatusSelect taskId={task.id} status={task.status} />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <SectionTitle
            eyebrow="Agenda"
            title="Prochains événements"
            href="/dashboard/events"
            accent="brand"
          />
          {upcoming.length === 0 ? (
            <FlatEmpty
              icon={CalendarDays}
              title="Aucun événement à venir"
              description="Les prochains rendez-vous apparaîtront ici."
            />
          ) : (
            <div className="grid gap-3">
              {upcoming.slice(0, 3).map((event) => (
                <Link
                  key={event.id}
                  href={`/dashboard/events/${event.id}`}
                  className="group block rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-bold leading-snug text-slate-950 group-hover:text-brand-800">
                      {event.title}
                    </p>
                    <Badge color={EVENT_STATUS_COLORS[event.status]}>
                      {EVENT_STATUS_LABELS[event.status]}
                    </Badge>
                  </div>
                  <p className="mt-3 flex items-center gap-2 text-sm font-bold text-brand-700">
                    <CalendarDays className="h-4 w-4" />
                    {formatDateTime(event.startAt)}
                  </p>
                  {event.location && (
                    <p className="mt-1.5 flex items-center gap-2 text-sm text-slate-500">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 break-words">
                        {event.location}
                      </span>
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {signups.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-sea-200 text-brand-950">
              <HandHeart className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">
                Engagement
              </p>
              <h2 className="mt-0.5 text-xl font-extrabold tracking-tight text-slate-950">
                Mes inscriptions bénévoles
              </h2>
            </div>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2">
            {signups.map((signup) => (
              <Link
                key={signup.id}
                href={`/dashboard/events/${signup.slot.eventId}`}
                className="group flex items-center gap-3 bg-white p-5 transition-colors hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
                  <HandHeart className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-bold text-slate-950">
                    {signup.slot.title}
                  </p>
                  <p className="mt-1 break-words text-sm text-slate-500">
                    {signup.slot.event.title} ·{" "}
                    {formatDateTime(signup.slot.event.startAt)}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-sea-500" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const statTones = {
  brand: {
    card: "border-brand-200 bg-brand-50",
    accent: "bg-brand-500",
    icon: "bg-brand-700 text-white",
    value: "text-brand-950",
    label: "text-brand-950",
    helper: "border-brand-200 bg-white text-brand-800",
  },
  navy: {
    card: "border-brand-900 bg-brand-950",
    accent: "bg-sea-400",
    icon: "bg-sea-200 text-brand-950",
    value: "text-white",
    label: "text-brand-100",
    helper: "border-brand-700 bg-brand-900 text-brand-100",
  },
  overdue: {
    card: "border-coral-300 bg-coral-50",
    accent: "bg-coral-600",
    icon: "bg-coral-700 text-white",
    value: "text-coral-900",
    label: "text-coral-900",
    helper: "border-coral-200 bg-white text-coral-800",
  },
  neutral: {
    card: "border-slate-200 bg-white",
    accent: "bg-slate-300",
    icon: "bg-slate-100 text-slate-600",
    value: "text-slate-950",
    label: "text-slate-800",
    helper: "border-slate-200 bg-slate-50 text-slate-600",
  },
} as const;

function FlatStat({
  label,
  helper,
  value,
  icon: Icon,
  tone,
  className = "",
}: {
  label: string;
  helper: string;
  value: number;
  icon: LucideIcon;
  tone: keyof typeof statTones;
  className?: string;
}) {
  const colors = statTones[tone];

  return (
    <div
      className={`relative min-h-36 overflow-hidden rounded-2xl border p-4 sm:p-5 ${colors.card} ${className}`}
    >
      <span
        className={`absolute inset-x-0 top-0 h-1 ${colors.accent}`}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3 pt-1">
        <span
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${colors.icon}`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span
          className={`max-w-[11rem] rounded-full border px-2.5 py-1 text-right text-[11px] font-bold leading-4 ${colors.helper}`}
        >
          {helper}
        </span>
      </div>
      <div className="mt-5 flex items-end gap-3">
        <p
          className={`shrink-0 text-4xl font-black leading-none tracking-[-0.055em] ${colors.value}`}
        >
          {value}
        </p>
        <p
          className={`min-w-0 break-words pb-0.5 text-sm font-extrabold leading-tight sm:text-[15px] ${colors.label}`}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

function FlatEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-9 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand-700">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 font-bold text-slate-950">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  href,
  accent,
}: {
  eyebrow: string;
  title: string;
  href: string;
  accent: "brand" | "sea";
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="flex items-stretch gap-3">
        <span
          className={`w-1 rounded-full ${
            accent === "brand" ? "bg-brand-600" : "bg-sea-500"
          }`}
          aria-hidden
        />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">
            {eyebrow}
          </p>
          <h2 className="mt-0.5 text-xl font-extrabold tracking-tight text-slate-950">
            {title}
          </h2>
        </div>
      </div>
      <Link
        href={href}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-bold text-brand-700 transition-colors hover:bg-brand-100 hover:text-brand-900 focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        Tout voir <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
