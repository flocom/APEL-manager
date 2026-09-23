"use client";

import { MonitorSmartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";
import { api } from "@/lib/client";

/**
 * « Se déconnecter de tous les appareils » : ferme toutes les sessions du
 * compte, celle-ci comprise, et coupe les connecteurs MCP. Pour l'ordinateur
 * partagé où l'on est resté connecté, ou le téléphone perdu — sans devoir
 * changer de mot de passe.
 */
export function LogoutEverywhereButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function confirmer() {
    setLoading(true);
    try {
      await api("/api/me/sessions", { method: "DELETE" });
      router.push("/login");
      router.refresh();
    } catch (erreur) {
      toast((erreur as Error).message, "error");
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="dangerOutline"
        icon={MonitorSmartphone}
        onClick={() => setOpen(true)}
        className="min-h-12"
      >
        Se déconnecter de tous les appareils
      </Button>
      <ConfirmDialog
        open={open}
        title="Se déconnecter de tous les appareils ?"
        description="Toutes vos sessions se ferment, sur ce navigateur comme sur les autres (téléphone, ordinateur partagé…). Les connecteurs MCP que vous avez autorisés, comme Claude, sont coupés aussi. Il faudra vous reconnecter partout."
        confirmLabel="Tout déconnecter"
        loading={loading}
        onConfirm={confirmer}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
