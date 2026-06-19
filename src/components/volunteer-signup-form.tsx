"use client";

import { useState } from "react";

import { Button, Input, Label, Select } from "@/components/ui";
import { api } from "@/lib/client";

export interface SignupSlotOption {
  id: string;
  label: string;
  remaining: number;
}

export function VolunteerSignupForm({
  token,
  slots,
  defaultName = "",
  defaultEmail = "",
}: {
  token: string;
  slots: SignupSlotOption[];
  defaultName?: string;
  defaultEmail?: string;
}) {
  const available = slots.filter((s) => s.remaining > 0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (available.length === 0) {
    return (
      <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">
        Tous les créneaux sont actuellement complets. Merci de votre intérêt !
      </p>
    );
  }

  if (done) {
    return (
      <div className="rounded-lg bg-green-50 px-4 py-4 text-sm text-green-800">
        <p className="font-medium">Merci, votre inscription est enregistrée ! 🎉</p>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="mt-2 font-medium text-green-700 underline"
        >
          Inscrire une autre personne
        </button>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/signup", {
        body: {
          token,
          slotId: form.get("slotId"),
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
        },
      });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
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
        <Label htmlFor="slotId">Créneau / mission</Label>
        <Select id="slotId" name="slotId" required defaultValue="">
          <option value="" disabled>
            Choisir un créneau…
          </option>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="name">Votre nom</Label>
        <Input id="name" name="name" required defaultValue={defaultName} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="email">E-mail (facultatif)</Label>
          <Input id="email" name="email" type="email" defaultValue={defaultEmail} />
        </div>
        <div>
          <Label htmlFor="phone">Téléphone (facultatif)</Label>
          <Input id="phone" name="phone" type="tel" />
        </div>
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Enregistrement…" : "Je m'inscris"}
      </Button>
    </form>
  );
}
