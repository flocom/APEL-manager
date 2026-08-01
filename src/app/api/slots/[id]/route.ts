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

    const [current] = await db
      .select()
      .from(volunteerSlots)
      .where(eq(volunteerSlots.id, id))
      .limit(1);
    if (!current) throw new HttpError(404, "Créneau introuvable.");

    const updates: Partial<typeof volunteerSlots.$inferInsert> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) {
      updates.description = emptyToNull(data.description);
    }
    if (data.capacity !== undefined) updates.capacity = data.capacity;
    if (data.startAt !== undefined) updates.startAt = data.startAt ?? null;
    if (data.endAt !== undefined) updates.endAt = data.endAt ?? null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true, slot: current });
    }

    // Une fin antérieure au début produirait une durée négative, affichée à
    // l'envers sur la page publique d'inscription.
    const startAt =
      updates.startAt !== undefined ? updates.startAt : current.startAt;
    const endAt = updates.endAt !== undefined ? updates.endAt : current.endAt;
    if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
      throw new HttpError(
        400,
        "La fin du créneau doit être postérieure à son début.",
      );
    }

    // Descendre la capacité sous le nombre d'inscrits laisserait des bénévoles
    // au-delà de la limite annoncée, sans indiquer lesquels retirer.
    if (updates.capacity !== undefined) {
      const [signups] = await db
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

    const [slot] = await db
      .update(volunteerSlots)
      .set(updates)
      .where(eq(volunteerSlots.id, id))
      .returning();

    await recordAudit(
      webAuditActor(user.id, req),
      "volunteer_slot.update",
      "volunteer_slot",
      id,
      { changedFields: Object.keys(updates) },
    );

    return NextResponse.json({ ok: true, slot });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const { id } = await params;
    await db.delete(volunteerSlots).where(eq(volunteerSlots.id, id));
    await recordAudit(
      webAuditActor(user.id, req),
      "volunteer_slot.delete",
      "volunteer_slot",
      id,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
