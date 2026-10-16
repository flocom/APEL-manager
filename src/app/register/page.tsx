import { BellRing, ListChecks, MailWarning } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/auth-forms";
import { AuthTabs } from "@/components/auth-tabs";
import { buttonClasses } from "@/components/ui";
import { safeNextPath, withNextPath } from "@/lib/auth/return-path";
import { getCurrentUser } from "@/lib/auth/session";
import { configuredBaseUrl } from "@/lib/base-url";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getAssociationSettings } from "@/lib/services/association-settings";
import { getOutboundMailRuntimeConfig } from "@/lib/services/mail-settings";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Ce que donne un compte, dit avant le formulaire, sur téléphone comme sur
 * ordinateur (le panneau de gauche d'AuthShell ne s'affiche qu'en grand
 * écran). Des parents qui avaient adhéré pensaient ne rien avoir à créer ;
 * d'autres, venus adhérer, demandaient un compte : la dernière phrase remet
 * chacun sur son chemin.
 */
function CeQuePermetUnCompte() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border-2 border-brand-100 bg-brand-50 px-4 py-3.5">
        <p className="text-sm font-extrabold text-brand-950">
          Avec un compte, vous pouvez&nbsp;:
        </p>
        <ul className="mt-2.5 space-y-2.5 text-sm leading-6 text-slate-700">
          <li className="flex items-start gap-2.5">
            <ListChecks
              className="mt-1 h-4 w-4 shrink-0 text-brand-700"
              aria-hidden="true"
            />
            <span>
              voir les tâches de chaque événement et dire «&nbsp;Je m’en
              charge&nbsp;» — par exemple réserver la chaise du Père
              Noël&nbsp;;
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <BellRing
              className="mt-1 h-4 w-4 shrink-0 text-brand-700"
              aria-hidden="true"
            />
            <span>
              retrouver vos tâches dans «&nbsp;Mes tâches&nbsp;» et recevoir
              les rappels.
            </span>
          </li>
        </ul>
      </div>
      <p className="text-sm leading-6 text-slate-600">
        Adhérer ne crée pas de compte, et un compte n’est pas une adhésion.{" "}
        <Link
          href="/rejoindre"
          className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-900"
        >
          Vous veniez adhérer&nbsp;? C’est par ici.
        </Link>
      </p>
    </div>
  );
}

export default async function RegisterPage({
  searchParams,
}: {
  // Arrivé depuis la connexion avec une page à retrouver : le lien vers la
  // connexion la garde, et le tout premier compte, qui entre aussitôt, y va.
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const [user, settings, unCompte, messagerie, { next }] = await Promise.all([
    getCurrentUser(),
    getAssociationSettings(),
    db.select({ id: users.id }).from(users).limit(1),
    getOutboundMailRuntimeConfig(),
    searchParams,
  ]);
  const destination = safeNextPath(next);
  if (user) redirect(destination);
  const existe = unCompte.length > 0;

  // Une demande se confirme par e-mail. Sans messagerie configurée, le lien ne
  // partirait jamais : mieux vaut le dire ici que laisser la personne guetter
  // un message qui n'arrivera pas. Sans adresse publique configurée non plus :
  // le lien porte un jeton, et ne part que vers elle (lib/base-url.ts). Le
  // premier compte, lui, n'a besoin ni de l'une ni de l'autre.
  const adressePublique = Boolean(configuredBaseUrl());
  if (existe && (!messagerie || !adressePublique)) {
    return (
      <AuthShell
        eyebrow="Compte bénévole"
        title="Créer un compte"
        tabs={<AuthTabs active="register" next={destination} />}
        description={
          messagerie
            ? `Les demandes de compte se confirment par un lien envoyé par e-mail, et l’adresse publique de l’espace ${settings.associationName} n’est pas encore configurée.`
            : `Les demandes de compte se confirment par e-mail, et l’espace ${settings.associationName} n’a pas encore de messagerie configurée.`
        }
      >
        <div className="space-y-4">
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border-2 border-sand-200 bg-sand-50 px-4 py-3.5 text-sm leading-6 text-slate-700"
          >
            <MailWarning
              className="mt-0.5 h-4 w-4 shrink-0 text-sand-700"
              aria-hidden="true"
            />
            <p>
              Rapprochez-vous d’un membre du bureau : un administrateur doit
              d’abord configurer{" "}
              {messagerie
                ? "l’adresse publique du site (APP_URL)"
                : "la messagerie de l’espace de gestion"}
              .
            </p>
          </div>
          <CeQuePermetUnCompte />
          <Link
            href={withNextPath("/login", destination)}
            className={cn(buttonClasses("outline"), "min-h-12 w-full")}
          >
            Se connecter
          </Link>
        </div>
      </AuthShell>
    );
  }

  // Deux situations, deux promesses : sur une installation neuve, le compte
  // créé ouvre l'espace ; ensuite, il n'est qu'une demande. Annoncer
  // l'administration à tout visiteur faisait croire qu'on entrait d'office.
  // Le tout premier compte est celui de qui installe l'espace : l'explication
  // destinée aux parents ne le concerne pas.
  return (
    <AuthShell
      eyebrow={existe ? "Compte bénévole" : "Premier compte"}
      title="Créer un compte"
      tabs={<AuthTabs active="register" next={destination} />}
      description={
        existe
          ? "Gratuit. C’est une demande : vous confirmerez votre adresse depuis le lien reçu par e-mail, puis le bureau validera votre compte."
          : `Le premier compte créé devient administrateur de l’espace ${settings.associationName}.`
      }
    >
      <RegisterForm
        demande={existe}
        next={destination}
        recaptchaSiteKey={
          settings.recaptchaReady ? settings.recaptchaSiteKey : null
        }
        intro={existe ? <CeQuePermetUnCompte /> : null}
      />
    </AuthShell>
  );
}
