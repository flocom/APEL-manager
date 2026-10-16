"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { withHash } from "@/components/auth-forms";
import { DEFAULT_NEXT_PATH, withNextPath } from "@/lib/auth/return-path";
import { cn } from "@/lib/utils";

/**
 * Les deux onglets de la page « Mon compte » : /login et /register sont une
 * même porte. Personne n'imaginait créer un compte en cliquant sur
 * « Connexion » ; ici, les deux gestes se voient côte à côte, dès l'arrivée.
 *
 * Des liens et non des onglets ARIA : chacun ouvre sa propre page, avec sa
 * propre adresse. La page à retrouver (`next`) et son ancre suivent d'un
 * onglet à l'autre, comme pour les liens des formulaires.
 */
export function AuthTabs({
  active,
  next = DEFAULT_NEXT_PATH,
}: {
  active: "login" | "register";
  next?: string;
}) {
  const [destination, setDestination] = useState(next);
  useEffect(() => setDestination(withHash(next)), [next]);

  const tabs = [
    { key: "login", href: "/login", label: "Se connecter" },
    { key: "register", href: "/register", label: "Créer un compte" },
  ] as const;

  return (
    <nav
      aria-label="Mon compte"
      className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
    >
      {tabs.map((tab) => {
        const current = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={withNextPath(tab.href, destination)}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-lg px-2 text-center text-sm font-bold transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200",
              current
                ? "bg-white text-brand-950 shadow-sm ring-1 ring-slate-200"
                : "text-slate-600 hover:bg-white/70 hover:text-brand-950",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
