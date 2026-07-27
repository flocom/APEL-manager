"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Barre de progression fine en haut de l'écran pendant les navigations.
 * Sans dépendance : démarre au clic d'un lien interne, se termine quand l'URL
 * change. Complète les squelettes (loading.tsx) par un signal global immédiat.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const first = useRef(true);

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
        anchor.hasAttribute("download") ||
        href === pathname
      ) {
        return;
      }
      setActive(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  // Termine la barre quand la nouvelle page est rendue (changement d'URL).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setActive(false);
  }, [pathname]);

  if (!active) return null;
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
