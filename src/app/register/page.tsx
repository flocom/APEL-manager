import { MailWarning } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/auth-forms";
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
        eyebrow="Compte de gestion"
        title="Demander un compte"
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
  return (
    <AuthShell
      eyebrow="Compte de gestion"
      title={existe ? "Demander un compte" : "Créer un compte"}
      description={
        existe
          ? "Vous confirmerez votre adresse depuis le lien reçu par e-mail, puis un administrateur de l’association validera votre compte."
          : `Le premier compte créé devient administrateur de l’espace ${settings.associationName}.`
      }
    >
      <RegisterForm
        demande={existe}
        next={destination}
        recaptchaSiteKey={
          settings.recaptchaReady ? settings.recaptchaSiteKey : null
        }
      />
    </AuthShell>
  );
}
