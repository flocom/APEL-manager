import "server-only";

import { asc, eq } from "drizzle-orm";

import { HttpError } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { eventAttachments, events, users } from "@/lib/db/schema";
import { eventAttachmentSchema } from "@/lib/validation";

import { recordAudit, type AuditActor } from "./audit";

export async function listEventAttachments(eventId: string) {
  return db
    .select({
      id: eventAttachments.id,
      eventId: eventAttachments.eventId,
      label: eventAttachments.label,
      fileUrl: eventAttachments.fileUrl,
      uploadedBy: eventAttachments.uploadedBy,
      uploaderName: users.name,
      createdAt: eventAttachments.createdAt,
    })
    .from(eventAttachments)
    .leftJoin(users, eq(eventAttachments.uploadedBy, users.id))
    .where(eq(eventAttachments.eventId, eventId))
    .orderBy(asc(eventAttachments.createdAt));
}

export async function createEventAttachment(
  eventId: string,
  input: unknown,
  actor: AuditActor,
) {
  const data = eventAttachmentSchema.parse(input);
  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) throw new HttpError(404, "Événement introuvable.");

  const [attachment] = await db
    .insert(eventAttachments)
    .values({
      eventId,
      label: data.label,
      fileUrl: data.fileUrl,
      uploadedBy: actor.userId,
    })
    .returning();

  await recordAudit(
    actor,
    "event_attachment.create",
    "event_attachment",
    attachment.id,
    { eventId, label: attachment.label },
  );
  return attachment;
}

/**
 * Retire la pièce de l'événement. Le fichier reste dans le volume : il peut
 * être référencé ailleurs, et sa suppression relève du nettoyage périodique.
 */
export async function deleteEventAttachment(id: string, actor: AuditActor) {
  const [deleted] = await db
    .delete(eventAttachments)
    .where(eq(eventAttachments.id, id))
    .returning({
      id: eventAttachments.id,
      eventId: eventAttachments.eventId,
      label: eventAttachments.label,
    });
  if (!deleted) throw new HttpError(404, "Pièce jointe introuvable.");

  await recordAudit(
    actor,
    "event_attachment.delete",
    "event_attachment",
    id,
    { eventId: deleted.eventId, label: deleted.label },
  );
  return deleted;
}
