import { and, asc, desc, eq, sql } from "drizzle-orm";
import { ContactRound } from "lucide-react";

import { AdherentsManager } from "@/components/adherents-manager";
import {
  type EcritureRecetteView,
  type LigneRapprochementView,
} from "@/components/cotisations-rapprochement";
import { HelloAssoSyncBanner } from "@/components/helloasso-sync-banner";
import { PageHeader } from "@/components/ui";
import { UdapelExportButton } from "@/components/udapel-export-button";
import { adherentView } from "@/lib/adherent-view";
import { requireRole } from "@/lib/auth/rbac";
import { currentSchoolYear } from "@/lib/dates";
import { db } from "@/lib/db";
import { memberCompleteness } from "@/lib/member-info/completeness";
import { centimesDepuisSql } from "@/lib/money";
import {
  accountingCategories,
  accountingEntries,
  associationMembers,
  financialAccounts,
  membershipPayments,
} from "@/lib/db/schema";
import { etatDe, rapprochement } from "@/lib/services/cotisations";
import { getHelloAssoStatus } from "@/lib/services/helloasso";

export const dynamic = "force-dynamic";

/**
 * Les adhérents, et pour chacun ce qu'il doit, ce qu'il a réglé, et si ce
 * règlement est passé dans les comptes.
 *
 * Ces trois choses vivaient sur deux écrans : « Adhérents » tenait la fiche et
 * la date de règlement, « Cotisations » disait l'état comptable de la même
 * adhésion — et les deux affichaient la même liste de familles, dans le même
 * ordre, avec les mêmes montants. On y répondait à une seule question, « cette
 * famille est-elle à jour ? », en deux endroits, reliés par un bandeau. Le
 * paiement appartient à l'adhérent : il est désormais sur sa ligne.
 *
 * Les deux gestes de rapprochement — pointer un encaissement groupé, reprendre
 * l'historique — restent nécessaires et portent sur plusieurs familles à la
 * fois. Ils vivent sous la liste, là où sont les familles qu'ils désignent.
 */
export default async function AdherentsPage() {
  await requireRole("admin");
  const [members, lignes, comptes, categories, recettes, helloasso] =
    await Promise.all([
      db
        .select()
        .from(associationMembers)
        .orderBy(
          asc(associationMembers.lastName),
          asc(associationMembers.firstName),
        ),
      rapprochement(null),
      db
        .select({ id: financialAccounts.id, name: financialAccounts.name })
        .from(financialAccounts)
        .where(eq(financialAccounts.isActive, true)),
      db
        .select({ id: accountingCategories.id, name: accountingCategories.name })
        .from(accountingCategories)
        .where(
          and(
            eq(accountingCategories.isActive, true),
            eq(accountingCategories.type, "income"),
          ),
        ),
      db
        .select({
          id: accountingEntries.id,
          label: accountingEntries.label,
          occurredAt: accountingEntries.occurredAt,
          amountCents: accountingEntries.amountCents,
          status: accountingEntries.status,
          // `bigint`, comme toutes les sommes de montants : un `::int` sur une
          // somme déborde dès que le total franchit 21 millions d'euros.
          affecteCents: sql<string>`coalesce((
            select sum(${membershipPayments.amountCents})
            from ${membershipPayments}
            where ${membershipPayments.entryId} = ${accountingEntries.id}
          ), 0)::bigint`,
        })
        .from(accountingEntries)
        .where(eq(accountingEntries.type, "income"))
        .orderBy(desc(accountingEntries.occurredAt))
        .limit(200),
      getHelloAssoStatus(),
    ]);

  const serialized = members.map(adherentView);

  // L'année des adhésions en cours : l'année scolaire si des familles y ont
  // déjà adhéré, sinon la plus récente — en septembre, avant les premières
  // adhésions, le bureau termine encore le tableau de l'année passée.
  const annees = Array.from(new Set(members.map((m) => m.schoolYear))).sort(
    (a, b) => b.localeCompare(a),
  );
  const anneeScolaire = currentSchoolYear();
  const anneeParDefaut = annees.includes(anneeScolaire)
    ? anneeScolaire
    : (annees[0] ?? anneeScolaire);
  // Le tableau ne reprend que les adhésions actives : le compte des fiches à
  // compléter suit la même règle.
  const incompletesParAnnee: Record<string, number> = {};
  for (const member of members) {
    if (member.status !== "active") continue;
    if (memberCompleteness(member).complete) continue;
    incompletesParAnnee[member.schoolYear] =
      (incompletesParAnnee[member.schoolYear] ?? 0) + 1;
  }

  const rapprochements: LigneRapprochementView[] = lignes.map((ligne) => ({
    memberId: ligne.memberId,
    nom: ligne.nom,
    schoolYear: ligne.schoolYear,
    statut: ligne.statut,
    duCents: ligne.duCents,
    cotisationCents: ligne.cotisationCents,
    donCents: ligne.donCents,
    regleLe: ligne.regleLe?.toISOString() ?? null,
    mode: ligne.mode,
    comptabiliseCents: ligne.comptabiliseCents,
    etat: etatDe(ligne),
    ecritures: ligne.ecritures.map((e) => ({
      id: e.id,
      label: e.label,
      partCents: e.partCents,
    })),
  }));

  const ecrituresRecette: EcritureRecetteView[] = recettes.map((e) => ({
    id: e.id,
    label: e.label,
    occurredAt: e.occurredAt.toISOString(),
    amountCents: e.amountCents,
    status: e.status,
    affecteCents: centimesDepuisSql(e.affecteCents),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Adhérents"
        description="Les adhésions, les coordonnées, et le règlement de chaque cotisation jusque dans les comptes."
        icon={ContactRound}
      >
        <UdapelExportButton
          schoolYears={annees}
          defaultYear={anneeParDefaut}
          incompleteByYear={incompletesParAnnee}
        />
      </PageHeader>
      <HelloAssoSyncBanner status={helloasso} />
      <AdherentsManager
        members={serialized}
        anneeParDefaut={anneeParDefaut}
        rapprochements={rapprochements}
        comptes={comptes}
        categoriesRecette={categories}
        ecrituresRecette={ecrituresRecette}
      />
    </div>
  );
}
