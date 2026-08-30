import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Coins,
  Hand,
  HeartHandshake,
  Mail,
  MapPin,
  MessagesSquare,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { JoinForm } from "@/components/join-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getUpcomingPublishedEvents } from "@/lib/data";
import { formatDateTime, formatLongDateTime } from "@/lib/dates";
import { getAssociationSettings } from "@/lib/services/association-settings";

export const dynamic = "force-dynamic";

/**
 * Page publique « Rejoindre l'association ».
 *
 * Elle s'adresse à un parent qui ne connaît personne : elle répond d'abord à ce
 * qui le retient, montre ensuite que l'association existe pour de vrai — les
 * rendez-vous réellement publiés, les places qui restent — puis lui laisse deux
 * portes, l'une basse (prendre un créneau sans compte), l'autre écrite.
 *
 * Règle de confidentialité : getUpcomingPublishedEvents() rapporte aussi les
 * inscriptions des bénévoles (nom, e-mail, jeton d'annulation). Tout reste dans
 * ce composant serveur ; ne transmettre à un composant client que des primitives
 * déjà calculées, jamais un événement ou un créneau entier.
 */

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getAssociationSettings();
  const title = `Rejoindre ${settings.associationName}`;
  const description = `Ce que fait ${settings.associationName} à ${settings.schoolName}, et comment y prendre part — sans engagement.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
  };
}

const OBJECTIONS = [
  {
    phrase: "Je n’ai pas le temps.",
    reponse:
      "Personne n’en a. C’est pour ça que tout est découpé en créneaux courts, annoncés à l’avance. Deux heures un samedi matin, une fois dans l’année, c’est déjà un vrai coup de main — et personne ici ne tient le compte des heures des autres.",
  },
  {
    phrase: "Je ne connais personne.",
    reponse:
      "C’est exactement ce que préparer quelque chose ensemble règle en une matinée. On installe à deux, on sert à trois, on range à plusieurs, et on repart en connaissant des visages. Les familles qui viennent d’arriver entrent souvent par là.",
  },
  {
    phrase: "Je ne saurais pas quoi faire.",
    reponse:
      "Il n’y a rien à savoir d’avance. Chaque créneau porte un intitulé, un horaire et le nombre de personnes attendues : vous choisissez celui qui vous va, et on vous montre en arrivant.",
  },
  {
    phrase: "Et si je dis oui, puis que je ne peux plus ?",
    reponse:
      "Ça arrive, et c’est prévu. L’e-mail de confirmation contient un lien qui retire votre inscription en un clic, sans avoir à vous justifier ni à prévenir qui que ce soit.",
  },
];

const MISSIONS = [
  {
    icon: CalendarDays,
    numero: "01",
    titre: "Les temps forts de l’année",
    texte:
      "L’association monte les rendez-vous qui font l’année des enfants : ceux qu’on prépare des semaines à l’avance et dont ils parlent encore en juin.",
  },
  {
    icon: Coins,
    numero: "02",
    titre: "Les projets des classes",
    texte:
      "Ce que rapportent les ventes et les événements repart vers les classes : sorties, spectacles, matériel.",
  },
  {
    icon: MessagesSquare,
    numero: "03",
    titre: "La voix des parents",
    texte:
      "L’association représente les familles auprès de la direction et fait remonter ce qui compte pour elles. Une voix collective porte plus loin qu’un mot dans un carnet.",
  },
  {
    icon: Users,
    numero: "04",
    titre: "Le lien entre les familles",
    texte:
      "On prépare ensemble, on discute en rangeant, et l’école devient un endroit où l’on connaît des visages.",
  },
];

const ETAPES = [
  {
    titre: "Vous écrivez",
    texte: "Deux ou trois lignes suffisent : qui vous êtes, ce qui vous intrigue.",
  },
  {
    titre: "On vous répond",
    texte: "Un parent de l’équipe vous répond par e-mail.",
  },
  {
    titre: "Vous décidez",
    texte:
      "Rien n’est engagé tant que vous n’avez pas dit oui. Ce message n’est ni une adhésion ni une inscription, et il n’y a rien à payer sur cette page.",
  },
];

const AMORCES = [
  "Je peux venir donner un coup de main sur un événement, prévenez-moi.",
  "Je ne sais pas encore, j’aimerais surtout savoir ce qui se prépare.",
  "J’aimerais m’impliquer davantage, comment ça marche ?",
];

/** Teintes des tuiles de mission, pour éviter quatre boîtes blanches identiques. */
const TEINTES_MISSIONS = [
  {
    fond: "bg-brand-950 text-white",
    pastille: "bg-white text-brand-950",
    numero: "text-brand-300",
    texte: "text-brand-100",
  },
  {
    fond: "bg-brand-100 text-brand-950",
    pastille: "bg-brand-950 text-white",
    numero: "text-brand-800",
    texte: "text-brand-900",
  },
  {
    fond: "bg-sea-200 text-brand-950",
    pastille: "bg-brand-950 text-white",
    numero: "text-brand-700",
    texte: "text-brand-950",
  },
  {
    fond: "bg-brand-950 text-white",
    pastille: "bg-white text-brand-950",
    numero: "text-brand-300",
    texte: "text-brand-100",
  },
];

export default async function RejoindrePage() {
  const [settings, events] = await Promise.all([
    getAssociationSettings(),
    getUpcomingPublishedEvents(),
  ]);

  // Agrégats calculés ici, côté serveur : rien de ce qui vient de la base ne
  // descend jusqu'au navigateur en dehors de ces nombres et de ces chaînes.
  const placesOuvertes = events.reduce(
    (total, event) =>
      total +
      event.volunteerSlots.reduce(
        (somme, slot) => somme + Math.max(0, slot.capacity - slot.signups.length),
        0,
      ),
    0,
  );
  const prochains = events.slice(0, 3).map((event, index) => ({
    id: event.id,
    titre: event.title,
    date: formatDateTime(event.startAt),
    lieu: event.location,
    jeton: event.shareToken,
    restantes: event.volunteerSlots.reduce(
      (somme, slot) => somme + Math.max(0, slot.capacity - slot.signups.length),
      0,
    ),
    filet: index % 2 === 0 ? "bg-brand-700" : "bg-sea-500",
  }));
  const prochain = events[0]
    ? {
        titre: events[0].title,
        date: formatLongDateTime(events[0].startAt),
        jeton: events[0].shareToken,
      }
    : null;
  const contactEmail = settings.contactEmail?.trim() || null;
  const rna = settings.rna?.trim() || null;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />

      <main className="flex-1">
        {/* ————— Héros : la promesse, deux portes d'action, et la preuve chiffrée ————— */}
        <section className="relative isolate overflow-hidden bg-brand-950 text-white">
          <div
            aria-hidden="true"
            className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[44px] border-brand-800"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-brand-700"
          />
          <div
            aria-hidden="true"
            className="absolute bottom-10 left-[48%] hidden h-4 w-40 -rotate-6 rounded-sm bg-sea-500 lg:block"
          />

          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_.95fr] lg:gap-20 lg:py-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-lg bg-sea-200 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.14em] text-brand-950">
                <HeartHandshake className="h-4 w-4" strokeWidth={2.5} />
                {settings.associationName} · {settings.schoolName}
              </span>
              <h1 className="mt-7 max-w-3xl text-4xl font-black leading-[1.05] tracking-[-0.05em] sm:text-5xl">
                On donne le temps qu’on a,{" "}
                <span className="text-sea-300">pas celui qu’on n’a pas.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base font-medium leading-7 text-brand-100 sm:text-lg">
                {settings.associationName} réunit les parents d’élèves de{" "}
                {settings.schoolName}. On y prépare les rendez-vous de l’année
                et on cherche des mains pour les tenir. Deux heures une fois, ou
                davantage si l’envie vient : rien n’est obligatoire, et rien
                n’est décidé d’avance.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href="#contact"
                  className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sea-300 px-5 py-3 text-sm font-extrabold text-brand-950 transition-colors hover:bg-sea-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
                >
                  Écrire à l’association
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </a>
                <a
                  href="#agenda"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-white px-5 py-3 text-sm font-extrabold text-white transition-colors hover:bg-white hover:text-brand-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
                >
                  <CalendarDays className="h-4 w-4" />
                  Voir ce qui se prépare
                </a>
                <span className="inline-flex min-h-12 items-center gap-2 px-2 text-sm font-semibold text-brand-100">
                  Écrire n’engage à rien
                </span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-lg lg:mx-0">
              <div
                aria-hidden="true"
                className="absolute -right-4 -top-4 hidden h-20 w-20 rounded-xl bg-sea-200 sm:block"
              />
              <div className="relative rounded-2xl bg-white p-5 text-brand-950 sm:p-7">
                <div className="flex items-center justify-between gap-5 border-b-2 border-slate-100 pb-5">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-700">
                      Association de parents d’élèves
                    </p>
                    <p className="mt-1 break-words text-lg font-black tracking-[-0.02em] sm:text-xl">
                      {settings.schoolName}
                    </p>
                  </div>
                  <Image
                    src={settings.logoUrl || "/logo.svg"}
                    alt=""
                    width={96}
                    height={96}
                    unoptimized
                    className="h-12 w-auto shrink-0 object-contain"
                  />
                </div>

                {prochain ? (
                  <Link
                    href={`/inscription/${prochain.jeton}`}
                    className="group mt-5 flex items-center gap-4 rounded-2xl bg-brand-950 p-4 text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sea-500">
                      <CalendarDays className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-extrabold uppercase tracking-[0.14em] text-brand-300">
                        Prochain rendez-vous
                      </span>
                      <span className="mt-1 block break-words font-black tracking-[-0.02em]">
                        {prochain.titre}
                      </span>
                      <span className="mt-0.5 block text-sm font-semibold text-brand-100">
                        {prochain.date}
                      </span>
                    </span>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </Link>
                ) : (
                  <div className="mt-5 rounded-2xl bg-brand-50 p-4">
                    <p className="font-black tracking-[-0.02em] text-brand-950">
                      Rien de publié en ce moment
                    </p>
                    <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
                      L’agenda se remplit d’une période à l’autre. Écrivez-nous :
                      on vous préviendra du prochain rendez-vous plutôt que de
                      vous laisser guetter la page.
                    </p>
                  </div>
                )}

                {events.length > 0 && (
                  <div className="mt-5 grid grid-cols-2 gap-3 border-t-2 border-slate-100 pt-5">
                    <div>
                      <p className="text-4xl font-black tracking-[-0.04em] text-brand-950">
                        {events.length}
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-600">
                        rendez-vous à venir
                      </p>
                    </div>
                    {placesOuvertes > 0 ? (
                      <div>
                        <p className="text-4xl font-black tracking-[-0.04em] text-brand-950">
                          {placesOuvertes}
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-600">
                          coup{placesOuvertes > 1 ? "s" : ""} de main recherché
                          {placesOuvertes > 1 ? "s" : ""}
                        </p>
                      </div>
                    ) : (
                      <p className="self-end text-sm font-bold text-slate-500">
                        Toutes les places sont prises pour l’instant.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ————— Respiration : une phrase, un aplat, aucune demande ————— */}
        <section className="relative isolate overflow-hidden bg-sea-200 py-10 sm:py-14">
          <div
            aria-hidden="true"
            className="absolute -right-10 -top-10 h-36 w-36 rounded-full border-[26px] border-sea-100"
          />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
            <p className="max-w-4xl text-3xl font-black tracking-[-0.04em] text-brand-950 sm:text-4xl">
              Une école qui bouge, ce sont des parents qui s’y mettent.
            </p>
          </div>
        </section>

        {/* ————— Le mur des « oui, mais… » : le seul bloc qui tient debout sans données ————— */}
        <section className="border-b-2 border-slate-100 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-700">
                Les quatre phrases qu’on entend le plus
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-brand-950 sm:text-5xl">
                Ce qui retient, et ce qu’on répond.
              </h2>
            </div>

            <ul className="mt-10">
              {OBJECTIONS.map(({ phrase, reponse }, index) => (
                <li
                  key={phrase}
                  className="grid gap-3 border-t-2 border-slate-200 py-8 first:border-t-0 first:pt-0 lg:grid-cols-[1.05fr_1fr] lg:gap-12"
                >
                  <p className="text-2xl font-black tracking-[-0.03em] text-brand-950 sm:text-3xl">
                    «&nbsp;{phrase}&nbsp;»
                  </p>
                  <div>
                    <span
                      aria-hidden="true"
                      className={`mb-3 block h-2 w-12 rounded-sm ${
                        index % 2 === 0 ? "bg-sea-500" : "bg-brand-700"
                      }`}
                    />
                    <p className="text-base font-medium leading-7 text-slate-600">
                      {reponse}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-wrap items-center gap-4 rounded-2xl bg-brand-50 px-5 py-5 sm:px-7">
              <p className="min-w-0 flex-1 basis-72 text-lg font-black tracking-[-0.02em] text-brand-950">
                Aucune de ces phrases n’est un obstacle.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="#contact"
                  className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-950 px-5 py-3 text-sm font-extrabold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                >
                  Écrire à l’association
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </a>
                <a
                  href="#agenda"
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl px-3 py-3 text-sm font-extrabold text-brand-800 transition-colors hover:text-brand-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                >
                  Voir ce qui se prépare
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ————— La porte basse : les rendez-vous réels, où l'on prend un créneau sans compte ————— */}
        <section id="agenda" className="scroll-mt-20 bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-700">
                  Sans écrire à personne
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-brand-950 sm:text-5xl">
                  Vous pouvez aussi juste venir voir.
                </h2>
              </div>
              <p className="max-w-md text-sm font-medium leading-6 text-slate-600">
                Ce ne sont pas des exemples : ce sont les rendez-vous déjà
                publiés par l’association, avec les places qui restent à prendre.
              </p>
            </div>

            {prochains.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-brand-200 bg-white px-6 py-14 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-950 text-white">
                  <CalendarDays className="h-7 w-7" aria-hidden="true" />
                </span>
                <p className="mt-4 font-extrabold text-brand-950">
                  Rien de publié en ce moment
                </p>
                <p className="mt-1 max-w-md text-sm font-medium leading-6 text-slate-500">
                  L’agenda se remplit d’une période à l’autre. Écrivez-nous : on
                  vous préviendra du prochain rendez-vous plutôt que de vous
                  laisser guetter la page.
                </p>
                <a
                  href="#contact"
                  className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-950 px-5 py-3 text-sm font-extrabold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                >
                  Écrire à l’association
                </a>
              </div>
            ) : (
              <>
                <ul className="space-y-3">
                  {prochains.map((event) => (
                    <li key={event.id}>
                      <Link
                        href={`/inscription/${event.jeton}`}
                        className="group block rounded-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300"
                      >
                        <article className="flex overflow-hidden rounded-2xl border-2 border-slate-200 bg-white transition-colors group-hover:border-brand-600">
                          <span
                            aria-hidden="true"
                            className={`w-2 shrink-0 ${event.filet}`}
                          />
                          <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2 p-5">
                            <p className="flex items-center gap-2 text-sm font-extrabold text-brand-700">
                              <CalendarDays
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                              {event.date}
                            </p>
                            <h3 className="text-lg font-black leading-tight tracking-[-0.02em] text-brand-950">
                              {event.titre}
                            </h3>
                            {event.lieu && (
                              <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
                                <MapPin className="h-4 w-4" aria-hidden="true" />
                                {event.lieu}
                              </p>
                            )}
                            <div className="flex w-full items-center gap-3 sm:ml-auto sm:w-auto">
                              {event.restantes > 0 && (
                                <span className="inline-flex items-center gap-1.5 rounded-lg bg-sea-200 px-2.5 py-1.5 text-xs font-extrabold text-brand-950">
                                  <Hand className="h-3.5 w-3.5" />
                                  {event.restantes} place
                                  {event.restantes > 1 ? "s" : ""}
                                </span>
                              )}
                              <span className="flex items-center gap-2 text-sm font-extrabold text-brand-700">
                                {event.restantes > 0
                                  ? "Se proposer"
                                  : "Voir le rendez-vous"}
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                              </span>
                            </div>
                          </div>
                        </article>
                      </Link>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl bg-brand-950 px-5 py-5 text-white sm:px-7">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sea-500">
                    <Hand className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="min-w-0 flex-1 basis-72 text-sm font-semibold leading-6 text-brand-100">
                    On prend un créneau directement sur la page de l’événement :
                    sans créer de compte, sans être adhérent, et sans passer par
                    nous.
                  </p>
                  {events.length > 3 && (
                    <Link
                      href="/#evenements"
                      className="group inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-white px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-white hover:text-brand-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
                    >
                      Voir tous les rendez-vous
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        {/* ————— Les missions : la théorie, compacte et rétrogradée ————— */}
        <section className="border-y-2 border-slate-100 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand-700">
                Où va votre coup de main
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-brand-950 sm:text-4xl">
                Tout ce que fait l’association revient à l’école.
              </h2>
            </div>

            <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {MISSIONS.map(({ icon: Icon, numero, titre, texte }, index) => {
                const teinte = TEINTES_MISSIONS[index];
                return (
                  <article
                    key={numero}
                    className={`rounded-2xl p-5 ${teinte.fond}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`grid h-11 w-11 place-items-center rounded-xl ${teinte.pastille}`}
                      >
                        <Icon
                          className="h-5 w-5"
                          strokeWidth={2.5}
                          aria-hidden="true"
                        />
                      </span>
                      <span className={`text-sm font-black ${teinte.numero}`}>
                        {numero}
                      </span>
                    </div>
                    <h3 className="mt-6 text-base font-black tracking-[-0.02em]">
                      {titre}
                    </h3>
                    <p
                      className={`mt-2 text-sm font-medium leading-6 ${teinte.texte}`}
                    >
                      {texte}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ————— Le coupon-réponse : ce qui se passe après l'envoi, puis le formulaire ————— */}
        <section id="contact" className="scroll-mt-20 bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
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
                    <Mail className="h-4 w-4" strokeWidth={2.5} />
                    Prendre contact
                  </span>
                  <h2 className="mt-6 text-2xl font-black tracking-[-0.03em] sm:text-3xl">
                    Il faut bien un premier message.
                  </h2>
                  <p className="mt-4 text-base font-medium leading-7 text-brand-100">
                    Vous n’avez pas besoin de savoir ce que vous voulez faire, ni
                    de vous engager à quoi que ce soit. Dites-nous simplement que
                    vous êtes là.
                  </p>

                  <ol className="mt-7 space-y-4">
                    {ETAPES.map(({ titre, texte }, index) => (
                      <li key={titre} className="flex items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-sm font-black text-brand-950">
                          {index + 1}
                        </span>
                        <span>
                          <span className="block font-extrabold">{titre}</span>
                          <span className="mt-1 block text-sm font-medium leading-6 text-brand-100">
                            {texte}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>

                  <p className="mt-7 border-t-2 border-brand-800 pt-5 text-sm font-medium leading-6 text-brand-100">
                    Votre message n’est enregistré nulle part sur le site : il
                    part directement dans la boîte e-mail de l’association.
                  </p>

                  {contactEmail && (
                    <a
                      href={`mailto:${contactEmail}`}
                      className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-white px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-white hover:text-brand-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
                    >
                      <Mail className="h-4 w-4" aria-hidden="true" />
                      Écrire à {contactEmail}
                    </a>
                  )}

                  {rna && (
                    <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-brand-300">
                      Association déclarée · RNA {rna}
                    </p>
                  )}
                </div>
              </aside>

              <div className="rounded-2xl border-2 border-slate-200 bg-white p-6 sm:p-8">
                {contactEmail ? (
                  <>
                    <h3 className="text-xl font-black tracking-[-0.02em] text-brand-950">
                      Écrire à {settings.associationName}
                    </h3>
                    <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
                      Quelques mots suffisent. Vous pouvez aussi simplement dire
                      bonjour.
                    </p>

                    <div className="mt-5 rounded-2xl bg-brand-50 p-4">
                      <p className="text-sm font-extrabold text-brand-950">
                        Si vous ne savez pas quoi écrire, recopiez une de ces
                        phrases
                      </p>
                      <ul className="mt-3 space-y-2">
                        {AMORCES.map((amorce) => (
                          <li
                            key={amorce}
                            className="flex gap-2.5 text-sm font-medium leading-6 text-slate-700"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600"
                            />
                            «&nbsp;{amorce}&nbsp;»
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-6">
                      <JoinForm
                        contactEmail={contactEmail}
                        recaptchaSiteKey={
                          settings.recaptchaReady ? settings.recaptchaSiteKey : null
                        }
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-xl font-black tracking-[-0.02em] text-brand-950">
                      Le formulaire n’est pas disponible pour l’instant
                    </h3>
                    <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                      L’association n’a pas encore publié d’adresse de contact :
                      votre message ne partirait nulle part. Repassez d’ici
                      quelques jours, ou parlez-en à un parent de l’équipe à la
                      sortie de l’école.
                    </p>
                  </>
                )}
              </div>
            </div>

            <Link
              href="/"
              className="mt-10 inline-flex min-h-12 items-center gap-2 rounded-xl px-3 py-3 text-sm font-extrabold text-brand-800 transition-colors hover:text-brand-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour à l’accueil
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
