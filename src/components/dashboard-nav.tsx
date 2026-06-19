"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { ROLE_LABELS } from "@/lib/auth/roles";
import { api } from "@/lib/client";
import type { Role } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  minRole?: Role;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", exact: true },
  { href: "/dashboard/events", label: "Événements" },
  { href: "/dashboard/tasks", label: "Mes tâches" },
  { href: "/dashboard/members", label: "Membres", minRole: "admin" },
  { href: "/dashboard/account", label: "Mon compte" },
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

  return (
    <aside className="flex flex-col border-b border-slate-200 bg-white lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-2 px-5 py-4">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 font-semibold text-white">
          A
        </span>
        <span className="font-semibold text-slate-900">APEL Manager</span>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive(item)
                ? "bg-brand-50 text-brand-700"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-slate-200 px-4 py-3">
        <p className="truncate text-sm font-medium text-slate-900">
          {user.name}
        </p>
        <p className="text-xs text-slate-400">{ROLE_LABELS[user.role]}</p>
        <button
          type="button"
          onClick={logout}
          className="mt-2 text-sm font-medium text-slate-500 hover:text-red-600"
        >
          Se déconnecter
        </button>
      </div>
    </aside>
  );
}
