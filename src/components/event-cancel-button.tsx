"use client";

import { CalendarX2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { Button, Field, Textarea } from "@/components/ui";
import { api } from "@/lib/client";

/**
 * Annuler un événement, ou le rétablir.
 *
 * Annuler n'est pas supprimer, et le bouton ne doit pas se lire comme tel :
 * l'événement reste en place, barré, avec ses inscriptions. C'est pourquoi il
 * est en contour ambré et non corail — le corail est réservé à ce qui détruit.
 *
 * Le dialogue annonce combien de personnes vont recevoir le message, et
 * combien ne le recevront pas faute d'adresse. C'est la seule chose qui
 * permette de décider s'il faut aussi passer des appels, et elle doit être
 * sous les yeux au moment de valider, pas découverte après.
 *
 * Le motif est facultatif : une annulation se décide parfois vite, et attendre
 * la bonne formule retarderait le message. Il n'est proposé qu'à l'annulation
 * — rétablir ne s'explique à personne, puisque personne n'en est averti.
 */
export function EventCancelButton({
  eventId,
  eventTitle,
  eventVersion,
  isCancelled,
  isMeeting,
  /** Inscrits joignables par e-mail, et ceux qui ne le sont pas. */
  contactables,
  sansEmail,
}: {
  eventId: string;
  eventTitle: string;
  eventVersion: number;
  isCancelled: boolean;
  isMeeting: boolean;
  contactables: number;
  sansEmail: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [raison, setRaison] = useState("");

  const mot = isMeeting ? "la réunion" : "l’événement";

  const description = isCancelled
    ? `« ${eventTitle} » redeviendra un rendez-vous normal : ses tâches repartent dans les rappels et les inscriptions rouvrent. Personne ne sera prévenu de ce rétablissement.`
    : [
        `« ${eventTitle} » restera visible, barré et marqué annulé. Ses tâches sortent des rappels et la page publique n’accepte plus d’inscription.`,
        contactables > 0
          ? `Un message part aussitôt à ${contactables} personne${contactables > 1 ? "s" : ""} inscrite${contactables > 1 ? "s" : ""}.`
          : "Personne n’est inscrit : aucun message ne partira.",
        sansEmail > 0
          ? `${sansEmail} inscrit${sansEmail > 1 ? "s n’ont" : " n’a"} pas laissé d’adresse — à prévenir autrement.`
          : null,
      ]
        .filter(Boolean)
        .join(" ");

  async function basculer() {
    setLoading(true);
    try {
      const bilan = await api<{ sent: number; sansEmail?: number }>(
        `/api/events/${eventId}/annulation`,
        {
          method: "POST",
          body: {
            annule: !isCancelled,
            raison: raison.trim() || undefined,
            version: eventVersion,
          },
        },
      );
      toast(
        isCancelled
          ? `« ${eventTitle} » est rétabli.`
          : bilan.sent > 0
            ? `${mot.charAt(0).toUpperCase()}${mot.slice(1)} est annulé${isMeeting ? "e" : ""} : ${bilan.sent} message${bilan.sent > 1 ? "s" : ""} envoyé${bilan.sent > 1 ? "s" : ""}.`
            : `${mot.charAt(0).toUpperCase()}${mot.slice(1)} est annulé${isMeeting ? "e" : ""}.`,
      );
      setOpen(false);
      setRaison("");
      router.refresh();
    } catch (erreur) {
      toast((erreur as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        icon={isCancelled ? Undo2 : CalendarX2}
        onClick={() => setOpen(true)}
        disabled={loading}
        className={
          isCancelled
            ? undefined
            : "border-sand-400 text-sand-800 hover:border-sand-700 hover:bg-sand-50 hover:text-sand-900"
        }
      >
        {isCancelled ? "Rétablir" : "Annuler"}
        <span className="sr-only"> {mot} {eventTitle}</span>
      </Button>
      <ConfirmDialog
        open={open}
        title={
          isCancelled
            ? `Rétablir ${mot} ?`
            : `Annuler ${mot} ?`
        }
        description={description}
        confirmLabel={isCancelled ? "Rétablir" : "Annuler et prévenir"}
        loading={loading}
        onConfirm={basculer}
        onCancel={() => {
          setOpen(false);
          setRaison("");
        }}
      >
        {!isCancelled && contactables > 0 && (
          <Field
            label="Motif (facultatif)"
            htmlFor="raison-annulation"
            hint="Repris tel quel dans le message. Laissez vide si vous préférez ne rien dire."
          >
            <Textarea
              id="raison-annulation"
              rows={3}
              maxLength={500}
              value={raison}
              onChange={(e) => setRaison(e.target.value)}
              placeholder="Météo, salle indisponible, trop peu d’inscrits…"
            />
          </Field>
        )}
      </ConfirmDialog>
    </>
  );
}
