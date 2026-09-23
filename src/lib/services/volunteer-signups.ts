import "server-only";

import { and, count, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { volunteerSignups, volunteerSlots } from "@/lib/db/schema";

export type SignupInsertResult =
  | { ok: true; id: string; capacity: number; taken: number }
  | { ok: false; reason: "introuvable" | "complet" | "doublon" };

/**
 * Inscrit un bénévole sur un créneau sans jamais en dépasser la capacité.
 *
 * L'ancienne insertion conditionnelle — `INSERT … WHERE (SELECT count(*)) <
 * capacité` — ne tenait pas sous la concurrence : chaque requête compte les
 * inscriptions validées au moment où elle démarre, et vingt parents qui
 * cliquent en même temps sur les trois dernières places voyaient tous « deux
 * inscrits », et passaient tous. Le créneau affichait alors vingt bénévoles
 * pour trois postes, et personne ne savait qui renvoyer.
 *
 * Le verrou sur la ligne du créneau (`SELECT … FOR UPDATE`) met les
 * inscriptions d'un même créneau en file : la suivante ne compte qu'une fois
 * la précédente validée, et voit donc sa ligne. Les autres créneaux ne sont
 * pas ralentis. La capacité est relue sous ce verrou, là encore pour ne pas
 * se fier à une valeur qu'un organisateur vient de baisser (la modification
 * du créneau prend le même verrou).
 *
 * Le doublon d'adresse est vérifié sous le même verrou, donc sans course ;
 * l'index unique `(slot_id, lower(email))` reste le dernier rempart.
 */
export async function insertSignupWithinCapacity(signup: {
  slotId: string;
  userId?: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  cancelToken: string;
}): Promise<SignupInsertResult> {
  try {
    return await db.transaction(async (tx) => {
      const [slot] = await tx
        .select({ id: volunteerSlots.id, capacity: volunteerSlots.capacity })
        .from(volunteerSlots)
        .where(eq(volunteerSlots.id, signup.slotId))
        .for("update");
      if (!slot) return { ok: false, reason: "introuvable" } as const;

      const [{ pris }] = await tx
        .select({ pris: count() })
        .from(volunteerSignups)
        .where(eq(volunteerSignups.slotId, slot.id));
      if (Number(pris) >= slot.capacity) {
        return { ok: false, reason: "complet" } as const;
      }

      if (signup.email) {
        const [doublon] = await tx
          .select({ id: volunteerSignups.id })
          .from(volunteerSignups)
          .where(
            and(
              eq(volunteerSignups.slotId, slot.id),
              sql`lower(${volunteerSignups.email}) = lower(${signup.email})`,
            ),
          )
          .limit(1);
        if (doublon) return { ok: false, reason: "doublon" } as const;
      }

      const [created] = await tx
        .insert(volunteerSignups)
        .values({
          slotId: slot.id,
          userId: signup.userId ?? null,
          name: signup.name,
          email: signup.email,
          phone: signup.phone,
          cancelToken: signup.cancelToken,
        })
        .returning({ id: volunteerSignups.id });
      return {
        ok: true,
        id: created.id,
        capacity: slot.capacity,
        taken: Number(pris) + 1,
      } as const;
    });
  } catch (error) {
    // L'index unique a tranché. Sous le verrou, le contrôle ci-dessus suffit ;
    // une écriture ajoutée un jour sans passer par ici serait encore retenue.
    if ((error as { code?: string })?.code === "23505") {
      return { ok: false, reason: "doublon" };
    }
    throw error;
  }
}
