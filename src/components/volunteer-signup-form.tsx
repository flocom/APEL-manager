"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, Input, Label, Select } from "@/components/ui";
import { api } from "@/lib/client";
import { celebrate } from "@/lib/confetti";

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
      <div className="animate-pop rounded-2xl border border-sea-200 bg-gradient-to-b from-sea-50 to-white px-5 py-6 text-center">
        <div className="mx-auto mb-2 text-4xl">🎉</div>
        <p className="text-base font-semibold text-sea-800">
          Merci, votre inscription est bien enregistrée !
        </p>
        <p className="mt-1 text-sm text-slate-600">
          À très bientôt pour donner un coup de main. ⚓
        </p>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="mt-3 text-sm font-semibold text-brand-600 underline-offset-2 hover:underline"
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
          consent: form.get("consent") === "on",
          website: form.get("website"), // honeypot
        },
      });
      setDone(true);
      void celebrate();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
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
        <Input
          id="name"
          name="name"
          required
          autoComplete="name"
          defaultValue={defaultName}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            defaultValue={defaultEmail}
          />
        </div>
        <div>
          <Label htmlFor="phone">Téléphone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
          />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Indiquez au moins un e-mail ou un téléphone. L'e-mail permet de recevoir
        une confirmation et un rappel.
      </p>

      {/* Honeypot anti-bot : invisible pour les humains. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          name="consent"
          required
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <span>
          J'accepte que mes coordonnées soient utilisées par l'association pour
          organiser cet événement.{" "}
          <Link href="/confidentialite" className="text-brand-600 hover:underline" target="_blank">
            En savoir plus
          </Link>
        </span>
      </label>

      <Button type="submit" loading={loading} className="w-full">
        Je m'inscris
      </Button>
    </form>
  );
}
