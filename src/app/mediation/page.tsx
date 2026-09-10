import {
  ArrowLeft,
  Ear,
  HeartHandshake,
  Mail,
  MessagesSquare,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MediationForm } from "@/components/mediation-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getAssociationSettings } from "@/lib/services/association-settings";

export const dynamic = "force-dynamic";

/**
 * Page publique « Parler à l'association ».
 *
 * Un parent qui arrive ici a souvent hésité avant d'écrire. La page dit en
 * trois temps ce qui va se passer, promet la discrétion — promesse tenue par le
 * fait que la route API n'écrit rien en base — et rappelle les deux numéros
 * nationaux qui, eux, peuvent agir vite quand la situation le demande.
 */

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getAssociationSettings();
  const title = `Parler à ${settings.associationName}`;
  const description = `Une difficulté avec l’école ? Les parents ${settings.associationName} vous écoutent et vous accompagnent auprès de l’équipe enseignante.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
  };
}

const ETAPES = [
  {
    icon: Ear,
    numero: "01",
    titre: "Vous nous racontez",
    texte:
      "Par écrit ici, ou de vive voix si vous préférez qu’on vous rappelle.",
  },
  {
    icon: MessagesSquare,
    numero: "02",
    titre: "On en parle avec vous",
    texte:
      "Un parent du bureau vous répond, prend le temps de comprendre et vous dit ce qui est possible.",
  },
  {
    icon: HeartHandshake,
    numero: "03",
    titre: "On porte le sujet",
    texte:
      "Auprès de l’enseignant ou de la direction, avec vous, ou en votre nom si vous préférez rester en retrait.",
  },
];

export default async function MediationPage() {
  const settings = await getAssociationSettings();
  const contactEmail = settings.contactEmail?.trim() || null;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />

      <main className="flex-1">
        <section className="relative isolate overflow-hidden bg-brand-950 text-white">
          <div
            aria-hidden="true"
            className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[44px] border-brand-800"
          />
          <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
            <span className="inline-flex items-center gap-2 rounded-lg bg-coral-600 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.14em] text-white">
              <MessagesSquare className="h-4 w-4" strokeWidth={2.5} />
              Médiation
            </span>
            <h1 className="mt-7 max-w-3xl text-4xl font-black leading-[1.05] tracking-[-0.05em] sm:text-5xl">
              Quelque chose coince avec l’école ?{" "}
              <span className="text-sea-300">On en parle.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base font-medium leading-7 text-brand-100 sm:text-lg">
              Une remarque qui passe mal, une organisation qui complique la vie
              d’une famille, une situation qu’on n’ose pas aborder seul :
              l’association est là pour faire le lien entre les parents et
              l’équipe enseignante. Racontez-nous, on s’occupe de la suite.
            </p>
            <a
              href="#formulaire"
              className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-coral-600 px-5 py-3 text-sm font-extrabold text-white transition-colors hover:bg-coral-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
            >
              <MessagesSquare className="h-4 w-4" aria-hidden="true" />
              Nous écrire
            </a>
          </div>
        </section>

        <section className="border-b-2 border-slate-100 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-coral-700">
                Comment ça se passe
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-brand-950 sm:text-4xl">
                Trois temps, et vous gardez la main.
              </h2>
            </div>

            <div className="mt-9 grid gap-4 md:grid-cols-3">
              {ETAPES.map(({ icon: Icon, numero, titre, texte }) => (
                <article
                  key={numero}
                  className="rounded-2xl border-2 border-slate-200 bg-white p-5"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-coral-100 text-coral-800">
                      <Icon className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
                    </span>
                    <span className="text-sm font-black text-slate-300">
                      {numero}
                    </span>
                  </div>
                  <h3 className="mt-6 text-base font-black tracking-[-0.02em] text-brand-950">
                    {titre}
                  </h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
                    {texte}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="formulaire" className="scroll-mt-20 bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
              <aside className="relative overflow-hidden rounded-2xl bg-brand-950 p-6 text-white sm:p-8 lg:sticky lg:top-28">
                <div
                  aria-hidden="true"
                  className="absolute -right-12 -top-12 h-36 w-36 rounded-full border-[26px] border-brand-800"
                />
                <div className="relative">
                  <span className="inline-flex items-center gap-2 rounded-lg bg-sea-200 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-brand-950">
                    <ShieldCheck className="h-4 w-4" strokeWidth={2.5} />
                    Entre nous
                  </span>
                  <h2 className="mt-6 text-2xl font-black tracking-[-0.03em] sm:text-3xl">
                    Ce que vous écrivez reste entre vous et le bureau.
                  </h2>
                  <p className="mt-4 text-base font-medium leading-7 text-brand-100">
                    Votre message arrive par e-mail aux parents du bureau. Rien
                    n’est publié, rien n’est transmis à l’école sans votre
                    accord, et vous décidez à chaque étape jusqu’où on va.
                  </p>

                  {contactEmail && (
                    <a
                      href={`mailto:${contactEmail}`}
                      className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-white px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-white hover:text-brand-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
                    >
                      <Mail className="h-4 w-4" aria-hidden="true" />
                      Écrire à {contactEmail}
                    </a>
                  )}

                  <p className="mt-7 border-t-2 border-brand-800 pt-5 text-sm font-medium leading-6 text-brand-100">
                    Harcèlement, violence, enfant en danger : le 3020 et le 119
                    sont gratuits, ouverts à tous, et ce sont eux qui peuvent
                    agir vite. Appelez-les d’abord, on reste disponibles ensuite.
                  </p>
                </div>
              </aside>

              <div className="rounded-2xl border-2 border-slate-200 bg-white p-6 sm:p-8">
                {contactEmail ? (
                  <>
                    <h3 className="text-xl font-black tracking-[-0.02em] text-brand-950">
                      Racontez-nous
                    </h3>
                    <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
                      Prenez le temps qu’il faut. Personne d’autre que le bureau
                      ne lira ce message.
                    </p>
                    <div className="mt-6">
                      <MediationForm
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
