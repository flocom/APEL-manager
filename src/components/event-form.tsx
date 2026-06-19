"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/client";
import { toDatetimeLocal } from "@/lib/dates";
import type { Event } from "@/lib/db/schema";

export function EventForm({ event }: { event?: Event }) {
  const router = useRouter();
  const editing = Boolean(event);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const endRaw = form.get("endAt");
    const body = {
      title: form.get("title"),
      description: form.get("description"),
      location: form.get("location"),
      startAt: form.get("startAt"),
      endAt: endRaw ? endRaw : null,
      status: form.get("status"),
    };

    try {
      if (editing && event) {
        await api(`/api/events/${event.id}`, { method: "PATCH", body });
        router.push(`/dashboard/events/${event.id}`);
      } else {
        const res = await api<{ id: string }>("/api/events", { body });
        router.push(`/dashboard/events/${res.id}`);
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div>
        <Label htmlFor="title">Titre de l'événement</Label>
        <Input
          id="title"
          name="title"
          required
          defaultValue={event?.title}
          placeholder="Ex. Vide-grenier de printemps"
        />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={event?.description ?? ""}
          placeholder="Détails, organisation, infos pratiques…"
        />
      </div>
      <div>
        <Label htmlFor="location">Lieu</Label>
        <Input
          id="location"
          name="location"
          defaultValue={event?.location ?? ""}
          placeholder="Ex. Cour de l'école"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="startAt">Début</Label>
          <Input
            id="startAt"
            name="startAt"
            type="datetime-local"
            required
            defaultValue={toDatetimeLocal(event?.startAt)}
          />
        </div>
        <div>
          <Label htmlFor="endAt">Fin (facultatif)</Label>
          <Input
            id="endAt"
            name="endAt"
            type="datetime-local"
            defaultValue={toDatetimeLocal(event?.endAt)}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="status">Statut</Label>
        <Select id="status" name="status" defaultValue={event?.status ?? "draft"}>
          <option value="draft">Brouillon (non visible publiquement)</option>
          <option value="published">Publié (visible sur l'accueil)</option>
          <option value="archived">Archivé</option>
        </Select>
      </div>
      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Enregistrement…" : editing ? "Enregistrer" : "Créer l'événement"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
