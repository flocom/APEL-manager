import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { ConfirmAccountForm } from "@/components/auth-forms";
import { buttonClasses } from "@/components/ui";
import {
  ACCOUNT_REQUEST_VALIDITY_DAYS,
  findAccountRequest,
} from "@/lib/services/account-requests";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Confirmer votre demande de compte" };

/**
 * La page du lien de confirmation. L'ouvrir ne confirme rien : c'est le
 * formulaire, envoyé par un clic, qui le fait (voir la route de confirmation).
 * Un robot qui visite le lien n'y trouve qu'un formulaire.
 */
export default async function ConfirmerDemandePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const demande = await findAccountRequest(token);

  if (!demande) {
    return (
      <AuthShell
        eyebrow="Demande de compte"
        title="Ce lien n’est plus valable"
        description={`Il a déjà servi, ou il a expiré : un lien de confirmation vaut ${ACCOUNT_REQUEST_VALIDITY_DAYS} jours. Si vous avez déjà confirmé votre demande, connectez-vous.`}
      >
        <div className="space-y-3">
          <Link
            href="/login"
            className={cn(buttonClasses("primary"), "min-h-12 w-full")}
          >
            Se connecter
          </Link>
          <Link
            href="/register"
            className={cn(buttonClasses("outline"), "min-h-12 w-full")}
          >
            Refaire une demande
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Demande de compte"
      title="Confirmer votre demande"
      description="Relisez votre nom et choisissez votre mot de passe. Un administrateur de l’association validera ensuite votre compte."
    >
      <ConfirmAccountForm
        token={token}
        email={demande.email}
        name={demande.name}
      />
    </AuthShell>
  );
}
