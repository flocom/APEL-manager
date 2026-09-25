import { ArrowLeft, UserRoundPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AdherentCreation } from "@/components/adherent-fiche";
import { PageHeader } from "@/components/ui";
import { filtresDepuis, requeteFiltres } from "@/lib/adherent-view";
import { requireRole } from "@/lib/auth/rbac";
import { getAssociationSettings } from "@/lib/services/association-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Nouvel adhérent" };

/**
 * Une page plutôt que le formulaire qui s'ouvrait en haut de la liste : le
 * bouton « Ajouter » est un lien, qui marche avant même que la page ne soit
 * interactive, et la nouvelle fiche s'ouvre ensuite à sa propre adresse.
 */
export default async function NouvelAdherentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("admin");
  const [settings, recherche] = await Promise.all([
    getAssociationSettings(),
    searchParams,
  ]);
  const retour = `/dashboard/adherents${requeteFiltres(filtresDepuis(recherche))}`;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link
        href={retour}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Tous les adhérents
      </Link>
      <PageHeader
        title="Ajouter un adhérent"
        description="La fiche s'ouvrira à sa propre adresse une fois enregistrée."
        icon={UserRoundPlus}
      />
      <AdherentCreation
        cotisationParDefautCents={settings.membershipFeeCents}
        retour={retour}
      />
    </div>
  );
}
