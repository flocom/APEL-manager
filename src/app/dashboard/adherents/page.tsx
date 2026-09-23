import { and, asc, desc, eq, sql } from "drizzle-orm";
import { ContactRound } from "lucide-react";

import {
  AdherentsManager,
  type AdherentView,
} from "@/components/adherents-manager";
import {
  type EcritureRecetteView,
  type LigneRapprochementView,
} from "@/components/cotisations-rapprochement";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { centimesDepuisSql } from "@/lib/money";
import {
  accountingCategories,
  accountingEntries,
  associationMembers,
  financialAccounts,
  membershipPayments,
} from "@/lib/db/schema";
import { getAssociationSettings } from "@/lib/services/association-settings";
import { etatDe, rapprochement } from "@/lib/services/cotisations";

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
  const [members, settings, lignes, comptes, categories, recettes] =
    await Promise.all([
      db
        .select()
        .from(associationMembers)
        .orderBy(
          asc(associationMembers.lastName),
          asc(associationMembers.firstName),
        ),
      getAssociationSettings(),
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
    ]);

  const serialized: AdherentView[] = members.map((member) => ({
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    phone: member.phone,
    addressLine1: member.addressLine1,
    addressLine2: member.addressLine2,
    postalCode: member.postalCode,
    city: member.city,
    country: member.country,
    status: member.status,
    schoolYear: member.schoolYear,
    membershipFeeCents: member.membershipFeeCents,
    feePaidAt: member.feePaidAt?.toISOString() ?? null,
    feePaymentMethod: member.feePaymentMethod,
    joinedAt: member.joinedAt.toISOString(),
    notes: member.notes,
    version: member.version,
  }));

  const rapprochements: LigneRapprochementView[] = lignes.map((ligne) => ({
    memberId: ligne.memberId,
    nom: ligne.nom,
    schoolYear: ligne.schoolYear,
    statut: ligne.statut,
    duCents: ligne.duCents,
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
      />
      <AdherentsManager
        members={serialized}
        cotisationParDefautCents={settings.membershipFeeCents}
        rapprochements={rapprochements}
        comptes={comptes}
        categoriesRecette={categories}
        ecrituresRecette={ecrituresRecette}
      />
    </div>
  );
}
