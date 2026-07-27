import { CalendarDays, ClipboardList } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export type EventWorkspaceTab = "events" | "templates";

const tabs = [
  {
    id: "events",
    href: "/dashboard/events",
    label: "Planning",
    icon: CalendarDays,
  },
  {
    id: "templates",
    href: "/dashboard/events/templates",
    label: "Modèles de préparation",
    icon: ClipboardList,
  },
] as const;

export function EventWorkspaceNav({
  active,
}: {
  active: EventWorkspaceTab;
}) {
  return (
    <nav
      aria-label="Navigation de l’espace événements"
      className="flex w-full rounded-2xl border border-slate-200 bg-slate-100 p-1 sm:w-fit"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;

        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:flex-none",
              isActive
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:bg-white hover:text-slate-950",
            )}
          >
            <span
              className={cn(
                "grid h-7 w-7 place-items-center rounded-lg",
                isActive ? "bg-white/15" : "bg-white text-slate-500",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
