"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";
import { api } from "@/lib/client";

/**
 * La suppression d'un événement.
 *
 * Elle passait par un `confirm()` natif qui ne nommait pas l'événement : sur un
 * écran où l'on vient de naviguer entre plusieurs rendez-vous, rien ne disait
 * lequel on s'apprêtait à effacer. Elle avalait aussi son erreur — `catch {}`
 * sans message — donc une suppression refusée ne laissait qu'un bouton qui
 * redevenait cliquable.
 *
 * Le dialogue partagé du reste de l'application nomme l'événement et énumère ce
 * qui part avec lui. C'est la seule action de l'application qui détruise en
 * cascade des inscriptions de tiers : elle mérite de dire combien.
 */
export function EventDeleteButton({
  eventId,
  eventTitle,
  taskCount,
  slotCount,
  signupCount,
}: {
  eventId: string;
  eventTitle: string;
  taskCount: number;
  slotCount: number;
  signupCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Ce qui part avec l'événement, énuméré plutôt qu'annoncé en bloc : « et ses
  // tâches et inscriptions » ne dit pas s'il y en a zéro ou quarante.
  const pertes = [
    taskCount > 0 ? `${taskCount} tâche${taskCount > 1 ? "s" : ""}` : null,
    slotCount > 0 ? `${slotCount} créneau${slotCount > 1 ? "x" : ""}` : null,
    signupCount > 0
      ? `${signupCount} inscription${signupCount > 1 ? "s" : ""} de bénévole`
      : null,
  ].filter((p): p is string => p !== null);

  const description =
    pertes.length > 0
      ? `« ${eventTitle} » sera effacé définitivement, avec ${pertes.join(", ")}. Les personnes inscrites ne seront pas prévenues. Cette action est irréversible.`
      : `« ${eventTitle} » sera effacé définitivement. Cette action est irréversible.`;

  async function supprimer() {
    setLoading(true);
    try {
      await api(`/api/events/${eventId}`, { method: "DELETE" });
      toast(`« ${eventTitle} » a été supprimé.`);
      router.push("/dashboard/events");
      router.refresh();
    } catch (erreur) {
      // Le message du serveur, et non un silence : une suppression refusée
      // faute de droits ou parce que l'événement a déjà disparu doit se voir.
      toast((erreur as Error).message, "error");
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <>
      <Button
        variant="danger"
        size="sm"
        icon={Trash2}
        onClick={() => setOpen(true)}
        disabled={loading}
      >
        Supprimer l’événement
      </Button>
      <ConfirmDialog
        open={open}
        title="Supprimer cet événement ?"
        description={description}
        confirmLabel="Supprimer définitivement"
        loading={loading}
        onConfirm={supprimer}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
