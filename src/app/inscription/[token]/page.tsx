import type { Metadata } from "next";
import {
  ArrowLeft,
  CalendarDays,
  CalendarX2,
  ExternalLink,
  Hand,
  MapPin,
  Ticket,
} from "lucide-react";
import Link from "next/link";

import { FormattedText } from "@/components/formatted-text";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getAssociationSettings } from "@/lib/services/association-settings";
import {
  VolunteerSignupForm,
  type SignupSlotOption,
} from "@/components/volunteer-signup-form";
import { getCurrentUser } from "@/lib/auth/session";
import { getEventByShareToken } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { ticketingHostLabel } from "@/lib/ticketing";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const event = await getEventByShareToken(token);
  if (!event) return { title: "Inscription bénévole" };
  // Ce texte est l'aperçu affiché quand le lien circule dans un groupe de
  // classe : n'annoncer que le bénévolat ferait manquer la page aux familles
  // qui voulaient réserver.
  const action = event.ticketingUrl
    ? "réservez votre place ou donnez un coup de main."
    : "proposez-vous comme bénévole.";
  const desc = `${formatDateTime(event.startAt)}${
    event.location ? ` · ${event.location}` : ""
  } — ${action}`;
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

  const [currentUser, association] = await Promise.all([
    getCurrentUser(),
    getAssociationSettings(),
  ]);

  const slotOptions: SignupSlotOption[] = event.volunteerSlots.map((slot) => {
    const remaining = Math.max(0, slot.capacity - slot.signups.length);
    const time = slot.startAt ? ` — ${formatDateTime(slot.startAt)}` : "";
    return {
      id: slot.id,
      // « bénévole recherché », jamais « place » : lu au moment de choisir, le
      // mot ferait prendre un créneau de buvette pour une entrée réservée.
      label: `${slot.title}${time} · ${remaining} bénévole${remaining > 1 ? "s" : ""} recherché${remaining > 1 ? "s" : ""}`,
      remaining,
    };
  });

  const availablePlaces = slotOptions.reduce(
    (sum, slot) => sum + slot.remaining,
    0,
  );
  // `trim()` : un espace collé depuis un traitement de texte est truthy, et
  // afficherait un bouton « Réserver » qui ne mène nulle part.
  const billetterie = event.ticketingUrl?.trim() || null;
  const hote = ticketingHostLabel(billetterie) ?? "la billetterie en ligne";
  const aDesCreneaux = event.volunteerSlots.length > 0;

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
          <aside className="relative overflow-hidden rounded-2xl bg-brand-950 text-white lg:sticky lg:top-28">
            <div
              aria-hidden="true"
              className="absolute -right-12 -top-12 h-36 w-36 rounded-full border-[26px] border-brand-800"
            />
            <div
              aria-hidden="true"
              className={`absolute bottom-8 right-8 h-3 w-20 -rotate-6 rounded-sm ${
                billetterie ? "bg-brand-800" : "bg-sea-500"
              }`}
            />

            {/* Le padding est porté ici, et non par l'aside : c'est ce qui
                permet au bandeau de billetterie de le déborder en -mx-6. */}
            <div className="relative p-6 sm:p-8">
              <span className="inline-flex items-center gap-2 rounded-lg bg-sea-200 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-brand-950">
                {billetterie ? (
                  <>
                    <Ticket className="h-4 w-4" />
                    {aDesCreneaux ? "Billetterie et bénévoles" : "Billetterie en ligne"}
                  </>
                ) : (
                  <>
                    <Hand className="h-4 w-4" />
                    Appel aux bénévoles
                  </>
                )}
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

              {/* Venir et aider sont deux démarches distinctes : elles sont
                  séparées par le contenant — bande turquoise traversante d'un
                  côté, carte blanche du formulaire de l'autre — et non par la
                  couleur d'un bouton, qui ne survivrait ni au daltonisme ni au
                  niveau de gris. La bande est ici, avant la description : sa
                  position ne dépend donc pas de la longueur du texte saisi. */}
              {billetterie && (
                <section
                  aria-labelledby="billetterie-titre"
                  className="-mx-6 mt-6 border-y-2 border-sea-500 bg-sea-300 px-6 py-4 sm:-mx-8 sm:mt-7 sm:px-8 sm:py-5"
                >
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-sea-800">
                    Venir à l’événement
                  </p>
                  <h2
                    id="billetterie-titre"
                    className="mt-1.5 text-xl font-black tracking-[-0.03em] text-brand-950 sm:text-2xl"
                  >
                    Je réserve ma place
                  </h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-brand-900">
                    La réservation se fait sur {hote}, la plateforme utilisée par
                    l’association. Vous y choisissez vos places et réglez en
                    ligne s’il y a un tarif.
                  </p>
                  <a
                    href={billetterie}
                    target="_blank"
                    rel="noopener noreferrer external"
                    className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-950 px-5 py-3 text-center text-sm font-extrabold text-white transition-colors hover:bg-brand-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-950 focus-visible:ring-offset-2 focus-visible:ring-offset-sea-300 sm:w-auto"
                  >
                    <Ticket className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Réserver sur {hote}</span>
                    <ExternalLink
                      className="h-4 w-4 shrink-0 opacity-70"
                      aria-hidden="true"
                    />
                    <span className="sr-only"> (ouvre un nouvel onglet)</span>
                  </a>
                  <p className="mt-3 text-xs font-medium leading-5 text-sea-900">
                    Vous quittez le site de l’association. {hote} vous enverra
                    votre confirmation : elle n’apparaîtra pas sur cette page.
                  </p>
                  <p className="mt-2 text-xs font-semibold leading-5 text-brand-900">
                    Réserver ne vous inscrit pas comme bénévole : ce sont deux
                    démarches indépendantes.
                  </p>
                </section>
              )}

              {event.publicDescription && (
                <FormattedText
                  text={event.publicDescription}
                  className={`text-sm font-medium leading-6 text-brand-100 ${
                    billetterie
                      ? "mt-6"
                      : "mt-7 border-t-2 border-brand-800 pt-6"
                  }`}
                />
              )}

              {/* Sans ce garde, un événement à billetterie seule afficherait
                  « 0 coup de main » à côté du bouton « Réserver » : le parent
                  lit « complet » et referme. */}
              {aDesCreneaux && (
                <div className="mt-7 flex items-center gap-3 rounded-2xl bg-brand-900 p-4">
                  <Hand
                    className="h-5 w-5 shrink-0 text-brand-300"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold text-brand-100">
                    {availablePlaces > 0
                      ? `${availablePlaces} coup${availablePlaces > 1 ? "s" : ""} de main encore recherché${availablePlaces > 1 ? "s" : ""}`
                      : "Toutes les missions sont pourvues, merci !"}
                  </p>
                </div>
              )}
            </div>
          </aside>

          <section className="rounded-2xl border-2 border-slate-200 bg-white p-6 sm:p-8">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-700">
              Aider à l’organisation
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.035em] text-brand-950 sm:text-3xl">
              Je donne un coup de main
            </h2>
            <p className="mb-6 mt-2 text-sm font-medium leading-6 text-slate-600">
              {billetterie ? (
                <>
                  Choisissez une mission et laissez vos coordonnées. Gratuit,
                  sans compte, en moins d’une minute. Cela ne réserve pas votre
                  place à l’événement — pour venir, c’est «&nbsp;Je réserve ma
                  place&nbsp;».
                </>
              ) : (
                <>
                  Choisissez une mission et laissez vos coordonnées. Cela prend
                  moins d’une minute.
                </>
              )}
            </p>
            {event.volunteerSlots.length === 0 ? (
              <p className="rounded-xl bg-slate-100 px-4 py-4 text-sm font-medium leading-6 text-slate-600">
                {billetterie ? (
                  <>
                    Aucun créneau de bénévolat n’est ouvert pour l’instant.
                    Votre réservation, elle, est déjà possible : c’est «&nbsp;Je
                    réserve ma place&nbsp;».
                  </>
                ) : (
                  <>
                    Aucun créneau de bénévolat n’est ouvert pour le moment.
                    Revenez bientôt, les besoins seront précisés ici.
                  </>
                )}
              </p>
            ) : (
              <VolunteerSignupForm
                token={token}
                slots={slotOptions}
                recaptchaSiteKey={
                  association.recaptchaReady ? association.recaptchaSiteKey : null
                }
                defaultName={currentUser?.name ?? ""}
                defaultEmail={currentUser?.email ?? ""}
                whatsappGroupUrl={association.whatsappGroupUrl}
                ticketingUrl={billetterie}
                ticketingHost={hote}
              />
            )}
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
