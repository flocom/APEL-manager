import "server-only";

import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { HttpError } from "@/lib/auth/guards";
import { hasRole } from "@/lib/auth/roles";
import { computeDueAt } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  events,
  taskAssignees,
  tasks,
  users,
  type Role,
} from "@/lib/db/schema";
import { resolveLeadTime } from "@/lib/task-lead-time";
import { emptyToNull } from "@/lib/utils";
import type { TaskInput, taskUpdateSchema } from "@/lib/validation";

import { recordAudit, type AuditActor } from "./audit";
import { evenementValide } from "./events";

/**
 * Qui peut faire quoi sur une tâche, et la trace que chaque geste laisse.
 *
 * Une tâche se partage : plusieurs membres peuvent s'en charger ensemble, et
 * « Je m'en charge » est offert à tous — c'est ainsi qu'un parent se propose
 * sans attendre qu'un organisateur pense à lui. Mais n'importe quel membre
 * pouvait se mettre sur n'importe quelle tâche, la passer à « Terminé », puis
 * s'en retirer : la tâche paraissait faite, et plus rien ne disait par qui.
 * Les règles, désormais :
 *
 *  — un membre se joint à une tâche qui n'est pas terminée, d'un événement ni
 *    annulé ni archivé ;
 *  — il ne change l'avancement que des tâches qui lui sont confiées, et rien
 *    d'autre que l'avancement ;
 *  — il ne se retire pas d'une tâche terminée : son nom reste sur ce qui a été
 *    fait. Un organisateur peut toujours corriger les responsables ;
 *  — les organisateurs gardent la main sur tout.
 *
 * Chaque geste — créer, se joindre, se retirer, changer l'avancement,
 * modifier, supprimer — s'écrit au journal avec l'avant et l'après, dans la
 * transaction du geste lui-même : une tâche ne change plus sans laisser de
 * trace.
 *
 * Les outils MCP passent par les mêmes fonctions. Ils exigent de toute façon le
 * rôle d'organisateur, et un jeton de membre n'a que la portée « lecture ».
 */

export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

/** Qui agit : son rôle décide des règles qui s'appliquent. */
export interface TaskEditor {
  id: string;
  role: Role;
}

const uuidSchema = z.string().uuid();

const CONFLIT =
  "Cette tâche a été modifiée entre-temps. Rechargez la page pour repartir de la dernière version.";

type Client = Pick<typeof db, "select">;

/**
 * Un identifiant mal formé ferait échouer Postgres sur une erreur de syntaxe,
 * rendue en « erreur serveur » au lieu de « introuvable ».
 */
function tacheValide(taskId: string) {
  if (!uuidSchema.safeParse(taskId).success) {
    throw new HttpError(404, "Tâche introuvable.");
  }
}

async function responsables(client: Client, taskId: string) {
  const lignes = await client
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, taskId))
    .orderBy(asc(taskAssignees.userId));
  return lignes.map((l) => l.userId);
}

/**
 * Les responsables choisis, dédoublonnés et triés — et seulement des comptes
 * validés. Un compte en attente ne voit rien : lui confier une tâche la
 * donnerait à quelqu'un qui ne peut même pas l'ouvrir. Un identifiant inconnu
 * ferait échouer l'écriture sur une erreur de base illisible, après que la
 * tâche a été créée.
 */
async function responsablesValides(client: Client, ids: string[]) {
  const choisis = [...new Set(ids)].sort();
  if (choisis.length === 0) return choisis;
  const connus = await client
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, choisis), isNotNull(users.approvedAt)));
  if (connus.length !== choisis.length) {
    throw new HttpError(
      400,
      "Un des membres choisis est introuvable ou en attente de validation.",
    );
  }
  return choisis;
}

/**
 * Ajoute une tâche en fin de check-list. Partagée par l'écran et l'outil MCP :
 * tous deux inséraient la tâche, puis ses responsables, sans transaction ni
 * contrôle. Un compte en attente se retrouvait responsable ; un identifiant
 * inconnu faisait échouer la seconde insertion après la première, et laissait
 * une tâche créée sans aucune ligne au journal.
 */
