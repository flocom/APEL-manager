import { and, desc, eq, sql } from "drizzle-orm";
import { HandCoins } from "lucide-react";

import {
  CotisationsRapprochement,
  type EcritureRecetteView,
  type LigneRapprochementView,
} from "@/components/cotisations-rapprochement";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import {
  accountingCategories,
  accountingEntries,
  financialAccounts,
  membershipPayments,
} from "@/lib/db/schema";
import {
  anneesScolaires,
  etatDe,
  rapprochement,
  totaux,
} from "@/lib/services/cotisations";

export const dynamic = "force-dynamic";

/** L'année scolaire en cours, au sens des APEL : elle bascule en septembre. */
function anneeCourante(): string {
  const maintenant = new Date();
  const debut =
    maintenant.getMonth() >= 8
      ? maintenant.getFullYear()
      : maintenant.getFullYear() - 1;
  return `${debut}-${debut + 1}`;
}

export default async function CotisationsPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  await requireRole("admin");
  const { annee } = await searchParams;

  const annees = await anneesScolaires();
  // L'année demandée si elle existe, sinon la plus récente enregistrée, sinon
  // l'année en cours — pour qu'une association qui démarre voie un écran vide
  // mais daté, et non une erreur.
  const choisie =
    (annee && annees.includes(annee) ? annee : null) ??
    annees[0] ??
    anneeCourante();

  const [lignes, comptes, categories, recettes] = await Promise.all([
    rapprochement(choisie),
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
        affecteCents: sql<number>`coalesce((
          select sum(${membershipPayments.amountCents})
          from ${membershipPayments}
          where ${membershipPayments.entryId} = ${accountingEntries.id}
        ), 0)::int`,
      })
      .from(accountingEntries)
      .where(eq(accountingEntries.type, "income"))
      .orderBy(desc(accountingEntries.occurredAt))
      .limit(200),
  ]);

  const serialisees: LigneRapprochementView[] = lignes.map((ligne) => ({
    memberId: ligne.memberId,
    nom: ligne.nom,
    statut: ligne.statut,
    duCents: ligne.duCents,
    regleLe: ligne.regleLe?.toISOString() ?? null,
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
    affecteCents: Number(e.affecteCents),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Cotisations"
        description="Ce que les adhésions ont rapporté, et ce qui en est réellement passé dans les comptes."
        icon={HandCoins}
      />
      <CotisationsRapprochement
        annees={annees.length > 0 ? annees : [choisie]}
        anneeCourante={choisie}
        lignes={serialisees}
        totaux={totaux(lignes)}
        comptes={comptes}
        categoriesRecette={categories}
        ecrituresRecette={ecrituresRecette}
      />
    </div>
  );
}
