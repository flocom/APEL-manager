import { count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { volunteerSignups, volunteerSlots } from "@/lib/db/schema";
import { recordAudit, webAuditActor } from "@/lib/services/audit";
import { emptyToNull } from "@/lib/utils";
import { slotSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const { id } = await params;
    const data = slotSchema.partial().parse(await req.json());

    const updates: Partial<typeof volunteerSlots.$inferInsert> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) {
      updates.description = emptyToNull(data.description);
    }
    if (data.capacity !== undefined) updates.capacity = data.capacity;
    if (data.startAt !== undefined) updates.startAt = data.startAt ?? null;
    if (data.endAt !== undefined) updates.endAt = data.endAt ?? null;

    const slot = await db.transaction(async (tx) => {
      // Le même verrou que l'inscription (voir `insertSignupWithinCapacity`) :
      // une inscription qui arrive pendant qu'on baisse la capacité attend, et
      // le comptage ci-dessous la voit.
      const [current] = await tx
        .select()
        .from(volunteerSlots)
        .where(eq(volunteerSlots.id, id))
        .for("update");
      if (!current) throw new HttpError(404, "Créneau introuvable.");

      if (Object.keys(updates).length === 0) return current;

      // Une fin antérieure au début produirait une durée négative, affichée à
      // l'envers sur la page publique d'inscription.
      const startAt =
        updates.startAt !== undefined ? updates.startAt : current.startAt;
      const endAt =
        updates.endAt !== undefined ? updates.endAt : current.endAt;
      if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
        throw new HttpError(
          400,
          "La fin du créneau doit être postérieure à son début.",
        );
      }

      // Descendre la capacité sous le nombre d'inscrits laisserait des
      // bénévoles au-delà de la limite annoncée, sans indiquer lesquels
      // retirer.
      if (updates.capacity !== undefined) {
        const [signups] = await tx
          .select({ total: count() })
          .from(volunteerSignups)
          .where(eq(volunteerSignups.slotId, id));
        const total = Number(signups?.total ?? 0);
        if (updates.capacity < total) {
          throw new HttpError(
            409,
            `Ce créneau compte déjà ${total} inscription(s) : la capacité ne peut pas descendre en dessous.`,
          );
        }
      }

      const [updated] = await tx
        .update(volunteerSlots)
        .set(updates)
        .where(eq(volunteerSlots.id, id))
        .returning();

      await recordAudit(
        webAuditActor(user.id, req),
        "volunteer_slot.update",
        "volunteer_slot",
        id,
        {
          eventId: current.eventId,
          changedFields: Object.keys(updates),
          ...(updates.capacity !== undefined &&
          updates.capacity !== current.capacity
            ? { capacity: { from: current.capacity, to: updates.capacity } }
            : {}),
        },
        tx,
      );
      return updated;
    });

    return NextResponse.json({ ok: true, slot });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Supprime un créneau, et avec lui ses inscriptions. Le journal dit combien de
 * bénévoles perdent leur place : c'est ce qu'on cherche quand l'un d'eux
 * demande pourquoi il n'apparaît plus.
 */
export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const { id } = await params;
    await db.transaction(async (tx) => {
      const [signups] = await tx
        .select({ total: count() })
        .from(volunteerSignups)
        .where(eq(volunteerSignups.slotId, id));
      const [deleted] = await tx
        .delete(volunteerSlots)
        .where(eq(volunteerSlots.id, id))
        .returning({
          id: volunteerSlots.id,
          eventId: volunteerSlots.eventId,
          title: volunteerSlots.title,
        });
      if (!deleted) throw new HttpError(404, "Créneau introuvable.");
      await recordAudit(
        webAuditActor(user.id, req),
        "volunteer_slot.delete",
        "volunteer_slot",
        id,
        {
          eventId: deleted.eventId,
          title: deleted.title,
          inscriptions: Number(signups?.total ?? 0),
        },
        tx,
      );
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
