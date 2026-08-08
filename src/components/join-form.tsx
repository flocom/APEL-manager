"use client";

import { Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { api } from "@/lib/client";
import { useRecaptcha } from "@/lib/use-recaptcha";

export function JoinForm({
  contactEmail,
  recaptchaSiteKey = null,
}: {
  contactEmail: string | null;
  recaptchaSiteKey?: string | null;
}) {
  const executerRecaptcha = useRecaptcha(recaptchaSiteKey);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/join", {
        body: {
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone") || undefined,
          message: form.get("message"),
          consent: form.get("consent") === "on",
          website: form.get("website"),
          recaptchaToken: await executerRecaptcha("contact"),
        },
      });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border-2 border-sea-300 bg-sea-50 p-6">
        <p className="text-lg font-black tracking-[-0.02em] text-brand-950">
          Message envoyé, merci !
        </p>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-700">
          Un parent de l’équipe vous répondra par e-mail. Sans nouvelles d’ici
          quelques jours, n’hésitez pas à relancer
          {contactEmail ? (
            <>
              {" "}
              à{" "}
              <a
                className="font-bold text-brand-800 underline"
                href={`mailto:${contactEmail}`}
              >
                {contactEmail}
              </a>
            </>
          ) : null}
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <p className="rounded-xl bg-coral-50 px-4 py-3 text-sm font-semibold text-coral-800">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-slate-700">
            Votre nom
          </span>
          <input
            name="name"
            required
            minLength={2}
            autoComplete="name"
            className="min-h-11 w-full rounded-xl border-2 border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-brand-600 focus:outline-none"
            placeholder="Prénom et nom"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-slate-700">
            Votre e-mail
          </span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="min-h-11 w-full rounded-xl border-2 border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-brand-600 focus:outline-none"
            placeholder="prenom.nom@example.fr"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-bold text-slate-700">
          Votre téléphone (facultatif)
        </span>
        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          className="min-h-11 w-full rounded-xl border-2 border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-brand-600 focus:outline-none"
          placeholder="06 12 34 56 78"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-bold text-slate-700">
          Votre message
        </span>
        <textarea
          name="message"
          required
          minLength={10}
          rows={5}
          className="w-full rounded-xl border-2 border-slate-200 px-3.5 py-2.5 text-sm font-medium leading-6 text-slate-900 focus:border-brand-600 focus:outline-none"
          placeholder="Dites-nous ce qui vous intéresse : donner un coup de main de temps en temps, rejoindre le bureau, proposer une idée…"
        />
      </label>

      {/* Piège à robots : invisible, doit rester vide. */}
      <div aria-hidden="true" className="absolute left-[-9999px]">
        <label>
          Ne pas remplir
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="consent"
          required
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-2 border-slate-300 accent-[#0873ab]"
        />
        <span className="text-sm font-medium leading-6 text-slate-600">
          J’accepte que mes coordonnées soient utilisées pour me répondre,
          conformément à la{" "}
          <Link
            href="/confidentialite"
            className="font-bold text-brand-800 underline"
          >
            politique de confidentialité
          </Link>
          .
        </span>
      </label>

      <button
        type="submit"
        disabled={loading}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-950 px-5 py-3 text-sm font-extrabold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60"
      >
        <Send className="h-4 w-4" aria-hidden="true" />
        {loading ? "Envoi…" : "Envoyer le message"}
      </button>
    </form>
  );
}
