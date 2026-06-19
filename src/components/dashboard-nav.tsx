"use client";

import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  LogOut,
  type LucideIcon,
  PartyPopper,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { ROLE_LABELS } from "@/lib/auth/roles";
import { api } from "@/lib/client";
import type { Role } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  minRole?: Role;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/calendar", label: "Calendrier", icon: CalendarDays },
  { href: "/dashboard/events", label: "Événements", icon: PartyPopper },
  { href: "/dashboard/templates", label: "Modèles", icon: ClipboardList, minRole: "manager" },
  { href: "/dashboard/tasks", label: "Mes tâches", icon: ListChecks },
  { href: "/dashboard/members", label: "Membres", icon: Users, minRole: "admin" },
  { href: "/dashboard/account", label: "Mon compte", icon: Settings },
];

const roleRank: Record<Role, number> = { member: 1, manager: 2, admin: 3 };

export function DashboardNav({
  user,
}: {
  user: { name: string; role: Role };
}) {
  const pathname = usePathname();
  const router = useRouter();

  const items = NAV.filter(
    (item) => !item.minRole || roleRank[user.role] >= roleRank[item.minRole],
  );

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  async function logout() {
    await api("/api/auth/logout");
    router.push("/login");
    router.refresh();
  }

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="flex flex-col border-b border-slate-200 bg-white lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-2 px-5 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 font-bold text-white shadow-sm">
          A
        </span>
        <span className="text-lg font-semibold text-slate-900">APEL Manager</span>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-y-auto">
        {items.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3 border-t border-slate-200 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
          {initials || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">
            {user.name}
          </p>
          <p className="text-xs text-slate-400">{ROLE_LABELS[user.role]}</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600"
          aria-label="Se déconnecter"
          title="Se déconnecter"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
