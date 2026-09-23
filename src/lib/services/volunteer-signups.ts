import "server-only";

import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { HttpError } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { volunteerSignups, volunteerSlots } from "@/lib/db/schema";
import { emptyToNull } from "@/lib/utils";
import { slotSchema } from "@/lib/validation";

import { recordAudit, type AuditActor } from "./audit";

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

/**
 * Un identifiant mal formé ferait échouer Postgres sur une erreur de syntaxe,
 * rendue en « erreur serveur » au lieu de « introuvable ».
 */
function creneauValide(slotId: string) {
  if (!z.string().uuid().safeParse(slotId).success) {
    throw new HttpError(404, "Créneau introuvable.");
  }
}

/**
 * Modifie un créneau. Partagée par l'écran et l'outil MCP : l'outil écrivait
 * sa propre mise à jour, sans verrou ni comptage, et descendait sans rien dire
 * une capacité sous le nombre d'inscrits que l'écran, lui, refusait.
 *
 * Le verrou est celui de l'inscription (voir `insertSignupWithinCapacity`) :
 * une inscription qui arrive pendant qu'on baisse la capacité attend, et le
 * comptage la voit.
 */
export async function updateVolunteerSlot(
  slotId: string,
  input: unknown,
  actor: AuditActor,
) {
  creneauValide(slotId);
  const data = slotSchema.partial().parse(input);

  const updates: Partial<typeof volunteerSlots.$inferInsert> = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) {
    updates.description = emptyToNull(data.description);
  }
  if (data.capacity !== undefined) updates.capacity = data.capacity;
  if (data.startAt !== undefined) updates.startAt = data.startAt ?? null;
  if (data.endAt !== undefined) updates.endAt = data.endAt ?? null;

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(volunteerSlots)
      .where(eq(volunteerSlots.id, slotId))
      .for("update");
    if (!current) throw new HttpError(404, "Créneau introuvable.");

    // Seul ce qui change réellement compte : le formulaire renvoie tous ses
    // champs, et un journal qui dit « titre modifié » quand le titre est le
    // même n'apprend rien à celui qui cherche ce qui a bougé.
    const identique = (a: unknown, b: unknown) =>
      a instanceof Date && b instanceof Date
        ? a.getTime() === b.getTime()
        : (a ?? null) === (b ?? null);
    const changedFields = (
      Object.keys(updates) as (keyof typeof updates)[]
    ).filter((cle) => !identique(current[cle], updates[cle]));
    if (changedFields.length === 0) return current;

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

    // Descendre la capacité sous le nombre d'inscrits laisserait des
    // bénévoles au-delà de la limite annoncée, sans indiquer lesquels
    // retirer.
    if (updates.capacity !== undefined) {
      const [signups] = await tx
        .select({ total: count() })
        .from(volunteerSignups)
        .where(eq(volunteerSignups.slotId, slotId));
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
      .where(eq(volunteerSlots.id, slotId))
      .returning();

    await recordAudit(
      actor,
      "volunteer_slot.update",
      "volunteer_slot",
      slotId,
      {
        eventId: current.eventId,
        changedFields,
        ...(updates.capacity !== undefined &&
        updates.capacity !== current.capacity
          ? { capacity: { from: current.capacity, to: updates.capacity } }
          : {}),
      },
      tx,
    );
    return updated;
  });
}

/**
 * Supprime un créneau, et avec lui ses inscriptions. Le journal dit combien de
 * bénévoles perdent leur place : c'est ce qu'on cherche quand l'un d'eux
 * demande pourquoi il n'apparaît plus.
 *
 * Le créneau est verrouillé avant le comptage : une inscription arrivée entre
 * les deux partirait avec la cascade sans figurer dans le compte.
 */
export async function deleteVolunteerSlot(slotId: string, actor: AuditActor) {
  creneauValide(slotId);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: volunteerSlots.id,
        eventId: volunteerSlots.eventId,
        title: volunteerSlots.title,
      })
      .from(volunteerSlots)
      .where(eq(volunteerSlots.id, slotId))
      .for("update");
    if (!current) throw new HttpError(404, "Créneau introuvable.");

    const [signups] = await tx
      .select({ total: count() })
      .from(volunteerSignups)
      .where(eq(volunteerSignups.slotId, slotId));
    await tx.delete(volunteerSlots).where(eq(volunteerSlots.id, slotId));
    await recordAudit(
      actor,
      "volunteer_slot.delete",
      "volunteer_slot",
      slotId,
      {
        eventId: current.eventId,
        title: current.title,
        inscriptions: Number(signups?.total ?? 0),
      },
      tx,
    );
    return current;
  });
}
