import { ArrowLeft, ContactRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AdherentFiche,
  type ComptabiliteAdherentView,
} from "@/components/adherent-fiche";
import { PageHeader } from "@/components/ui";
import {
  adherentView,
  filtresDepuis,
  requeteFiltres,
} from "@/lib/adherent-view";
import { requireRole } from "@/lib/auth/rbac";
import { getAssociationMember } from "@/lib/services/adherents";
import { etatDe, rapprochementAdherent } from "@/lib/services/cotisations";
import { isUuid } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Le nom de la famille n'a pas à partir dans l'historique du navigateur ni
// dans les onglets partagés : le titre reste générique.
export const metadata: Metadata = { title: "Fiche adhérent" };

/**
 * Un adhérent, à sa propre adresse : on peut y revenir, la garder dans un
 * onglet, l'envoyer à un autre membre du bureau.
 *
 * Les paramètres de la liste (`?q=…&statut=…&annee=…`) sont repris tels quels
 * par le lien de retour : la liste se rouvre filtrée comme on l'avait laissée.
 */
export default async function AdherentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("admin");
  const { id } = await params;
  // Une adresse tronquée ou inventée : une page introuvable, pas une erreur
  // de la base sur un identifiant qui n'en est pas un.
  if (!isUuid(id)) notFound();
  const [member, ligne, recherche] = await Promise.all([
    getAssociationMember(id),
    rapprochementAdherent(id),
    searchParams,
  ]);
  if (!member) notFound();

  const retour = `/dashboard/adherents${requeteFiltres(filtresDepuis(recherche))}`;
  const comptabilite: ComptabiliteAdherentView | null = ligne
    ? {
        etat: etatDe(ligne),
        comptabiliseCents: ligne.comptabiliseCents,
        ecritures: ligne.ecritures.map((e) => ({
          id: e.id,
          label: e.label,
          occurredAt: e.occurredAt.toISOString(),
          status: e.status,
          partCents: e.partCents,
        })),
      }
    : null;

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
        title={`${member.firstName} ${member.lastName}`}
        description={`Fiche adhérent · adhésion ${member.schoolYear}`}
        icon={ContactRound}
      />
      <AdherentFiche member={adherentView(member)} comptabilite={comptabilite} />
    </div>
  );
}
