import { LayoutDashboard, MessagesSquare } from "lucide-react";
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
      {/* Les boutons restent sur une seule ligne, quelle que soit la largeur :
          c'est le logo qui cède la place. Un logo d'école est souvent large
          (celui de Notre-Dame des Flots fait près de deux fois sa hauteur) et,
          à 48 px de haut, il repoussait « Organisateurs » sur une deuxième
          rangée dès 414 px. */}
      <div className="mx-auto flex min-h-[64px] max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:min-h-[76px] sm:gap-4 sm:px-6">
        <Link
          href="/"
          className="flex min-w-0 shrink items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
        >
          <Image
            src={settings.logoUrl || "/logo.svg"}
            alt={settings.schoolName}
            width={96}
            height={96}
            unoptimized
            priority
            className="h-auto max-h-10 w-auto min-w-0 max-w-full shrink object-contain object-left sm:max-h-12 sm:shrink-0"
          />
          <span className="hidden min-w-0 border-l-2 border-brand-100 pl-3 md:block">
            <span className="block break-words text-sm font-extrabold tracking-[-0.02em] text-brand-950">
              {settings.associationName}
            </span>
            <span className="mt-0.5 block break-words text-[11px] font-medium text-slate-500">
              {settings.schoolName}
            </span>
          </span>
        </Link>
        {/* Sous 375 px, le texte descend à 12 px : à 13 px, il ne resterait
            plus rien du logo sur un écran de 320 px. */}
        <nav className="flex shrink-0 items-center justify-end gap-1 text-xs min-[375px]:text-[13px] sm:gap-2 sm:text-sm">
          {/* Le rouge est réservé à ce bouton : il n'est ni une alerte ni une
              promotion, c'est la porte qu'un parent doit trouver sans chercher
              le jour où quelque chose ne va pas. */}
          <Link
            href="/contact"
            className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-coral-600 px-2 py-2 font-bold text-white transition-colors hover:bg-coral-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-coral-200 sm:px-4"
          >
            {/* L'icône ne réapparaît qu'à partir de sm : sur téléphone, ces
                22 pixels sont pris au logo. */}
            <MessagesSquare className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
            Un souci ?
          </Link>
          {user ? (
            <Link
              href="/dashboard"
              className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-brand-950 px-3 py-2 font-bold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 sm:px-4"
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden="true" />
              Mon espace
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex min-h-10 items-center whitespace-nowrap rounded-lg px-1.5 py-2 font-bold text-brand-950 transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 sm:px-3"
              >
                Connexion
              </Link>
              <Link
                href="/register"
                className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-xl bg-brand-950 px-2 py-2 font-bold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 sm:px-4"
              >
                {/* « Créer un compte » attirait les parents venus adhérer :
                    c'est le seul bouton foncé permanent du site, et il mène à
                    l'espace de gestion, pas à l'adhésion. */}
                <span className="sm:hidden">Organisateurs</span>
                <span className="hidden sm:inline">Espace organisateurs</span>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
