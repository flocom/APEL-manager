import type { Metadata } from "next";
import { CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui";
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
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="mx-auto flex max-w-2xl flex-1 items-center px-4 py-12">
          <Card className="w-full p-8 text-center text-slate-600">
            <p className="text-lg font-medium text-slate-900">
              Lien d'inscription indisponible
            </p>
            <p className="mt-2 text-sm">
              Cet événement n'existe pas ou n'accepte pas d'inscriptions pour le
              moment.
            </p>
            <Link href="/" className="mt-4 inline-block text-brand-600 hover:underline">
              Retour à l'accueil
            </Link>
          </Card>
        </main>
      </div>
    );
  }

  const currentUser = await getCurrentUser();

  const slotOptions: SignupSlotOption[] = event.volunteerSlots.map((slot) => {
    const remaining = slot.capacity - slot.signups.length;
    const time = slot.startAt ? ` — ${formatDateTime(slot.startAt)}` : "";
    return {
      id: slot.id,
      label: `${slot.title}${time} (${remaining} place${remaining > 1 ? "s" : ""})`,
      remaining,
    };
  });

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-600">
          Appel aux bénévoles
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{event.title}</h1>
        <p className="mt-1 flex items-center gap-1.5 font-medium text-brand-700">
          <CalendarDays className="h-4 w-4" />
          {formatDateTime(event.startAt)}
        </p>
        {event.location && (
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            <MapPin className="h-4 w-4" />
            {event.location}
          </p>
        )}
        {event.description && (
          <p className="mt-3 whitespace-pre-line text-sm text-slate-600">
            {event.description}
          </p>
        )}

        <Card className="mt-6 p-6">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">
            Se proposer comme bénévole
          </h2>
          <p className="mb-5 text-sm text-slate-500">
            Choisissez un créneau et laissez vos coordonnées. Merci pour votre
            aide !
          </p>
          {event.volunteerSlots.length === 0 ? (
            <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">
              Aucun créneau de bénévolat n'est ouvert pour le moment. Revenez
              bientôt, les besoins seront précisés ici.
            </p>
          ) : (
            <VolunteerSignupForm
              token={token}
              slots={slotOptions}
              defaultName={currentUser?.name ?? ""}
              defaultEmail={currentUser?.email ?? ""}
            />
          )}
        </Card>
      </main>
    </div>
  );
}
