"use client";

import {
  Landmark,
  LayoutDashboard,
  ListChecks,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * La barre d'onglets d'un événement.
 *
 * Composant client parce qu'elle doit savoir où l'on est, et que le gabarit
 * qui la porte est un composant serveur : lire l'URL est le seul moyen fiable
 * de désigner l'onglet actif sans le faire transiter par chaque page.
 */
export function EventDetailNav({
  eventId,
  taskCount,
  signupCount,
  showBudget,
  isMeeting = false,
}: {
  eventId: string;
  taskCount: number;
  signupCount: number;
  showBudget: boolean;
  /** Une réunion compte des présences là où un événement compte des bénévoles. */
  isMeeting?: boolean;
}) {
  // L'onglet actif se lit dans l'URL : c'est elle qui fait foi, et non un
  // paramètre que chaque page devrait penser à transmettre correctement.
  const pathname = usePathname();
  const segment = pathname.replace(`/dashboard/events/${eventId}`, "").split("/")[1] ?? "";
  const active = segment || "apercu";

  const tabs = [
    {
      id: "apercu",
      label: "Aperçu",
      href: `/dashboard/events/${eventId}`,
      icon: LayoutDashboard,
    },
    {
      id: "preparation",
      label: "Préparation",
      href: `/dashboard/events/${eventId}/preparation`,
      icon: ListChecks,
      count: taskCount,
    },
    isMeeting
      ? ({
          id: "presences",
          label: "Présences",
          href: `/dashboard/events/${eventId}/presences`,
          icon: UsersRound,
          count: signupCount,
        } as const)
      : ({
          id: "benevoles",
          label: "Bénévoles",
          href: `/dashboard/events/${eventId}/benevoles`,
          icon: UsersRound,
          count: signupCount,
        } as const),
    ...(showBudget
      ? ([
          {
            id: "budget",
            label: "Budget",
            href: `/dashboard/events/${eventId}/budget`,
            icon: Landmark,
          },
        ] as const)
      : []),
  ] as const;

  return (
    // Deux colonnes sur téléphone, une seule rangée à partir de sm : à quatre
    // colonnes sur 390 px, chaque onglet disposait de 85 px pour un intitulé,
    // une icône et un compteur, et les trois se chevauchaient.
    <nav
      aria-label="Sections de l’événement"
      className={cn(
        "grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1.5",
        showBudget ? "sm:grid-cols-4" : "sm:grid-cols-3",
      )}
    >
      {tabs.map((tab, index) => {
        const Icon = tab.icon;
        const selected = tab.id === active;
        // Un nombre impair d'onglets laisse le dernier seul sur sa rangée :
        // il prend alors toute la largeur plutôt que la moitié.
        const seulSurSaRangee =
          tabs.length % 2 === 1 && index === tabs.length - 1;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-1.5 py-2 font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:gap-2 sm:px-4",
              seulSurSaRangee && "col-span-2 sm:col-span-1",
              selected
                ? "bg-white text-brand-800 shadow-sm"
                : "text-slate-600 hover:bg-white/70 hover:text-slate-950",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate text-center text-xs leading-tight sm:text-sm">
              {tab.label}
            </span>
            {"count" in tab && (
              <span
                className={cn(
                  "grid min-w-6 shrink-0 place-items-center rounded-md px-1.5 py-0.5 text-[11px]",
                  selected
                    ? "bg-brand-100 text-brand-800"
                    : "bg-white text-slate-500",
                )}
              >
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
