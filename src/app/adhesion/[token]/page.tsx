import type { Metadata } from "next";
import { ArrowLeft, Link2Off, Mail, UserRound } from "lucide-react";
import Link from "next/link";

import { MemberUpdateForm } from "@/components/member-update-form";
import { SiteHeader } from "@/components/site-header";
import { formatLongDate } from "@/lib/dates";
import { getAssociationSettings } from "@/lib/services/association-settings";
import { getPublicMemberForm } from "@/lib/services/member-update-requests";

export const dynamic = "force-dynamic";

// Une page personnelle, atteinte par un lien reçu par e-mail : rien à
// indexer, et le jeton de l'adresse ne part chez aucun autre site — ni en
// référent (`same-origin`), ni dans les statistiques de visite (le layout
// racine ne les charge pas ici, voir lib/cloudflare-web-analytics.ts).
// `same-origin` plutôt que `no-referrer` : l'enregistrement reste une requête
// du site qui dit d'où elle vient, ce que le contrôle d'origine du middleware
// attend des navigateurs qui n'envoient pas `Sec-Fetch-Site`.
export const metadata: Metadata = {
  title: "Compléter ma fiche d’adhérent",
  robots: { index: false, follow: false, nocache: true },
  referrer: "same-origin",
};

/**
 * Le formulaire qu'ouvre une famille depuis l'e-mail de relance : sa fiche
 * d'adhérent, ce qui y manque, et de quoi le compléter.
 *
 * Ouvrir la page ne change rien — les messageries suivent les liens pour les
 * inspecter. Seul l'enregistrement écrit (`POST /api/adhesion/[token]`).
 * Un lien expiré, remplacé ou inconnu mène à la même explication.
 */
export default async function MemberUpdatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [form, settings] = await Promise.all([
    getPublicMemberForm(token),
    getAssociationSettings(),
  ]);
  const contact = settings.contactEmail?.trim() || null;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {!form ? (
          <section className="rounded-2xl border-2 border-slate-200 bg-white p-6 text-center sm:p-8">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-950 text-white">
              <Link2Off className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-2xl font-black tracking-[-0.03em] text-brand-950">
              Ce lien ne sert plus
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-slate-600">
              Il a expiré — un lien reste valable 30 jours —, un lien plus
              récent vous a été envoyé, ou l’adresse est incomplète. Rien
              n’a été modifié. Pour recevoir un nouveau lien, écrivez à
              l’association.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              {contact && (
                <a
                  href={`mailto:${contact}`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-950 px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                >
                  <Mail className="h-4 w-4" />
                  Écrire à l’association
                </a>
              )}
              <Link
                href="/"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-extrabold text-brand-950 transition-colors hover:border-brand-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
              >
                <ArrowLeft className="h-4 w-4" />
                Retour à l’accueil
              </Link>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border-2 border-slate-200 bg-white p-5 sm:p-8">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-sea-200 text-brand-950">
              <UserRound className="h-6 w-6" />
            </span>
            <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.14em] text-brand-700">
              Adhésion {form.schoolYear} · {form.associationName}
            </p>
            <h1 className="mt-2 break-words text-3xl font-black tracking-[-0.04em] text-brand-950">
              Bonjour {form.firstName} {form.lastName.toLocaleUpperCase("fr")}
            </h1>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
              Vérifiez votre fiche d’adhérent et complétez ce qui manque.
              L’adresse postale est indispensable pour enregistrer votre
              adhésion auprès de l’Apel départementale.
            </p>
            <p className="mt-2 text-xs font-medium text-slate-500">
              Ce lien personnel est valable jusqu’au{" "}
              {formatLongDate(form.expiresAt)}. Vous pouvez revenir corriger
              votre fiche jusqu’à cette date.
            </p>

            <div className="mt-6">
              <MemberUpdateForm token={token} initial={form} />
            </div>

            {contact && (
              <p className="mt-6 border-t-2 border-slate-100 pt-4 text-xs font-medium leading-5 text-slate-500">
                Une question ?{" "}
                <a
                  href={`mailto:${contact}`}
                  className="font-bold text-brand-800 underline"
                >
                  {contact}
                </a>
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
