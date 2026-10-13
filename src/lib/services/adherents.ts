import { and, asc, eq, sql } from "drizzle-orm";

import { HttpError } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { associationMembers } from "@/lib/db/schema";
import { emptyToNull } from "@/lib/utils";
import {
  associationMemberSchema,
  associationMemberUpdateSchema,
} from "@/lib/validation";

import { recordAudit, type AuditActor } from "./audit";

function normalizedValues(
  data: ReturnType<typeof associationMemberSchema.parse>,
) {
  const nationalFeeElsewhere = data.nationalFeeElsewhere ?? false;
  return {
    userId: data.userId ?? null,
    firstName: data.firstName,
    lastName: data.lastName,
    email: emptyToNull(data.email),
    phone: emptyToNull(data.phone),
    civility: data.civility ?? null,
    streetNumber: emptyToNull(data.streetNumber),
    addressLine1: emptyToNull(data.addressLine1),
    addressLine2: emptyToNull(data.addressLine2),
    locality: emptyToNull(data.locality),
    postalCode: emptyToNull(data.postalCode),
    city: emptyToNull(data.city),
    country: data.country,
    nationalFeeElsewhere,
    // L'établissement n'a de sens que si la part nationale est réglée
    // ailleurs : un nom resté d'une saisie abandonnée ne part pas dans le
    // tableau de l'Apel départementale.
    otherSchoolName: nationalFeeElsewhere
      ? emptyToNull(data.otherSchoolName)
      : null,
    status: data.status,
    schoolYear: data.schoolYear,
    membershipFeeCents: data.membershipFeeCents,
    donationCents: data.donationCents,
    feePaidAt: data.feePaidAt ?? null,
    feePaymentMethod: data.feePaymentMethod ?? null,
    joinedAt: data.joinedAt ?? new Date(),
    notes: emptyToNull(data.notes),
  };
}

export async function listAssociationMembers() {
  return db
    .select()
    .from(associationMembers)
    .orderBy(asc(associationMembers.lastName), asc(associationMembers.firstName));
}

export async function getAssociationMember(id: string) {
  const [member] = await db
    .select()
    .from(associationMembers)
    .where(eq(associationMembers.id, id))
    .limit(1);
  return member ?? null;
}

export async function createAssociationMember(
  input: unknown,
  actor: AuditActor,
) {
  const data = associationMemberSchema.parse(input);
  const [member] = await db
    .insert(associationMembers)
    .values(normalizedValues(data))
    .returning();

  await recordAudit(actor, "adherent.create", "association_member", member.id, {
    schoolYear: member.schoolYear,
    status: member.status,
  });
  return member;
}

export async function updateAssociationMember(
  id: string,
  input: unknown,
  actor: AuditActor,
) {
  const data = associationMemberUpdateSchema.parse(input);
  const updates: Partial<typeof associationMembers.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (data.userId !== undefined) updates.userId = data.userId ?? null;
  if (data.firstName !== undefined) updates.firstName = data.firstName;
  if (data.lastName !== undefined) updates.lastName = data.lastName;
  if (data.email !== undefined) updates.email = emptyToNull(data.email);
  if (data.phone !== undefined) updates.phone = emptyToNull(data.phone);
  if (data.civility !== undefined) updates.civility = data.civility ?? null;
  if (data.streetNumber !== undefined)
    updates.streetNumber = emptyToNull(data.streetNumber);
  if (data.addressLine1 !== undefined)
    updates.addressLine1 = emptyToNull(data.addressLine1);
  if (data.addressLine2 !== undefined)
    updates.addressLine2 = emptyToNull(data.addressLine2);
  if (data.locality !== undefined)
    updates.locality = emptyToNull(data.locality);
  if (data.postalCode !== undefined)
    updates.postalCode = emptyToNull(data.postalCode);
  if (data.city !== undefined) updates.city = emptyToNull(data.city);
  if (data.country !== undefined) updates.country = data.country;
  if (data.nationalFeeElsewhere !== undefined)
    updates.nationalFeeElsewhere = data.nationalFeeElsewhere;
  if (data.otherSchoolName !== undefined)
    updates.otherSchoolName = emptyToNull(data.otherSchoolName);
  // Part nationale de nouveau réglée chez nous : l'ancien établissement
  // n'a plus lieu d'être, comme à la création.
  if (data.nationalFeeElsewhere === false) updates.otherSchoolName = null;
  if (data.status !== undefined) updates.status = data.status;
  if (data.schoolYear !== undefined) updates.schoolYear = data.schoolYear;
  if (data.membershipFeeCents !== undefined)
    updates.membershipFeeCents = data.membershipFeeCents;
  if (data.donationCents !== undefined)
    updates.donationCents = data.donationCents;
  if (data.feePaidAt !== undefined) updates.feePaidAt = data.feePaidAt ?? null;
  if (data.feePaymentMethod !== undefined)
    updates.feePaymentMethod = data.feePaymentMethod ?? null;
  if (data.joinedAt !== undefined) updates.joinedAt = data.joinedAt;
  if (data.notes !== undefined) updates.notes = emptyToNull(data.notes);

  const where =
    data.version === undefined
      ? eq(associationMembers.id, id)
      : and(
          eq(associationMembers.id, id),
          eq(associationMembers.version, data.version),
        );

  const [member] = await db
    .update(associationMembers)
    .set({
      ...updates,
      version:
        data.version === undefined
          ? sql`${associationMembers.version} + 1`
          : data.version + 1,
    })
    .where(where)
    .returning();

  if (!member) {
    const exists = await getAssociationMember(id);
    if (!exists) throw new HttpError(404, "Adhérent introuvable.");
    throw new HttpError(
      409,
      "Cet adhérent a été modifié entre-temps. Rechargez la page.",
    );
  }

  await recordAudit(actor, "adherent.update", "association_member", member.id, {
    changedFields: Object.keys(data).filter((key) => key !== "version"),
  });
  return member;
}

export async function archiveAssociationMember(
  id: string,
  actor: AuditActor,
) {
  const [member] = await db
    .update(associationMembers)
    .set({
      status: "inactive",
      version: sql`${associationMembers.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(associationMembers.id, id))
    .returning();
  if (!member) throw new HttpError(404, "Adhérent introuvable.");

  await recordAudit(actor, "adherent.archive", "association_member", id);
  return member;
}