export async function createTask(
  eventId: string,
  data: TaskInput,
  actor: AuditActor,
) {
  evenementValide(eventId);
  const duration = resolveLeadTime(data);
  if (duration.leadTimeDays > 365) {
    throw new HttpError(400, "La durée ne peut pas dépasser un an.");
  }

  return db.transaction(async (tx) => {
    const [event] = await tx
      .select({ startAt: events.startAt })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    if (!event) throw new HttpError(404, "Événement introuvable.");

    const choisis = await responsablesValides(tx, data.assigneeIds ?? []);

    // Nouvelle tâche ajoutée en fin de check-list.
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(eq(tasks.eventId, eventId));

    const [task] = await tx
      .insert(tasks)
      .values({
        eventId,
        title: data.title,
        description: emptyToNull(data.description),
        ...duration,
        dueAt: computeDueAt(event.startAt, duration.leadTimeDays),
        position: Number(n),
      })
      .returning();

    if (choisis.length > 0) {
      await tx
        .insert(taskAssignees)
        .values(choisis.map((userId) => ({ taskId: task.id, userId })));
    }

    await recordAudit(
      actor,
      "task.create",
      "task",
      task.id,
      { eventId, title: task.title, assignees: choisis },
      tx,
    );
    return task;
  });
}

/**
 * La modification touche-t-elle autre chose que l'avancement ? C'est ce qui
 * distingue l'édition complète — réservée aux organisateurs, et verrouillée
 * par la version — du simple changement d'avancement.
 */
export function touchesTaskContent(data: TaskUpdateInput): boolean {
  return (
    data.title !== undefined ||
    data.description !== undefined ||
    data.leadTimeDays !== undefined ||
    data.leadTimeValue !== undefined ||
    data.leadTimeUnit !== undefined ||
    data.assigneeIds !== undefined
  );
}

