"use client";

import { KeyRound, LogIn, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Menu de l'en-tête public, sous lg : Connexion et Espace organisateurs y
 * attendent, pour laisser la ligne aux deux portes des parents — « Un souci ? »
 * et « Nous rejoindre ».
 */
export function SiteHeaderMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  // Échap ou un toucher hors du menu le referment, comme on s'y attend.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const item =
    "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold text-brand-950 transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500";

  return (
    <div ref={rootRef} className="relative lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="site-header-menu"
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border-2 border-brand-100 text-brand-950 transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Menu className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div
          id="site-header-menu"
          className="absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg"
        >
          <Link href="/login" onClick={() => setOpen(false)} className={item}>
            <LogIn className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
            Connexion
          </Link>
          <Link href="/register" onClick={() => setOpen(false)} className={item}>
            <KeyRound className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
            Espace organisateurs
          </Link>
        </div>
      )}
    </div>
  );
}
