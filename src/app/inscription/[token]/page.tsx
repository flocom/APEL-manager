import type { Metadata } from "next";
import {
  ArrowLeft,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  Hand,
  MapPin,
} from "lucide-react";
import Link from "next/link";

import { FormattedText } from "@/components/formatted-text";
import { SiteHeader } from "@/components/site-header";
import {
  VolunteerSignupForm,
  type SignupSlotOption,
} from "@/components/volunteer-signup-form";
import { getCurrentUser } from "@/lib/auth/session";
import { getEventByShareToken } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const event = await getEventByShareToken(token);
  if (!event) return { title: "Inscription bénévole" };
  const desc = `${formatDateTime(event.startAt)}${
    event.location ? ` · ${event.location}` : ""
  } — proposez-vous comme bénévole.`;
  return {
    title: event.title,
    description: desc,
    openGraph: { title: event.title, description: desc, type: "website" },
  };
}

export default async function InscriptionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const event = await getEventByShareToken(token);

  if (!event || event.status !== "published") {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-2xl flex-1 items-center px-4 py-12 sm:px-6">
          <section className="w-full rounded-2xl border-2 border-slate-200 bg-white p-8 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-950 text-white">
              <CalendarX2 className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-2xl font-black tracking-[-0.03em] text-brand-950">
              Lien d&apos;inscription indisponible
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-slate-600">
              Cet événement n&apos;existe pas ou n&apos;accepte pas
              d&apos;inscriptions pour le moment.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-950 px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              Retour à l&apos;accueil
            </Link>
          </section>
        </main>
      </div>
    );
  }

  const currentUser = await getCurrentUser();

  const slotOptions: SignupSlotOption[] = event.volunteerSlots.map((slot) => {
    const remaining = Math.max(0, slot.capacity - slot.signups.length);
    const time = slot.startAt ? ` — ${formatDateTime(slot.startAt)}` : "";
    return {
      id: slot.id,
      label: `${slot.title}${time} (${remaining} place${remaining > 1 ? "s" : ""})`,
      remaining,
    };
  });

  const availablePlaces = slotOptions.reduce(
    (sum, slot) => sum + slot.remaining,
    0,
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/#evenements"
          className="mb-5 inline-flex items-center gap-2 rounded-lg text-sm font-extrabold text-brand-800 transition-colors hover:text-brand-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Tous les événements
        </Link>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
          <aside className="relative overflow-hidden rounded-2xl bg-brand-950 p-6 text-white sm:p-8 lg:sticky lg:top-28">
            <div
              aria-hidden="true"
              className="absolute -right-12 -top-12 h-36 w-36 rounded-full border-[26px] border-brand-800"
            />
            <div
              aria-hidden="true"
              className="absolute bottom-8 right-8 h-3 w-20 -rotate-6 rounded-sm bg-sea-500"
            />

            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-lg bg-sea-200 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-brand-950">
                <Hand className="h-4 w-4" />
                Appel aux bénévoles
              </span>
              <h1 className="mt-6 text-3xl font-black leading-tight tracking-[-0.04em] sm:text-4xl">
                {event.title}
              </h1>

              <div className="mt-7 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-brand-950">
                    <CalendarDays className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-300">
                      Date et heure
                    </p>
                    <p className="mt-1 text-sm font-extrabold text-white">
                      {formatDateTime(event.startAt)}
                    </p>
                  </div>
                </div>
                {event.location && (
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-brand-950">
                      <MapPin className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-300">
                        Lieu
                      </p>
                      <p className="mt-1 text-sm font-extrabold text-white">
                        {event.location}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {event.publicDescription && (
                <FormattedText
                  text={event.publicDescription}
                  className="mt-7 border-t-2 border-brand-800 pt-6 text-sm font-medium leading-6 text-brand-100"
                />
              )}

              <div className="mt-7 flex items-center gap-3 rounded-2xl bg-brand-900 p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-sea-200" />
                <p className="text-sm font-semibold text-brand-100">
                  {availablePlaces} place{availablePlaces > 1 ? "s" : ""} encore
                  disponible{availablePlaces > 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </aside>

          <section className="rounded-2xl border-2 border-slate-200 bg-white p-6 sm:p-8">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-700">
              Ma participation
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.035em] text-brand-950 sm:text-3xl">
              Je donne un coup de main
            </h2>
            <p className="mb-6 mt-2 text-sm font-medium leading-6 text-slate-600">
              Choisissez une mission et laissez vos coordonnées. Cela prend
              moins d&apos;une minute.
            </p>
            {event.volunteerSlots.length === 0 ? (
              <p className="rounded-xl bg-slate-100 px-4 py-4 text-sm font-medium leading-6 text-slate-600">
                Aucun créneau de bénévolat n&apos;est ouvert pour le moment.
                Revenez bientôt, les besoins seront précisés ici.
              </p>
            ) : (
              <VolunteerSignupForm
                token={token}
                slots={slotOptions}
                defaultName={currentUser?.name ?? ""}
                defaultEmail={currentUser?.email ?? ""}
              />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
