"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Rafraîchit discrètement les données du serveur (RSC) quand l'onglet reprend
 * le focus, et à intervalle régulier. Sur les écrans partagés (fiche
 * événement), cela limite les vues périmées et donc les conflits d'édition.
 * router.refresh() préserve l'état des formulaires en cours de saisie.
 */
export function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    const id = window.setInterval(refreshIfVisible, intervalMs);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
      window.clearInterval(id);
    };
  }, [router, intervalMs]);

  return null;
}
