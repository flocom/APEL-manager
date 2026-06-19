"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Button, Input, Label, Textarea } from "@/components/ui";
import { api } from "@/lib/client";
import { formatDateTime } from "@/lib/dates";

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

  async function addSlot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const startRaw = form.get("startAt");
    try {
      await api(`/api/events/${eventId}/slots`, {
        body: {
          title: form.get("title"),
          description: form.get("description"),
          capacity: Number(form.get("capacity") || 1),
          startAt: startRaw ? startRaw : null,
          endAt: null,
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
        <h2 className="text-lg font-semibold text-slate-900">
          Bénévoles &amp; créneaux
        </h2>
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
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
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
              <Label htmlFor="slot-start">Horaire (facultatif)</Label>
              <Input id="slot-start" name="startAt" type="datetime-local" />
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
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-500">
          Aucun créneau de bénévolat. Ajoutez-en pour recueillir les inscriptions
          via le lien public.
        </p>
      ) : (
        <ul className="space-y-3">
          {slots.map((slot) => {
            const remaining = slot.capacity - slot.signups.length;
            return (
              <li
                key={slot.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{slot.title}</p>
                    {slot.startAt && (
                      <p className="text-xs text-slate-500">
                        {formatDateTime(slot.startAt)}
                      </p>
                    )}
                    {slot.description && (
                      <p className="mt-0.5 text-sm text-slate-500">
                        {slot.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge color={remaining > 0 ? "amber" : "green"}>
                      {slot.signups.length}/{slot.capacity}
                    </Badge>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => deleteSlot(slot.id)}
                        className="text-xs font-medium text-slate-400 hover:text-red-600"
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>

                {slot.signups.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                    {slot.signups.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="text-slate-700">
                          {s.name}
                          {(s.email || s.phone) && (
                            <span className="text-slate-400">
                              {" — "}
                              {[s.email, s.phone].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </span>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => removeSignup(s.id)}
                            className="text-xs text-slate-300 hover:text-red-600"
                          >
                            ✕
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
