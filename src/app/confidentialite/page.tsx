import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/app-config";

export const metadata = { title: "Politique de confidentialité" };

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900">
          Politique de confidentialité
        </h1>
        <div className="mt-6 space-y-5 text-sm leading-relaxed text-slate-600">
          <section>
            <h2 className="font-semibold text-slate-900">Responsable</h2>
            <p>
              Les données collectées via {APP_NAME} sont traitées par
              l'association (APEL) qui organise les événements.
              {CONTACT_EMAIL ? ` Contact : ${CONTACT_EMAIL}.` : ""}
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-slate-900">Données collectées</h2>
            <p>
              Lors d'une inscription comme bénévole : votre nom, et l'e-mail
              et/ou le téléphone que vous indiquez. Pour les membres connectés :
              nom, e-mail et, si vous le renseignez, votre identifiant Telegram.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-slate-900">Finalité</h2>
            <p>
              Ces données servent uniquement à organiser les événements de
              l'association : vous contacter au sujet d'un créneau, vous envoyer
              une confirmation et un rappel. Elles ne sont ni vendues ni cédées à
              des tiers.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-slate-900">Conservation</h2>
            <p>
              Les inscriptions bénévoles sont conservées le temps de
              l'organisation de l'événement puis supprimées. Vous pouvez vous
              désinscrire à tout moment via le lien reçu par e-mail.
            </p>
          </section>
          <section>
            <h2 className="font-semibold text-slate-900">Vos droits</h2>
            <p>
              Conformément au RGPD, vous disposez d'un droit d'accès, de
              rectification et de suppression de vos données. Pour l'exercer,
              contactez l'association
              {CONTACT_EMAIL ? ` à ${CONTACT_EMAIL}` : ""}.
            </p>
          </section>
        </div>
        <Link
          href="/"
          className="mt-8 inline-block text-sm text-brand-600 hover:underline"
        >
          ← Retour à l'accueil
        </Link>
      </main>
    </div>
  );
}
