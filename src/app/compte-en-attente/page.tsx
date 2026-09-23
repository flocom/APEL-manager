import { Hourglass } from "lucide-react";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { LogoutButton } from "@/components/logout-button";
import { isApproved } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getAssociationSettings } from "@/lib/services/association-settings";

export const dynamic = "force-dynamic";

export const metadata = { title: "Compte en attente de validation" };

/**
 * La seule page qu'un compte en attente peut ouvrir.
 *
 * Elle lit l'utilisateur sans passer par `requireUser`, qui renvoie ici même
 * les comptes en attente : ce serait une boucle. Elle ne montre que ce que la
 * personne sait déjà — son nom et son adresse — et rien de l'association au
 * delà de son nom.
 */
export default async function CompteEnAttentePage() {
  const [user, settings] = await Promise.all([
    getCurrentUser(),
    getAssociationSettings(),
  ]);
  if (!user) redirect("/login");
  if (isApproved(user)) redirect("/dashboard");

  return (
    <AuthShell
      eyebrow="Compte en attente"
      title="Votre compte attend sa validation"
      description={`Un administrateur de l’association doit valider votre compte avant que vous puissiez accéder à l’espace ${settings.associationName}.`}
    >
      <div className="space-y-5">
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border-2 border-sand-200 bg-sand-50 px-4 py-3.5 text-sm leading-6 text-slate-700"
        >
          <Hourglass
            className="mt-0.5 h-4 w-4 shrink-0 text-sand-700"
            aria-hidden="true"
          />
          <p>
            Vous êtes connecté·e en tant que{" "}
            <strong className="text-slate-900 [overflow-wrap:anywhere]">
              {user.name}
            </strong>{" "}
            (<span className="[overflow-wrap:anywhere]">{user.email}</span>).
            Rien n’est à faire de votre côté : dès que votre compte sera validé,
            reconnectez-vous pour accéder à l’espace.
          </p>
        </div>
        <p className="text-sm leading-6 text-slate-600">
          L’attente se prolonge ? Rapprochez-vous d’un membre du bureau de
          l’association : c’est lui qui valide les nouveaux comptes.
        </p>
        <LogoutButton className="min-h-12 w-full" />
      </div>
    </AuthShell>
  );
}
