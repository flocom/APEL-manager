"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { EventStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export interface CalendarEvent {
  id: string;
  title: string;
  status: EventStatus;
  /** Jour de l'événement en heure de Paris, format "yyyy-MM-dd". */
  day: string;
}

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const statusDot: Record<EventStatus, string> = {
  draft: "bg-sand-700",
  published: "bg-brand-600",
  archived: "bg-slate-400",
};

const statusCard: Record<EventStatus, string> = {
  draft:
    "border-sand-200 bg-sand-50 text-slate-700 hover:border-sand-300 hover:bg-slate-50",
  published:
    "border-brand-200 bg-brand-50 text-brand-900 hover:border-brand-400 hover:bg-brand-100",
  archived:
    "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100",
};

const statusLabel: Record<EventStatus, string> = {
  draft: "Brouillon",
  published: "Publié",
  archived: "Archivé",
};

export function CalendarMonth({
  events,
  initialYear,
  initialMonth,
  todayKey,
}: {
  events: CalendarEvent[];
  initialYear: number;
  initialMonth: number; // 1-12
  todayKey: string;
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);

  function prev() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  }
  function next() {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  }

  // Construction de la grille (arithmétique de dates, indépendante du fuseau).
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7; // lundi = 0
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: ({ day: number; key: string } | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, key });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const list = byDay.get(e.day) ?? [];
    list.push(e);
    byDay.set(e.day, list);
  }
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}-`;
  const monthEvents = events
    .filter((event) => event.day.startsWith(monthPrefix))
    .sort((left, right) => left.day.localeCompare(right.day));

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-brand-200 bg-brand-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <h2 className="text-lg font-bold tracking-tight text-slate-950">
          {MONTH_NAMES[month - 1]} {year}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={prev}
            className="grid h-10 w-10 place-items-center rounded-xl border border-brand-200 bg-white text-slate-700 transition-colors hover:border-brand-400 hover:bg-brand-100 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label="Mois précédent"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setYear(initialYear);
              setMonth(initialMonth);
            }}
            className="min-h-10 flex-1 rounded-xl border border-brand-200 bg-white px-3.5 py-2 text-sm font-bold text-brand-700 transition-colors hover:border-brand-400 hover:bg-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:flex-none"
          >
            Aujourd'hui
          </button>
          <button
            type="button"
            onClick={next}
            className="grid h-10 w-10 place-items-center rounded-xl border border-brand-200 bg-white text-slate-700 transition-colors hover:border-brand-400 hover:bg-brand-100 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label="Mois suivant"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <p id="calendar-scroll-hint" className="sr-only">
        Le calendrier peut défiler horizontalement sur les petits écrans.
      </p>
      <div className="divide-y divide-slate-200 sm:hidden">
        {monthEvents.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            Aucun événement ce mois-ci.
          </p>
        ) : (
          monthEvents.map((event) => {
            const eventDate = new Date(`${event.day}T12:00:00`);
            return (
              <Link
                key={event.id}
                href={`/dashboard/events/${event.id}`}
                className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-lg font-black text-brand-800">
                  {eventDate.getDate()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-bold text-slate-900">
                    {event.title}
                  </span>
                  <span className="mt-0.5 block text-xs capitalize text-slate-500">
                    {eventDate.toLocaleDateString("fr-FR", {
                      weekday: "long",
                    })}{" "}
                    · {statusLabel[event.status]}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-sm",
                    statusDot[event.status],
                  )}
                />
              </Link>
            );
          })
        )}
      </div>
      <div
        role="region"
        aria-label={`Calendrier de ${MONTH_NAMES[month - 1]} ${year}`}
        aria-describedby="calendar-scroll-hint"
        tabIndex={0}
        className="hidden overflow-x-auto overscroll-x-contain focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:block"
      >
        <div className="min-w-[44rem]">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100 text-center text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2.5">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((cell, i) => {
              if (!cell) {
                return (
                  <div
                    key={`empty-${i}`}
                    aria-hidden="true"
                    className="min-h-[108px] border-b border-r border-slate-200 bg-slate-50"
                  />
                );
              }
              const dayEvents = byDay.get(cell.key) ?? [];
              const isToday = cell.key === todayKey;
              return (
                <div
                  key={cell.key}
                  className="min-h-[108px] border-b border-r border-slate-200 bg-white p-2 transition-colors hover:bg-slate-50"
                >
                  <div
                    aria-current={isToday ? "date" : undefined}
                    className={cn(
                      "mb-1.5 grid h-7 w-7 place-items-center rounded-lg text-xs font-bold",
                      isToday
                        ? "bg-brand-600 text-white"
                        : "text-slate-600",
                    )}
                  >
                    {cell.day}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.map((e) => (
                      <Link
                        key={e.id}
                        href={`/dashboard/events/${e.id}`}
                        aria-label={`${e.title} — ${statusLabel[e.status]}`}
                        className={cn(
                          "flex items-start gap-1.5 whitespace-normal break-words rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                          statusCard[e.status],
                        )}
                        title={e.title}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-1 h-2 w-2 shrink-0 rounded-sm",
                            statusDot[e.status],
                          )}
                        />
                        <span className="min-w-0 break-words">{e.title}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
