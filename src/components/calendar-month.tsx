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
  draft: "bg-amber-400",
  published: "bg-green-500",
  archived: "bg-slate-300",
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

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {MONTH_NAMES[month - 1]} {year}
        </h2>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={prev}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Mois précédent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setYear(initialYear);
              setMonth(initialMonth);
            }}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            Aujourd'hui
          </button>
          <button
            type="button"
            onClick={next}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Mois suivant"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-slate-100 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          if (!cell) {
            return <div key={`empty-${i}`} className="min-h-[88px] border-b border-r border-slate-100 bg-slate-50/40" />;
          }
          const dayEvents = byDay.get(cell.key) ?? [];
          const isToday = cell.key === todayKey;
          return (
            <div
              key={cell.key}
              className="min-h-[88px] border-b border-r border-slate-100 p-1.5 last:border-r-0"
            >
              <div
                className={cn(
                  "mb-1 grid h-6 w-6 place-items-center rounded-full text-xs font-medium",
                  isToday ? "bg-brand-600 text-white" : "text-slate-500",
                )}
              >
                {cell.day}
              </div>
              <div className="space-y-1">
                {dayEvents.map((e) => (
                  <Link
                    key={e.id}
                    href={`/dashboard/events/${e.id}`}
                    className="flex items-center gap-1 truncate rounded bg-slate-50 px-1.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                    title={e.title}
                  >
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDot[e.status])} />
                    <span className="truncate">{e.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
