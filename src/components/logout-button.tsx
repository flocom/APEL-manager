"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { api } from "@/lib/client";

/** Se déconnecter, hors du tableau de bord (qui a son propre bouton). */
export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await api("/api/auth/logout");
    } finally {
      router.push("/login");
      router.refresh();
    }
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
