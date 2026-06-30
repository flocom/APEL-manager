"use client";

import { useRouter } from "next/navigation";

import { useToast } from "@/components/toast";
import { ApiError } from "@/lib/client";

/**
 * Gestion uniforme des erreurs de mutation. Sur un conflit (409, verrou
 * optimiste), propose un toast « Recharger » qui rafraîchit les données pour
 * repartir de la dernière version — au lieu d'écraser le travail d'un autre.
 */
export function useMutationError() {
  const toast = useToast();
  const router = useRouter();
  return (err: unknown) => {
    if (err instanceof ApiError && err.status === 409) {
      toast(err.message, "error", {
        label: "Recharger",
        onClick: () => router.refresh(),
      });
      return;
    }
    toast(
      err instanceof Error ? err.message : "Une erreur est survenue.",
      "error",
    );
  };
}
