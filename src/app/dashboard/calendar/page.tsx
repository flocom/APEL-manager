import { formatInTimeZone } from "date-fns-tz";
import { CalendarDays } from "lucide-react";

import { CalendarMonth } from "@/components/calendar-month";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/rbac";
import { getAllEvents } from "@/lib/data";
import { APP_TIMEZONE } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  await requireUser();
  const events = await getAllEvents();
  const now = new Date();

  const initialYear = Number(formatInTimeZone(now, APP_TIMEZONE, "yyyy"));
  const initialMonth = Number(formatInTimeZone(now, APP_TIMEZONE, "M"));
  const todayKey = formatInTimeZone(now, APP_TIMEZONE, "yyyy-MM-dd");

  const calEvents = events.map((e) => ({
    id: e.id,
    title: e.title,
    status: e.status,
    day: formatInTimeZone(e.startAt, APP_TIMEZONE, "yyyy-MM-dd"),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendrier"
        description="Tous les événements de l'APEL, mois par mois."
        icon={CalendarDays}
      />
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500" /> Publié
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400" /> Brouillon
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-slate-300" /> Archivé
        </span>
      </div>
      <CalendarMonth
        events={calEvents}
        initialYear={initialYear}
        initialMonth={initialMonth}
        todayKey={todayKey}
      />
    </div>
  );
}
