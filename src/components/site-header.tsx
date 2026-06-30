import { LayoutDashboard } from "lucide-react";
import Link from "next/link";

import { buttonClasses } from "@/components/ui";
import { APP_INITIAL, APP_NAME } from "@/lib/app-config";
import { getCurrentUser } from "@/lib/auth/session";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-sea-500 font-bold text-white shadow-buoy">
            {APP_INITIAL}
          </span>
          {APP_NAME}
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <Link href="/dashboard" className={buttonClasses("primary", "sm")}>
              <LayoutDashboard className="h-4 w-4" />
              Mon espace
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="font-medium text-slate-600 transition-colors hover:text-slate-900"
              >
                Connexion
              </Link>
              <Link href="/register" className={buttonClasses("primary", "sm")}>
                Créer un compte
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
