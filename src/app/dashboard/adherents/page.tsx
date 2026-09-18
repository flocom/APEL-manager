import { asc } from "drizzle-orm";
import { ContactRound, HandCoins } from "lucide-react";
import Link from "next/link";

import {
  AdherentsManager,
  type AdherentView,
} from "@/components/adherents-manager";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { associationMembers } from "@/lib/db/schema";
import { getAssociationSettings } from "@/lib/services/association-settings";
import { etatDe, rapprochement } from "@/lib/services/cotisations";

export const dynamic = "force-dynamic";

export default async function AdherentsPage() {
  await requireRole("admin");
  const [members, settings] = await Promise.all([
    db
      .select()
      .from(associationMembers)
      .orderBy(
        asc(associationMembers.lastName),
        asc(associationMembers.firstName),
      ),
    getAssociationSettings(),
  ]);

  /**
   * Marquer une cotisation « réglée » ici ne crée aucune écriture : c'est un
   * choix, la comptabilité ne doit pas se remplir dans le dos du trésorier.
   * Encore faut-il que le décalage se voie, sinon il s'accumule en silence
   * jusqu'à l'assemblée générale. On ne regarde que l'année la plus représentée
   * parmi les fiches, celle sur laquelle on travaille.
   */
  const anneeActive = members.length > 0
    ? [...members].sort((a, b) => b.schoolYear.localeCompare(a.schoolYear))[0]
        .schoolYear
    : null;
  const horsComptes = anneeActive
    ? (await rapprochement(anneeActive)).filter(
        (ligne) => etatDe(ligne) === "manquante" && ligne.duCents > 0,
      )
    : [];

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
    joinedAt: member.joinedAt.toISOString(),
    notes: member.notes,
    version: member.version,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Adhérents"
        description="Suivez les adhésions, les coordonnées et les cotisations de l'association."
        icon={ContactRound}
      />
      {horsComptes.length > 0 && (
        <Link
          href="/dashboard/cotisations"
          className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-sand-300 bg-sand-100 px-5 py-4 transition-colors hover:border-sand-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
        >
          <HandCoins
            className="h-5 w-5 shrink-0 text-sand-900"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 text-sm font-semibold leading-6 text-sand-900">
            {horsComptes.length} cotisation
            {horsComptes.length > 1 ? "s sont marquées réglées" : " est marquée réglée"}{" "}
            pour {anneeActive} sans figurer dans les comptes, soit{" "}
            {(horsComptes.reduce((t, l) => t + l.duCents, 0) / 100).toLocaleString(
              "fr-FR",
              { style: "currency", currency: "EUR" },
            )}
            .
          </span>
          <span className="shrink-0 text-sm font-extrabold text-brand-800 underline underline-offset-4">
            Rapprocher les cotisations
          </span>
        </Link>
      )}
      <AdherentsManager
        members={serialized}
        cotisationParDefautCents={settings.membershipFeeCents}
      />
    </div>
  );
}
