"use client";

import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  LogOut,
  type LucideIcon,
  Menu,
  PartyPopper,
  Settings,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { APP_INITIAL, APP_NAME } from "@/lib/app-config";
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

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 font-bold text-white shadow-sm">
        {APP_INITIAL}
      </span>
      <span className="text-lg font-semibold text-slate-900">{APP_NAME}</span>
    </Link>
  );
}

export function DashboardNav({
  user,
}: {
  user: { name: string; role: Role };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  // Fermer le tiroir à la navigation.
  useEffect(() => setOpen(false), [pathname]);

  // Quand le tiroir est ouvert : focus à l'intérieur, scroll bloqué, Échap pour
  // fermer, et piège de focus (Tab cycle dans le tiroir).
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      panelRef.current
        ? Array.from(
            panelRef.current.querySelectorAll<HTMLElement>(
              "a[href], button:not([disabled])",
            ),
          )
        : [];
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "Tab") {
        const els = focusables();
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

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

  const navLinks = (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(item);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
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
  );

  const userFooter = (
    <div className="flex items-center gap-3 border-t border-slate-200 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
        {initials || "?"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
        <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
      </div>
      <button
        type="button"
        onClick={logout}
        className="shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-red-600"
        aria-label="Se déconnecter"
        title="Se déconnecter"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <>
      {/* Barre supérieure mobile */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          aria-label="Ouvrir le menu"
          aria-expanded={open}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Tiroir mobile */}
      {open && (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 z-40 bg-slate-900/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside
            ref={panelRef}
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85%] flex-col bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navigation"
          >
            <div className="flex items-center justify-between px-4 py-4">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                aria-label="Fermer le menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3">{navLinks}</div>
            {userFooter}
          </aside>
        </div>
      )}

      {/* Barre latérale desktop */}
      <aside className="hidden border-r border-slate-200 bg-white lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col">
        <div className="px-5 py-4">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">{navLinks}</div>
        {userFooter}
      </aside>
    </>
  );
}
