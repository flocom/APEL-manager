"use client";

import {
  ContactRound,
  FileText,
  LayoutDashboard,
  Landmark,
  ListChecks,
  LogOut,
  type LucideIcon,
  Menu,
  PartyPopper,
  SlidersHorizontal,
  Settings,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { APP_NAME } from "@/lib/app-config";
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

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Pilotage",
    items: [
      {
        href: "/dashboard",
        label: "Tableau de bord",
        icon: LayoutDashboard,
        exact: true,
      },
      { href: "/dashboard/events", label: "Événements", icon: PartyPopper },
      { href: "/dashboard/tasks", label: "Mes tâches", icon: ListChecks },
    ],
  },
  {
    label: "Association",
    items: [
      {
        href: "/dashboard/adherents",
        label: "Adhérents",
        icon: ContactRound,
        minRole: "admin",
      },
      {
        href: "/dashboard/accounting",
        label: "Comptabilité",
        icon: Landmark,
        minRole: "admin",
      },
      {
        href: "/dashboard/documents",
        label: "Documents",
        icon: FileText,
        minRole: "manager",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/dashboard/members",
        label: "Utilisateurs",
        icon: Users,
        minRole: "admin",
      },
      {
        href: "/dashboard/settings",
        label: "Configuration",
        icon: SlidersHorizontal,
        minRole: "admin",
      },
      {
        href: "/dashboard/account",
        label: "Mon compte",
        icon: Settings,
      },
    ],
  },
];

const roleRank: Record<Role, number> = { member: 1, manager: 2, admin: 3 };

function Logo() {
  return (
    <Link
      href="/dashboard"
      className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-white"
    >
      <span className="flex h-12 w-[5.25rem] shrink-0 items-center justify-center rounded-xl bg-white p-1.5">
        <Image
          src="/logo-notre-dame-des-flots.png"
          alt="Notre Dame des Flots"
          width={425}
          height={228}
          className="h-full w-full object-contain"
          priority
        />
      </span>
      <span className="min-w-0">
        <span className="block break-words text-[10px] font-bold uppercase tracking-[0.18em] text-brand-200">
          Espace APEL
        </span>
        <span className="mt-0.5 block break-words text-sm font-bold leading-tight text-white">
          {APP_NAME}
        </span>
      </span>
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
    <nav className="space-y-5" aria-label="Navigation principale">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter(
          (item) =>
            !item.minRole || roleRank[user.role] >= roleRank[item.minRole],
        );
        if (items.length === 0) return null;

        return (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-300">
              {group.label}
            </p>
            <div className="flex flex-col gap-1.5">
              {items.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors duration-150",
                      active
                        ? "border-brand-200 bg-brand-100 text-brand-950"
                        : "border-transparent text-brand-100 hover:border-brand-700 hover:bg-brand-900 hover:text-white",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "h-5 w-1 shrink-0 rounded-full",
                        active ? "bg-sea-500" : "bg-transparent",
                      )}
                    />
                    <Icon
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 transition-colors",
                        active
                          ? "text-brand-700"
                          : "text-brand-200 group-hover:text-white",
                      )}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const userFooter = (
    <div className="m-3 flex items-center gap-3 rounded-xl border border-brand-700 bg-brand-900 p-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-sm font-extrabold text-brand-950">
        {initials || "?"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-bold text-white">{user.name}</p>
        <p className="mt-0.5 text-xs text-brand-200">{ROLE_LABELS[user.role]}</p>
      </div>
      <button
        type="button"
        onClick={logout}
        className="shrink-0 rounded-lg p-2 text-brand-200 transition-colors hover:bg-brand-800 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
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
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-brand-800 bg-brand-950 px-4 py-3 lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl border border-brand-700 p-2.5 text-white transition-colors hover:bg-brand-900 focus-visible:ring-2 focus-visible:ring-white"
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
            className="fixed inset-0 z-40 bg-slate-950/60"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside
            ref={panelRef}
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[88%] flex-col border-r border-brand-800 bg-brand-950"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navigation"
          >
            <div className="flex items-center justify-between border-b border-brand-800 px-4 py-4">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl p-2 text-brand-100 hover:bg-brand-900 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
                aria-label="Fermer le menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              {navLinks}
            </div>
            {userFooter}
          </aside>
        </div>
      )}

      {/* Barre latérale desktop */}
      <aside className="hidden border-r border-brand-900 bg-brand-950 lg:flex lg:h-screen lg:w-[18rem] lg:shrink-0 lg:flex-col">
        <div className="border-b border-brand-800 px-5 py-5">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          {navLinks}
        </div>
        <div>{userFooter}</div>
      </aside>
    </>
  );
}
