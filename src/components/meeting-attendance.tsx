"use client";

import { Check, HelpCircle, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { api } from "@/lib/client";

/**
 * « Je serai présent » : la réponse d'un membre à une réunion.
 *
 * Trois réponses plutôt que deux, parce qu'un parent qui ne sait pas encore
 * n'est ni un présent ni un absent — et qu'une assemblée générale se prépare
 * avec des chiffres honnêtes. Recliquer sur sa réponse la retire.
 */

export type MeetingReply = "yes" | "maybe" | "no";

const CHOIX: {
  valeur: MeetingReply;
  label: string;
  courte: string;
  icone: typeof Check;
  actif: string;
}[] = [
  {
    valeur: "yes",
    label: "Je serai là",
    courte: "présent",
    icone: Check,
    actif: "border-sea-500 bg-sea-500 text-white",
  },
  {
    valeur: "maybe",
    label: "Peut-être",
    courte: "peut-être",
    icone: HelpCircle,
    actif: "border-sand-500 bg-sand-500 text-white",
  },
  {
    valeur: "no",
    label: "Je ne peux pas",
    courte: "absent",
    icone: X,
    actif: "border-slate-500 bg-slate-500 text-white",
  },
];

export function MeetingAttendance({
  eventId,
  reponse,
  compact = false,
}: {
  eventId: string;
  /** Réponse actuelle du membre connecté, ou null s'il n'a pas répondu. */
  reponse: MeetingReply | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [choix, setChoix] = useState<MeetingReply | null>(reponse);
  const [occupe, setOccupe] = useState(false);

  async function repondre(valeur: MeetingReply) {
    const precedent = choix;
    const retrait = precedent === valeur;
    setChoix(retrait ? null : valeur);
    setOccupe(true);
    try {
      if (retrait) {
        await api(`/api/events/${eventId}/attendance`, { method: "DELETE" });
      } else {
        await api(`/api/events/${eventId}/attendance`, {
          method: "PUT",
          body: { status: valeur },
        });
      }
      router.refresh();
    } catch (error) {
      setChoix(precedent);
      toast((error as Error).message, "error");
    } finally {
      setOccupe(false);
    }
  }

  return (
    <div className={compact ? "flex flex-wrap gap-1.5" : "flex flex-wrap gap-2"}>
      {CHOIX.map(({ valeur, label, courte, icone: Icone, actif }) => {
        const selectionne = choix === valeur;
        return (
          <button
            key={valeur}
            type="button"
            disabled={occupe}
            aria-pressed={selectionne}
            onClick={() => void repondre(valeur)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl border-2 px-3.5 py-2 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60 ${
              selectionne
                ? actif
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {occupe && selectionne ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {compact ? courte : label}
          </button>
        );
      })}
    </div>
  );
}
