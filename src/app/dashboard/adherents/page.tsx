import { asc } from "drizzle-orm";
import { ContactRound } from "lucide-react";

import {
  AdherentsManager,
  type AdherentView,
} from "@/components/adherents-manager";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { associationMembers } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function AdherentsPage() {
  await requireRole("admin");
  const members = await db
    .select()
    .from(associationMembers)
    .orderBy(asc(associationMembers.lastName), asc(associationMembers.firstName));

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
      <AdherentsManager members={serialized} />
    </div>
  );
}
