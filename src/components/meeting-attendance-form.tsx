"use client";

import { Check, HelpCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button, Input, Label } from "@/components/ui";
import { api } from "@/lib/client";
import { celebrate } from "@/lib/confetti";
import { useRecaptcha } from "@/lib/use-recaptcha";

/**
 * « Je serai là » depuis la page publique d'une réunion.
 *
 * Deux réponses seulement, là où les membres en ont trois : un parent qui ne
 * compte pas venir ferme la page, il ne remplit pas un formulaire pour le dire.
 * Se décommander passe par le lien de l'e-mail de confirmation.
 *
 * La réponse est demandée avant les coordonnées, et « Je serai là » est
 * présélectionné : c'est le geste attendu, il ne doit pas coûter un clic
 * supplémentaire à celui qui a déjà décidé de venir.
 *
 * Les fonds des choix sélectionnés sont pris deux crans plus foncés que la
 * teinte « naturelle » de la palette : du blanc sur sea-500 tombe à 2,89:1 et
 * sur sand-500 à 3,31:1, sous le seuil AA pour du texte de cette taille.
 */

const CHOIX = [
  {
    valeur: "yes" as const,
    titre: "Je serai là",
    detail: "Comptez sur moi",
    icone: Check,
    actif: "border-sea-700 bg-sea-700 text-white",
    detailActif: "text-sea-50",
  },
  {
    valeur: "maybe" as const,
    titre: "Peut-être",
    detail: "Je ne sais pas encore",
    icone: HelpCircle,
    actif: "border-sand-700 bg-sand-700 text-white",
    detailActif: "text-sand-100",
  },
];

export function MeetingAttendanceForm({
  token,
  defaultName = "",
  defaultEmail = "",
  recaptchaSiteKey = null,
  whatsappGroupUrl = null,
}: {
  /** Jeton de partage de la réunion. */
  token: string;
  defaultName?: string;
  defaultEmail?: string;
  recaptchaSiteKey?: string | null;
  whatsappGroupUrl?: string | null;
}) {
  const executerRecaptcha = useRecaptcha(recaptchaSiteKey);
  const [status, setStatus] = useState<"yes" | "maybe">("yes");
  const [done, setDone] = useState<"yes" | "maybe" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (done) {
    return (
      <div className="animate-pop rounded-2xl border-2 border-sea-200 bg-sea-50 px-5 py-6 text-center">
        <div className="mx-auto mb-2 text-4xl">{done === "yes" ? "🎉" : "👍"}</div>
        <p className="text-base font-semibold text-sea-800">
          {done === "yes"
            ? "C’est noté, on vous attend !"
            : "C’est noté : peut-être, et c’est déjà utile."}
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Vous recevrez un e-mail de confirmation, avec un lien pour vous
          décommander si besoin. Venir sans avoir répondu reste possible.
        </p>
        {whatsappGroupUrl && (
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Les rappels et les changements de dernière minute passent par le{" "}
            <a
              href={whatsappGroupUrl}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-brand-800 underline"
            >
              groupe WhatsApp de l’association
              <span className="sr-only"> (ouvre WhatsApp dans un nouvel onglet)</span>
            </a>
            .
          </p>
        )}
        <button
          type="button"
          onClick={() => setDone(null)}
          className="mt-3 text-sm font-semibold text-brand-600 underline-offset-2 hover:underline"
        >
          Annoncer quelqu’un d’autre
        </button>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const choisi = status;
    try {
      await api("/api/meetings/attendance", {
        body: {
          token,
          status: choisi,
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
          consent: form.get("consent") === "on",
          website: form.get("website"), // pot de miel
          recaptchaToken: await executerRecaptcha("inscription"),
        },
      });
      setDone(choisi);
      if (choisi === "yes") void celebrate();
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

      <fieldset>
        <legend className="mb-2 block text-sm font-semibold text-slate-700">
          Vous venez ?
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CHOIX.map(({ valeur, titre, detail, icone: Icone, actif, detailActif }) => {
            const selectionne = status === valeur;
            return (
              <label
                key={valeur}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 transition-colors focus-within:ring-4 focus-within:ring-brand-200 ${
                  selectionne
                    ? actif
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="status"
                  value={valeur}
                  checked={selectionne}
                  onChange={() => setStatus(valeur)}
                  className="sr-only"
                />
                <Icone className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold">{titre}</span>
                  <span
                    className={`block text-xs font-medium ${
                      selectionne ? detailActif : "text-slate-500"
                    }`}
                  >
                    {detail}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

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
        Indiquez au moins un e-mail ou un téléphone. L’e-mail permet de recevoir
        la confirmation et d’être prévenu si la réunion est déplacée.
      </p>

      {/* Pot de miel anti-robot : invisible pour les humains. */}
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
          J’accepte que mes coordonnées soient utilisées par l’association pour
          organiser cette réunion.{" "}
          <Link href="/confidentialite" className="text-brand-600 hover:underline" target="_blank">
            En savoir plus
          </Link>
        </span>
      </label>

      <Button type="submit" loading={loading} className="w-full">
        {status === "yes" ? "Je serai là" : "Peut-être, prévenez-moi"}
      </Button>
    </form>
  );
}
