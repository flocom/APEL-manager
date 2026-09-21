"use client";

import { useEffect, useState } from "react";

/**
 * Barre de progression fine en haut de l'écran pendant les navigations.
 *
 * Sans dépendance : démarre au clic d'un lien interne, s'efface dès que l'URL
 * affichée n'est plus celle qu'on quittait. Complète les squelettes
 * (loading.tsx) par un signal global immédiat.
 *
 * Elle restait allumée en permanence. La cause : elle ne s'éteignait que sur
 * un changement de `pathname`, donc jamais lorsqu'une navigation ne touchait
 * qu'à la chaîne de requête — les onglets d'un événement, par exemple, qui ne
 * changent que `?onglet=`. Un clic sur un onglet allumait la barre et rien ne
 * l'éteignait plus jusqu'à ce qu'on quitte la page.
 *
 * Le correctif évident — ajouter `useSearchParams()` aux dépendances — a été
 * essayé et écarté : ce composant vit dans le gabarit racine, et l'y appeler
 * empêchait les liens d'onglet de naviguer du tout. Mesuré : le clic atteignait
 * bien le lien, sans erreur, et l'URL ne changeait pas. Une barre de
 * progression ne vaut pas de casser la navigation qu'elle décrit.
 *
 * On surveille donc `location.href` directement, et seulement pendant qu'une
 * navigation est en cours. Aucun abonnement au routeur, donc aucun effet de
 * bord possible sur lui, et la chaîne de requête est prise en compte comme le
 * reste de l'URL.
 */

/** Rythme de surveillance de l'URL pendant une navigation. */
const POULS_MS = 80;
/** Passé ce délai, une navigation qui n'est pas arrivée ne viendra plus. */
const ABANDON_MS = 8000;

export function NavigationProgress() {
  /** L'URL quittée au dernier clic, ou `null` si l'on ne navigue pas. */
  const [origine, setOrigine] = useState<string | null>(null);

  // Démarre la barre au clic sur un lien interne (capture pour devancer Next).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (
        !href ||
        !href.startsWith("/") ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }
      // La cible mène-t-elle vraiment ailleurs ? Un lien qui ne diffère que
      // par son ancre ne navigue pas, il fait défiler : la barre resterait
      // seule à attendre un changement d'URL qui ne viendra pas.
      const cible = new URL(href, window.location.origin);
      if (
        cible.pathname === window.location.pathname &&
        cible.search === window.location.search
      ) {
        return;
      }
      setOrigine(window.location.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Tant qu'on navigue, on regarde si l'URL a changé. Le filet de sécurité
  // coupe au bout d'un moment : une barre bloquée ment plus qu'elle n'informe.
  useEffect(() => {
    if (origine === null) return;
    const pouls = window.setInterval(() => {
      if (window.location.href !== origine) setOrigine(null);
    }, POULS_MS);
    const abandon = window.setTimeout(() => setOrigine(null), ABANDON_MS);
    return () => {
      window.clearInterval(pouls);
      window.clearTimeout(abandon);
    };
  }, [origine]);

  if (origine === null) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden"
      role="status"
      aria-label="Chargement"
    >
      <div className="absolute h-full animate-progress-indeterminate bg-brand-700" />
    </div>
  );
}
