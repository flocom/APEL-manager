import type { Metadata } from "next";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Link2Off,
  MapPin,
  UserCheck,
} from "lucide-react";
import Link from "next/link";

import { PresenceChangeConfirm } from "@/components/presence-change-confirm";
import { SiteHeader } from "@/components/site-header";
import { formatDateTime } from "@/lib/dates";
import { lireChangementDePresence } from "@/lib/services/meeting-attendance";

export const dynamic = "force-dynamic";

// Une page personnelle, atteinte par un lien reçu par e-mail : rien à indexer,
// et l'aperçu d'un lien transféré n'a pas à nommer la réunion.
export const metadata: Metadata = {
  title: "Confirmer ma réponse",
  robots: { index: false },
};

const REPONSES = {
  yes: "Je serai là",
  maybe: "Peut-être",
  no: "Je ne pourrai pas venir",
} as const;

/**
 * Confirmation d'un changement de réponse à une réunion.
 *
 * La page montre ce qui va changer et n'applique rien d'elle-même : c'est le
 * bouton qui confirme (voir `PresenceChangeConfirm`). Les cas d'échec disent
 * quoi faire plutôt que « lien invalide » tout court — le parent n'a qu'un
 * lien et doit savoir s'il doit recommencer.
 */
export default async function PresenceChangePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const lu = await lireChangementDePresence(token);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 items-center px-4 py-12 sm:px-6">
        <section className="w-full rounded-2xl border-2 border-slate-200 bg-white p-6 sm:p-8">
          {lu.etat !== "pret" ? (
            <div className="text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-950 text-white">
                <Link2Off className="h-7 w-7" />
              </span>
              <h1 className="mt-5 text-2xl font-black tracking-[-0.03em] text-brand-950">
                {lu.etat === "ferme"
                  ? "Les réponses sont closes"
                  : "Ce lien ne sert plus"}
              </h1>
              <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-slate-600">
                {lu.etat === "invalide"
                  ? "Il a expiré — il reste valable 48 heures — ou il est incomplet. Rien n’a été modifié : répondez à nouveau depuis la page de la réunion, un nouveau lien vous sera envoyé."
                  : lu.etat === "perime"
                    ? "Il a déjà servi, ou votre réponse a changé depuis qu’il a été envoyé. Rien n’a été modifié par ce lien."
                    : `La réunion « ${lu.titre} » n’accepte plus de réponses. Rien n’a été modifié.`}
              </p>
              <Link
                href="/"
                className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-950 px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
              >
                <ArrowLeft className="h-4 w-4" />
                Retour à l&apos;accueil
              </Link>
            </div>
          ) : (
            <div>
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-sea-200 text-brand-950">
                <UserCheck className="h-6 w-6" />
              </span>
              <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.14em] text-brand-700">
                Gestion de ma réponse
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-brand-950">
                Changer ma réponse
              </h1>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                Une nouvelle réponse a été envoyée avec votre adresse e-mail.
                Rien n&apos;a changé tant que vous ne l&apos;avez pas confirmée.
              </p>

              <div className="mt-6 rounded-2xl bg-brand-950 p-5 text-white">
                <p className="text-lg font-black tracking-[-0.02em]">
                  {lu.reunion.title}
                </p>
                <p className="mt-3 flex items-center gap-2 text-sm font-extrabold text-sea-200">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  {formatDateTime(lu.reunion.startAt)}
                </p>
                {lu.reunion.location && (
                  <p className="mt-2 flex items-center gap-2 text-sm font-extrabold text-sea-200">
                    <MapPin className="h-4 w-4 shrink-0" />
                    {lu.reunion.location}
                  </p>
                )}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
                <div className="rounded-xl border-2 border-slate-200 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                    Réponse actuelle
                  </p>
                  <p className="mt-1 text-base font-extrabold text-slate-900">
                    {REPONSES[lu.actuel.status]}
                  </p>
                  {lu.actuel.name && (
                    <p className="mt-1 break-words text-sm text-slate-600">
                      {lu.actuel.name}
                    </p>
                  )}
                </div>
                <ArrowRight
                  aria-hidden
                  className="mx-auto hidden h-5 w-5 text-brand-700 sm:block"
                />
                <div className="rounded-xl border-2 border-brand-300 bg-brand-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-700">
                    Nouvelle réponse
                  </p>
                  <p className="mt-1 text-base font-extrabold text-brand-950">
                    {REPONSES[lu.change.status]}
                  </p>
                  <p className="mt-1 break-words text-sm text-slate-700">
                    {lu.change.name}
                    {lu.change.phone ? ` · ${lu.change.phone}` : ""}
                  </p>
                </div>
              </div>

              <p className="mt-5 text-sm leading-6 text-slate-600">
                Ce n&apos;est pas vous ? Fermez simplement cette page : votre
                réponse reste telle quelle.
              </p>

              <div className="mt-5">
                <PresenceChangeConfirm
                  token={token}
                  confirmation="C’est fait : votre réponse est mise à jour. Un e-mail de confirmation vous a été envoyé."
                />
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
