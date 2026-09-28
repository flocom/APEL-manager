import { HeartHandshake, LayoutDashboard, MessagesSquare } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { SiteHeaderMenu } from "@/components/site-header-menu";
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
          si la place manque, c'est le logo qui la cède. Un logo d'école est
          souvent large — celui de Notre-Dame des Flots fait près de deux fois
          sa hauteur. */}
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
        <nav className="flex shrink-0 items-center justify-end gap-1 text-sm sm:gap-2">
          {/* Le rouge est réservé à ce bouton : il n'est ni une alerte ni une
              promotion, c'est la porte qu'un parent doit trouver sans chercher
              le jour où quelque chose ne va pas. Sur téléphone, l'icône seule
              suffit à la signaler ; le libellé reste lu par les lecteurs
              d'écran. */}
          <Link
            href="/contact"
            className="inline-flex min-h-10 min-w-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-coral-600 px-2.5 py-2 font-bold text-white transition-colors hover:bg-coral-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-coral-200 sm:px-4"
          >
            <MessagesSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Un souci ?</span>
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
              {/* La porte des parents qui veulent adhérer ou donner un coup de
                  main : elle reste sur la ligne à toutes les largeurs. Un
                  membre connecté fait déjà partie de l'équipe, d'où son
                  absence de ce côté-là. */}
              <Link
                href="/rejoindre"
                className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-sea-300 px-3 py-2 font-extrabold text-brand-950 transition-colors hover:bg-sea-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-sea-200 sm:px-4"
              >
                <HeartHandshake className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
                Nous rejoindre
              </Link>
              <Link
                href="/login"
                className="hidden min-h-10 items-center whitespace-nowrap rounded-lg px-3 py-2 font-bold text-brand-950 transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 lg:inline-flex"
              >
                Connexion
              </Link>
              <Link
                href="/register"
                className="hidden min-h-10 items-center justify-center whitespace-nowrap rounded-xl bg-brand-950 px-4 py-2 font-bold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 lg:inline-flex"
              >
                {/* « Créer un compte » attirait les parents venus adhérer :
                    ce bouton mène à l'espace de gestion, pas à l'adhésion. */}
                Espace organisateurs
              </Link>
              {/* Sous lg, Connexion et Espace organisateurs passent dans un
                  menu : quatre boutons ne tiennent pas sur une ligne de
                  téléphone. */}
              <SiteHeaderMenu />
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
