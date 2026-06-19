import Link from "next/link";

import { buttonClasses } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
            A
          </span>
          APEL Manager
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <Link href="/dashboard" className={buttonClasses("primary", "sm")}>
              Mon espace
            </Link>
          ) : (
            <>
              <Link href="/login" className="font-medium text-slate-600 hover:text-slate-900">
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
