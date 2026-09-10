import {
  ArrowLeft,
  CalendarDays,
  CircleAlert,
  Link2Off,
  MapPin,
} from "lucide-react";
import Link from "next/link";

import { CancelSignup } from "@/components/cancel-signup";
import { SiteHeader } from "@/components/site-header";
import {
  getMeetingAttendanceByCancelToken,
  getSignupByCancelToken,
} from "@/lib/data";
import { formatDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * Retrait par lien public. Le même jeton peut désigner un créneau de bénévole
 * ou une présence annoncée à une réunion : la page reconnaît les deux, parce
 * que le parent n'a qu'un lien au bas d'un e-mail.
 */
export default async function CancelPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const signup = await getSignupByCancelToken(token);
  const presence = signup ? null : await getMeetingAttendanceByCancelToken(token);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 items-center px-4 py-12 sm:px-6">
        <section className="w-full rounded-2xl border-2 border-slate-200 bg-white p-6 sm:p-8">
          {!signup && !presence ? (
            <div className="text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-950 text-white">
                <Link2Off className="h-7 w-7" />
              </span>
              <h1 className="mt-5 text-2xl font-black tracking-[-0.03em] text-brand-950">
                Lien invalide
              </h1>
              <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-slate-600">
                Cette inscription n&apos;existe pas ou a déjà été annulée.
              </p>
              <Link
                href="/"
                className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-950 px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
              >
                <ArrowLeft className="h-4 w-4" />
                Retour à l&apos;accueil
              </Link>
            </div>
          ) : presence ? (
            <div>
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-sea-200 text-brand-950">
                <CircleAlert className="h-6 w-6" />
              </span>
              <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.14em] text-brand-700">
                Gestion de ma réponse
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-brand-950">
                Retirer ma réponse
              </h1>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                Vous aviez annoncé votre venue à la réunion suivante.
              </p>

              <div className="mt-6 rounded-2xl bg-brand-950 p-5 text-white">
                <p className="text-lg font-black tracking-[-0.02em]">
                  {presence.event.title}
                </p>
                <p className="mt-3 flex items-center gap-2 text-sm font-extrabold text-sea-200">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  {formatDateTime(presence.event.startAt)}
                </p>
                {presence.event.location && (
                  <p className="mt-2 flex items-center gap-2 text-sm font-extrabold text-sea-200">
                    <MapPin className="h-4 w-4 shrink-0" />
                    {presence.event.location}
                  </p>
                )}
              </div>

              <div className="mt-6 rounded-xl border-2 border-brand-200 bg-brand-50 p-4">
                <p className="text-sm font-semibold leading-6 text-brand-900">
                  Votre nom sera retiré de la liste des présents. La réunion
                  vous reste ouverte : vous pouvez venir sans prévenir, et
                  répondre à nouveau depuis la page de la réunion.
                </p>
              </div>

              <div className="mt-5">
                <CancelSignup
                  token={token}
                  label="Retirer ma réponse"
                  confirmation="C’est fait, votre réponse est retirée. Merci de nous avoir prévenus !"
                />
              </div>
            </div>
          ) : (
            <div>
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-sea-200 text-brand-950">
                <CircleAlert className="h-6 w-6" />
              </span>
              <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.14em] text-brand-700">
                Gestion de ma participation
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-brand-950">
                Annuler mon inscription
              </h1>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                Vous êtes inscrit·e comme bénévole pour l&apos;événement
                suivant.
              </p>

              <div className="mt-6 rounded-2xl bg-brand-950 p-5 text-white">
                <p className="text-lg font-black tracking-[-0.02em]">
                  {signup!.slot.event.title}
                </p>
                <p className="mt-3 flex items-center gap-2 text-sm font-extrabold text-sea-200">
                  <CalendarDays className="h-4 w-4" />
                  {formatDateTime(signup!.slot.event.startAt)}
                </p>
                <div className="mt-4 border-t-2 border-brand-800 pt-4">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-300">
                    Votre mission
                  </p>
                  <p className="mt-1 text-sm font-extrabold text-white">
                    {signup!.slot.title}
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-xl border-2 border-brand-200 bg-brand-50 p-4">
                <p className="text-sm font-semibold leading-6 text-brand-900">
                  Confirmez-vous vouloir vous désinscrire ? Cette place sera de
                  nouveau proposée aux autres parents.
                </p>
              </div>

              <div className="mt-5">
                <CancelSignup token={token} />
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
