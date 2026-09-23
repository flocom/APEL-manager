"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";
import { api } from "@/lib/client";

/** Se déconnecter, hors du tableau de bord (qui a son propre bouton). */
export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await api("/api/auth/logout");
    } catch {
      // Le cookie est resté : partir vers /login ramènerait ici sans rien
      // dire. Mieux vaut annoncer l'échec et laisser réessayer.
      toast("La déconnexion n’a pas abouti. Réessayez dans un instant.", "error");
      setLoading(false);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="outline"
      icon={LogOut}
      loading={loading}
      onClick={logout}
      className={className}
    >
      Se déconnecter
    </Button>
  );
}
