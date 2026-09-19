"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormattedText } from "@/components/formatted-text";
import { Badge, Button, Input, Label, Textarea } from "@/components/ui";
import { api } from "@/lib/client";
import { formatDateTime, toDatetimeLocal } from "@/lib/dates";

export interface SignupItemData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface SlotItemData {
  id: string;
  title: string;
  description: string | null;
  capacity: number;
  startAt: string | null;
  endAt: string | null;
  signups: SignupItemData[];
}

export function SlotManager({
  eventId,
  slots,
  canManage,
}: {
  eventId: string;
  slots: SlotItemData[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function saveSlot(
    slotId: string,
    e: React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();
    setBusySlotId(slotId);
    setError(null);
    const form = new FormData(e.currentTarget);
    const startRaw = form.get("startAt");
    const endRaw = form.get("endAt");
    try {
      await api(`/api/slots/${slotId}`, {
        method: "PATCH",
        body: {
          title: form.get("title"),
          description: form.get("description"),
          capacity: Number(form.get("capacity") || 1),
          startAt: startRaw ? startRaw : null,
          endAt: endRaw ? endRaw : null,
        },
      });
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusySlotId(null);
    }
  }

  async function addSlot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const startRaw = form.get("startAt");
    const endRaw = form.get("endAt");
    try {
      await api(`/api/events/${eventId}/slots`, {
        body: {
          title: form.get("title"),
          description: form.get("description"),
          capacity: Number(form.get("capacity") || 1),
          startAt: startRaw ? startRaw : null,
          endAt: endRaw ? endRaw : null,
        },
      });
      setShowAdd(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  /**
   * Recrée le créneau à l'identique dans le même événement, sans ses
   * inscriptions : elles appartiennent aux personnes qui se sont engagées sur
   * l'original. Le titre est suffixé pour que les deux restent distinguables
   * avant ajustement.
   */
  async function duplicateSlot(slot: SlotItemData) {
    setBusySlotId(slot.id);
    setError(null);
    try {
      await api(`/api/events/${eventId}/slots`, {
        body: {
          title: `${slot.title} (copie)`.slice(0, 200),
          // Le schéma attend une chaîne : un créneau sans description est
          // envoyé vide, la route la reconvertit en NULL.
          description: slot.description ?? "",
          capacity: slot.capacity,
          startAt: slot.startAt ? toDatetimeLocal(slot.startAt) : null,
          endAt: slot.endAt ? toDatetimeLocal(slot.endAt) : null,
        },
      });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusySlotId(null);
    }
  }

  async function deleteSlot(id: string) {
    if (!confirm("Supprimer ce créneau et ses inscriptions ?")) return;
    await api(`/api/slots/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function removeSignup(id: string) {
    if (!confirm("Retirer cette inscription ?")) return;
    await api(`/api/signups/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Créneaux</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Une mission claire par créneau facilite les inscriptions.
          </p>
        </div>
        {canManage && !showAdd && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            + Ajouter un créneau
          </Button>
        )}
      </div>

      {canManage && showAdd && (
        <form
          onSubmit={addSlot}
          className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          {error && (
            <p className="rounded bg-coral-50 px-3 py-2 text-sm font-semibold text-coral-800">
              {error}
            </p>
          )}
          <div>
            <Label htmlFor="slot-title">Intitulé du créneau / mission</Label>
            <Input
              id="slot-title"
              name="title"
              required
              placeholder="Ex. Stand crêpes 14h-16h"
            />
          </div>
          <div>
            <Label htmlFor="slot-desc">Description (facultatif)</Label>
            <Textarea id="slot-desc" name="description" rows={2} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="slot-capacity">Nombre de bénévoles</Label>
              <Input
                id="slot-capacity"
                name="capacity"
                type="number"
                min={1}
                max={1000}
                defaultValue={1}
              />
            </div>
            <div>
              <Label htmlFor="slot-start">Début (facultatif)</Label>
              <Input id="slot-start" name="startAt" type="datetime-local" />
            </div>
            <div>
              <Label htmlFor="slot-end">Fin (facultatif)</Label>
              <Input id="slot-end" name="endAt" type="datetime-local" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Ajout…" : "Ajouter"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowAdd(false)}
            >
              Annuler
            </Button>
          </div>
        </form>
      )}

      {slots.length === 0 ? (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">
          Aucun créneau de bénévolat. Ajoutez-en pour recueillir les inscriptions
          via le lien public.
        </p>
      ) : (
        <ul className="space-y-3">
          {slots.map((slot) => {
            const remaining = slot.capacity - slot.signups.length;
            const fillRate = Math.min(
              100,
              Math.round((slot.signups.length / slot.capacity) * 100),
            );
            return (
              <li
                key={slot.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                {/* Enroulée, sinon la barre d'actions déborde de 115 px à
                    320 px de large : elle était en shrink-0, donc elle refusait
                    de passer à la ligne. */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{slot.title}</p>
                    {slot.startAt && (
                      <p className="text-xs text-slate-500">
                        {formatDateTime(slot.startAt)}
                        {slot.endAt && (
                          <>
                            <span className="mx-1 text-slate-500">→</span>
                            {formatDateTime(slot.endAt)}
                          </>
                        )}
                      </p>
                    )}
                    {slot.description && (
                      <FormattedText
                        text={slot.description}
                        className="mt-0.5 text-sm text-slate-500"
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color={remaining > 0 ? "amber" : "green"}>
                      {slot.signups.length} inscrit
                      {slot.signups.length > 1 ? "s" : ""} sur {slot.capacity}
                    </Badge>
                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingId(
                              editingId === slot.id ? null : slot.id,
                            )
                          }
                          className="min-h-8 rounded px-1 text-xs font-semibold text-slate-600 transition-colors hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          {editingId === slot.id ? "Fermer" : "Modifier"}
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicateSlot(slot)}
                          disabled={busySlotId === slot.id}
                          className="min-h-8 rounded px-1 text-xs font-semibold text-slate-600 transition-colors hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
                        >
                          {busySlotId === slot.id ? "Copie…" : "Dupliquer"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSlot(slot.id)}
                          className="min-h-8 rounded px-1 text-xs font-semibold text-slate-600 transition-colors hover:text-coral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          Supprimer
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {canManage && editingId === slot.id && (
                  <form
                    onSubmit={(event) => saveSlot(slot.id, event)}
                    className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div>
                      <Label htmlFor={`edit-title-${slot.id}`}>
                        Intitulé du créneau / mission
                      </Label>
                      <Input
                        id={`edit-title-${slot.id}`}
                        name="title"
                        defaultValue={slot.title}
                        required
                        maxLength={200}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`edit-desc-${slot.id}`}>
                        Description (facultatif)
                      </Label>
                      <Textarea
                        id={`edit-desc-${slot.id}`}
                        name="description"
                        rows={2}
                        defaultValue={slot.description ?? ""}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <Label htmlFor={`edit-capacity-${slot.id}`}>
                          Nombre de bénévoles
                        </Label>
                        <Input
                          id={`edit-capacity-${slot.id}`}
                          name="capacity"
                          type="number"
                          min={Math.max(1, slot.signups.length)}
                          max={1000}
                          defaultValue={slot.capacity}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`edit-start-${slot.id}`}>Début</Label>
                        <Input
                          id={`edit-start-${slot.id}`}
                          name="startAt"
                          type="datetime-local"
                          defaultValue={toDatetimeLocal(slot.startAt)}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`edit-end-${slot.id}`}>Fin</Label>
                        <Input
                          id={`edit-end-${slot.id}`}
                          name="endAt"
                          type="datetime-local"
                          defaultValue={toDatetimeLocal(slot.endAt)}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={busySlotId === slot.id}
                      >
                        {busySlotId === slot.id ? "Enregistrement…" : "Enregistrer"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                      >
                        Annuler
                      </Button>
                    </div>
                  </form>
                )}

                <div
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-label={`Remplissage du créneau ${slot.title}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={fillRate}
                >
                  <span
                    className="block h-full rounded-full bg-sea-600"
                    style={{ width: `${fillRate}%` }}
                  />
                </div>

                {/* Les inscrits sont affichés, pas repliés.
                    Ils l'étaient derrière un <details> fermé, et leurs
                    coordonnées étaient écrites en slate-400 sur slate-50 —
                    2,45:1, soit la moitié du minimum lisible. Qui cherchait un
                    numéro de téléphone concluait qu'il n'avait pas été
                    enregistré, alors qu'il l'était depuis le début.
                    Le téléphone et l'adresse sont cliquables, comme du côté
                    des réunions : on consulte cette liste la veille, depuis un
                    téléphone, pour joindre quelqu'un. */}
                {slot.signups.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">
                      {slot.signups.length} personne
                      {slot.signups.length > 1 ? "s" : ""} inscrite
                      {slot.signups.length > 1 ? "s" : ""}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {slot.signups.map((signup) => (
                        <li
                          key={signup.id}
                          className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm"
                        >
                          <span className="min-w-0">
                            <span className="block font-bold text-slate-800">
                              {signup.name}
                            </span>
                            {signup.phone && (
                              <a
                                href={`tel:${signup.phone.replace(/[^+0-9]/g, "")}`}
                                className="mt-0.5 flex min-h-11 w-fit items-center rounded text-xs font-semibold text-slate-600 underline-offset-2 hover:text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                              >
                                {signup.phone}
                              </a>
                            )}
                            {signup.email && (
                              <a
                                href={`mailto:${signup.email}`}
                                className="mt-0.5 flex min-h-11 w-fit max-w-full items-center break-all rounded text-xs font-semibold text-slate-600 underline-offset-2 hover:text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                              >
                                {signup.email}
                              </a>
                            )}
                            {!signup.phone && !signup.email && (
                              <span className="mt-0.5 block text-xs font-medium text-slate-500">
                                Aucune coordonnée laissée
                              </span>
                            )}
                          </span>
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => removeSignup(signup.id)}
                              className="shrink-0 rounded px-1 text-xs font-semibold text-slate-500 transition-colors hover:text-coral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                            >
                              Retirer
                              <span className="sr-only"> {signup.name}</span>
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