/** « Je m'en charge » / « Me retirer » : bascule le membre courant. */
export async function toggleSelfAssignment(
  taskId: string,
  editor: TaskEditor,
  actor: AuditActor,
): Promise<{ assigned: boolean }> {
  tacheValide(taskId);
  return db.transaction(async (tx) => {
    // Verrou sur la tâche : un changement d'avancement ou de responsables
    // arrivé au même moment attend, et les contrôles portent sur l'état réel.
    const [task] = await tx
      .select({ id: tasks.id, eventId: tasks.eventId, status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .for("update");
    if (!task) throw new HttpError(404, "Tâche introuvable.");

    const organisateur = hasRole(editor, "manager");
    const avant = await responsables(tx, taskId);
    const dejaResponsable = avant.includes(editor.id);

    if (dejaResponsable) {
      if (!organisateur && task.status === "done") {
        throw new HttpError(
          409,
          "Cette tâche est terminée : votre nom reste sur ce qui a été fait. Un organisateur peut modifier les responsables si besoin.",
        );
      }
      await tx
        .delete(taskAssignees)
        .where(
          and(
            eq(taskAssignees.taskId, taskId),
            eq(taskAssignees.userId, editor.id),
          ),
        );
    } else {
      if (!organisateur) {
        if (task.status === "done") {
          throw new HttpError(
            409,
            "Cette tâche est déjà terminée : il n'y a plus à s'en charger.",
          );
        }
        const [event] = await tx
          .select({ cancelledAt: events.cancelledAt, status: events.status })
          .from(events)
          .where(eq(events.id, task.eventId))
          .limit(1);
        if (event?.cancelledAt) {
          throw new HttpError(
            409,
            "Cet événement est annulé : ses tâches sont arrêtées.",
          );
        }
        if (event?.status === "archived") {
          throw new HttpError(
            409,
            "Cet événement est archivé : ses tâches ne se reprennent plus.",
          );
        }
      }
      await tx
        .insert(taskAssignees)
        .values({ taskId, userId: editor.id })
        .onConflictDoNothing();
    }

    // Les responsables font partie du contenu que la version protège (voir
    // `touchesTaskContent`) : le formulaire d'édition renvoie toujours toute
    // la liste. Sans cette version qui avance, un organisateur qui avait
    // ouvert l'édition avant qu'un parent se joigne enregistrait l'ancienne
    // liste, et retirait ce parent sans que personne le sache. Il reçoit
    // désormais « modifiée entre-temps », et recharge.
    await tx
      .update(tasks)
      .set({ version: sql`${tasks.version} + 1` })
      .where(eq(tasks.id, taskId));

    const apres = dejaResponsable
      ? avant.filter((id) => id !== editor.id)
      : [...avant, editor.id].sort();
    await recordAudit(
      actor,
      dejaResponsable ? "task.unassign_self" : "task.assign_self",
      "task",
      taskId,
      {
        eventId: task.eventId,
        status: task.status,
        assigneesBefore: avant,
        assigneesAfter: apres,
      },
      tx,
    );
    return { assigned: !dejaResponsable };
  });
}

/**
 * Modifie une tâche : avancement pour un membre qui en a la charge, tout pour
 * un organisateur.
 *
 * `data.version`, quand elle est fournie, doit être celle de la tâche : la
 * comparaison se fait sous le verrou de la ligne, donc sans course possible.
 * Les routes web l'exigent pour une édition complète ; un simple changement
 * d'avancement s'en passe, parce qu'il ne touche aucun champ de l'édition.
 */
export async function updateTask(
  taskId: string,
  data: TaskUpdateInput,
  editor: TaskEditor,
  actor: AuditActor,
) {
  tacheValide(taskId);
  const organisateur = hasRole(editor, "manager");
  const contenu = touchesTaskContent(data);

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .for("update");
    if (!current) throw new HttpError(404, "Tâche introuvable.");

    const avant = await responsables(tx, taskId);
    if (!organisateur) {
      if (!avant.includes(editor.id)) {
        throw new HttpError(403, "Cette tâche ne vous est pas assignée.");
      }
      if (contenu) {
        throw new HttpError(
          403,
          "Vous ne pouvez modifier que l'avancement de la tâche.",
        );
      }
    }
    if (data.version !== undefined && data.version !== current.version) {
      throw new HttpError(409, CONFLIT);
    }

    // Seul ce qui change réellement est écrit, et dit au journal. Le
    // formulaire d'édition renvoie tous ses champs : les compter tous faisait
    // de chaque enregistrement « titre, description, délai modifiés », sans
    // rien apprendre, et d'un enregistrement à l'identique une nouvelle
    // version qui périmait pour rien le formulaire d'un autre organisateur.
    const updates: Partial<typeof tasks.$inferInsert> = {};
    const champs: string[] = [];
    const titreChange = data.title !== undefined && data.title !== current.title;
    if (titreChange) {
      updates.title = data.title;
      champs.push("title");
    }
    if (
      data.description !== undefined &&
      emptyToNull(data.description) !== current.description
    ) {
      updates.description = emptyToNull(data.description);
      champs.push("description");
    }
    let delai: { from: number; to: number } | undefined;
    if (
      data.leadTimeDays !== undefined ||
      data.leadTimeValue !== undefined ||
      data.leadTimeUnit !== undefined
    ) {
      const duration = resolveLeadTime(data, {
        leadTimeDays: current.leadTimeDays,
        leadTimeValue: current.leadTimeValue,
        leadTimeUnit: current.leadTimeUnit,
      });
      if (duration.leadTimeDays > 365) {
        throw new HttpError(400, "La durée ne peut pas dépasser un an.");
      }
      if (
        duration.leadTimeDays !== current.leadTimeDays ||
        duration.leadTimeValue !== current.leadTimeValue ||
        duration.leadTimeUnit !== current.leadTimeUnit
      ) {
        updates.leadTimeDays = duration.leadTimeDays;
        updates.leadTimeValue = duration.leadTimeValue;
        updates.leadTimeUnit = duration.leadTimeUnit;
        const [event] = await tx
          .select({ startAt: events.startAt })
          .from(events)
          .where(eq(events.id, current.eventId))
          .limit(1);
        if (event) {
          updates.dueAt = computeDueAt(event.startAt, duration.leadTimeDays);
        }
        champs.push("leadTime");
        if (duration.leadTimeDays !== current.leadTimeDays) {
          delai = { from: current.leadTimeDays, to: duration.leadTimeDays };
        }
      }
    }
    // Remettre le même avancement ne change rien, et ne doit pas réécrire la
    // date d'achèvement : « terminée le 3 » deviendrait « terminée le 10 ».
    const statutChange =
      data.status !== undefined && data.status !== current.status;
    if (statutChange) {
      updates.status = data.status;
      updates.completedAt = data.status === "done" ? new Date() : null;
    }

    // Les responsables : seulement des comptes validés (voir
    // `responsablesValides`).
    const apres =
      organisateur && data.assigneeIds !== undefined
        ? await responsablesValides(tx, data.assigneeIds)
        : avant;
    const responsablesChangent =
      apres.length !== avant.length || apres.some((id, i) => id !== avant[i]);
    const contenuChange = champs.length > 0 || responsablesChangent;

    // Rien ne change : ni écriture, ni version, ni ligne au journal.
    if (!statutChange && !contenuChange) return current;

    // La version avance à chaque changement du contenu, pas à un simple
    // changement d'avancement : ce sont des champs distincts, et un formulaire
    // d'édition ouvert n'a pas à devenir périmé parce qu'une tâche a été
    // cochée.
    const [task] = await tx
      .update(tasks)
      .set({
        ...updates,
        ...(contenuChange ? { version: sql`${tasks.version} + 1` } : {}),
      })
      .where(eq(tasks.id, taskId))
      .returning();

    if (responsablesChangent) {
      await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
      if (apres.length > 0) {
        await tx
          .insert(taskAssignees)
          .values(apres.map((userId) => ({ taskId, userId })));
      }
    }

    const avancement = statutChange
      ? { from: current.status, to: data.status }
      : undefined;
    if (!contenuChange) {
      await recordAudit(
        actor,
        "task.status_change",
        "task",
        taskId,
        { eventId: current.eventId, ...avancement },
        tx,
      );
    } else {
      await recordAudit(
        actor,
        "task.update",
        "task",
        taskId,
        {
          eventId: current.eventId,
          changedFields: [
            ...champs,
            ...(statutChange ? ["status"] : []),
            ...(responsablesChangent ? ["assignees"] : []),
          ],
          ...(titreChange
            ? { title: { from: current.title, to: data.title } }
            : {}),
          ...(delai ? { leadTimeDays: delai } : {}),
          ...(avancement ? { status: avancement } : {}),
          ...(responsablesChangent
            ? { assigneesBefore: avant, assigneesAfter: apres }
            : {}),
        },
        tx,
      );
    }
    return task;
  });
}

/** Supprime une tâche ; le journal garde ce qu'elle était. */
export async function deleteTask(taskId: string, actor: AuditActor) {
  tacheValide(taskId);
  return db.transaction(async (tx) => {
    const avant = await responsables(tx, taskId);
    const [deleted] = await tx
      .delete(tasks)
      .where(eq(tasks.id, taskId))
      .returning({
        id: tasks.id,
        eventId: tasks.eventId,
        title: tasks.title,
        status: tasks.status,
      });
    if (!deleted) throw new HttpError(404, "Tâche introuvable.");
    await recordAudit(
      actor,
      "task.delete",
      "task",
      taskId,
      {
        eventId: deleted.eventId,
        title: deleted.title,
        status: deleted.status,
        assignees: avant,
      },
      tx,
    );
    return deleted;
  });
}
