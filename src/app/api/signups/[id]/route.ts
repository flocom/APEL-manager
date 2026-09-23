import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, HttpError, requireApiRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { volunteerSignups, volunteerSlots } from "@/lib/db/schema";
import { recordAudit, webAuditActor } from "@/lib/services/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * Retire un bénévole d'un créneau, depuis le tableau de bord.
 *
 * Le geste efface l'engagement d'un tiers, qui n'en est pas prévenu : il ne
 * laissait aucune trace, et « je m'étais inscrit, je n'apparais plus » restait
 * sans réponse. Le journal garde le créneau et l'événement, pas les
 * coordonnées de la personne — elles n'ont plus de raison d'être conservées.
 */
export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireApiRole("manager");
    const { id } = await params;
    // Un identifiant mal formé n'est pas une inscription : sans ce contrôle,
    // PostgreSQL refusait la comparaison avec la colonne uuid et la route
    // répondait 500, comme pour une vraie panne.
    if (!z.string().uuid().safeParse(id).success) {
      throw new HttpError(404, "Inscription introuvable.");
    }
    const [deleted] = await db
      .delete(volunteerSignups)
      .where(eq(volunteerSignups.id, id))
      .returning({ id: volunteerSignups.id, slotId: volunteerSignups.slotId });
    if (!deleted) throw new HttpError(404, "Inscription introuvable.");
    const [slot] = await db
      .select({ eventId: volunteerSlots.eventId })
      .from(volunteerSlots)
      .where(eq(volunteerSlots.id, deleted.slotId))
      .limit(1);
    await recordAudit(
      webAuditActor(user.id, req),
      "volunteer_signup.delete",
      "volunteer_signup",
      id,
      { slotId: deleted.slotId, eventId: slot?.eventId ?? null },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
