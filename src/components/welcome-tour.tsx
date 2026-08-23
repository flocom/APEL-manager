"use client";

import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/client";

/**
 * Guide de première connexion : une bulle par entrée du menu, ancrée dessus.
 *
 * Les étapes sont dérivées du menu réellement affiché plutôt que d'une liste
 * figée : un organisateur ne voit pas la comptabilité, son guide n'en parle
 * donc pas, sans qu'aucune règle de rôle ne soit à tenir à jour ici.
 */

const ETAPES: { href: string; titre: string; texte: string }[] = [
  {
    href: "/dashboard",
    titre: "Le tableau de bord",
    texte:
      "Votre point de départ : ce qui arrive bientôt, ce qui est en retard, et les chiffres de l’association d’un coup d’œil.",
  },
  {
    href: "/dashboard/events",
    titre: "Les événements",
    texte:
      "Kermesse, vide-grenier, boom… Chaque événement réunit sa check-list de préparation, ses créneaux de bénévoles et ses pièces jointes.",
  },
  {
    href: "/dashboard/tasks",
    titre: "Mes tâches",
    texte:
      "Ce qui vous a été confié, toutes manifestations confondues, classé par échéance. C’est la page à ouvrir en premier le lundi matin.",
  },
  {
    href: "/dashboard/adherents",
    titre: "Les adhérents",
    texte:
      "Le registre des familles adhérentes : cotisations, coordonnées et suivi des adhésions au fil de l’année.",
  },
  {
    href: "/dashboard/accounting",
    titre: "La comptabilité",
    texte:
      "Recettes et dépenses, comptes et caisses, justificatifs. Chaque écriture peut être rattachée à l’événement qui l’a produite.",
  },
  {
    href: "/dashboard/documents",
    titre: "Les documents",
    texte:
      "Les procès-verbaux d’assemblée générale, les attestations, et le classeur officiel : statuts, assurance, conventions.",
  },
  {
    href: "/dashboard/members",
    titre: "Les utilisateurs",
    texte:
      "Qui a accès à quoi. Trois rôles : membre pour consulter, organisateur pour mener les événements, administrateur pour tout le reste.",
  },
  {
    href: "/dashboard/notifications",
    titre: "Les notifications",
    texte:
      "Un message envoyé sur le téléphone ou l’ordinateur des membres, avec le détail de qui l’a reçu et qui l’a ouvert.",
  },
  {
    href: "/dashboard/settings",
    titre: "La configuration",
    texte:
      "L’identité de l’association, l’envoi des e-mails, les rappels et le suivi des mises à jour de l’application.",
  },
  {
    href: "/dashboard/account",
    titre: "Mon compte",
    texte:
      "Votre nom, votre mot de passe et vos préférences de notification. Le guide peut être relancé d’ici à tout moment.",
  },
];

/** Première cible réellement affichée : le menu existe en double (barre latérale et tiroir mobile). */
function cibleVisible(href: string): HTMLElement | null {
  const candidats = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour="${href}"]`),
  );
  return (
    candidats.find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) ?? null
  );
}

/** Événement à émettre pour relancer le guide depuis n'importe quel écran. */
export const TOUR_EVENT = "apel:relancer-guide";

export function WelcomeTour({
  autoStart,
  onFinished,
}: {
  autoStart: boolean;
  /** Déclenché une fois le guide terminé ou passé, pour ne plus le proposer. */
  onFinished?: () => void;
}) {
  const [ouvert, setOuvert] = useState(autoStart);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const carte = useRef<HTMLDivElement>(null);

  // Les étapes ne sont calculées qu'une fois le menu monté : le rendu serveur
  // n'a pas de DOM à interroger, et un décalage entre les deux passerait pour
  // une erreur d'hydratation.
  const [etapes, setEtapes] = useState<typeof ETAPES>([]);
  useEffect(() => {
    if (!ouvert) return;
    setEtapes(ETAPES.filter((etape) => cibleVisible(etape.href)));
  }, [ouvert]);
  const etape = etapes[index];

  const placer = useCallback(() => {
    if (!etape) return;
    const cible = cibleVisible(etape.href);
    setRect(cible ? cible.getBoundingClientRect() : null);
  }, [etape]);

  useEffect(() => {
    if (!ouvert) return;
    placer();
    window.addEventListener("resize", placer);
    window.addEventListener("scroll", placer, true);
    return () => {
      window.removeEventListener("resize", placer);
      window.removeEventListener("scroll", placer, true);
    };
  }, [ouvert, placer]);

  useEffect(() => {
    if (ouvert) carte.current?.focus();
  }, [ouvert, index]);

  useEffect(() => {
    function relancer() {
      setIndex(0);
      setOuvert(true);
    }
    window.addEventListener(TOUR_EVENT, relancer);
    return () => window.removeEventListener(TOUR_EVENT, relancer);
  }, []);

  const terminer = useCallback(async () => {
    setOuvert(false);
    onFinished?.();
    try {
      await api("/api/me", { method: "PATCH", body: { onboardingSeen: true } });
    } catch {
      // Sans le marquage, le guide se reproposera : sans gravité.
    }
  }, [onFinished]);

  useEffect(() => {
    if (!ouvert) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") void terminer();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ouvert, terminer]);

  if (!ouvert || !etape) return null;

  // Sans cible visible — écran étroit, menu replié — la bulle se centre.
  const ancree = rect !== null;
  const dessous = ancree && rect.top < window.innerHeight / 2;
  const style: React.CSSProperties = ancree
    ? {
        position: "fixed",
        top: dessous ? rect.bottom + 12 : undefined,
        bottom: dessous ? undefined : window.innerHeight - rect.top + 12,
        left: Math.min(rect.left, window.innerWidth - 360),
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };

  return (
    <>
      {ancree ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-40 rounded-xl ring-2 ring-sea-400 transition-all duration-200"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: "0 0 0 9999px rgba(8, 42, 64, 0.7)",
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-brand-950/70"
        />
      )}

      <div
        ref={carte}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-titre"
        tabIndex={-1}
        style={style}
        className="z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-xl focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-lg bg-brand-100 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-brand-800">
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            Étape {index + 1} / {etapes.length}
          </span>
          <button
            type="button"
            onClick={() => void terminer()}
            aria-label="Fermer le guide"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h2
          id="guide-titre"
          className="mt-3 text-lg font-black tracking-[-0.02em] text-brand-950"
        >
          {etape.titre}
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
          {etape.texte}
        </p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => void terminer()}
            className="text-xs font-bold text-slate-500 underline hover:text-slate-800"
          >
            Passer le guide
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex((value) => value - 1)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Précédent
              </button>
            )}
            {index < etapes.length - 1 ? (
              <button
                type="button"
                onClick={() => setIndex((value) => value + 1)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-brand-950 px-3.5 py-2 text-sm font-extrabold text-white hover:bg-brand-800"
              >
                Suivant
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void terminer()}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-brand-950 px-3.5 py-2 text-sm font-extrabold text-white hover:bg-brand-800"
              >
                <Check className="h-4 w-4" />
                J’ai compris
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
