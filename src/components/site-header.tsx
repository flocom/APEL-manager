import { LayoutDashboard } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/session";
import { getAssociationSettings } from "@/lib/services/association-settings";

export async function SiteHeader() {
  const [user, settings] = await Promise.all([
    getCurrentUser(),
    getAssociationSettings(),
  ]);

  return (
    <header className="sticky top-0 z-30 border-b-2 border-brand-100 bg-white">
      <div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
        >
          <Image
            src="/logo.svg"
            alt={settings.schoolName}
            width={96}
            height={96}
            priority
            className="h-12 w-auto shrink-0 object-contain"
          />
          <span className="hidden min-w-0 border-l-2 border-brand-100 pl-3 sm:block">
            <span className="block break-words text-sm font-extrabold tracking-[-0.02em] text-brand-950">
              {settings.associationName}
            </span>
            <span className="mt-0.5 block break-words text-[11px] font-medium text-slate-500">
              {settings.schoolName}
            </span>
          </span>
        </Link>
        <nav className="flex shrink-0 items-center gap-2 text-sm">
          {user ? (
            <Link
              href="/dashboard"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand-950 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              <LayoutDashboard className="h-4 w-4" />
              Mon espace
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-lg px-3 py-2 font-bold text-brand-950 transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 sm:inline"
              >
                Connexion
              </Link>
              <Link
                href="/register"
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-brand-950 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
              >
                Créer un compte
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
