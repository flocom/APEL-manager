import { clientIpAddress } from "@/lib/client-ip";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

export interface AuditActor {
  userId: string;
  source: "web" | "mcp";
  oauthClientId?: string | null;
  ipAddress?: string | null;
}

export function webAuditActor(
  userId: string,
  request?: Request,
): AuditActor {
  return {
    userId,
    source: "web",
    ipAddress: clientIpAddress(request),
  };
}

/** `db`, ou la transaction en cours : `Pick` suffit, seul l'insert sert ici. */
type AuditClient = Pick<typeof db, "insert">;

/**
 * Écrit une ligne au journal.
 *
 * `client` permet d'écrire la ligne DANS la transaction de l'action qu'elle
 * décrit. Écrite après coup, elle pouvait manquer — la requête échoue entre
 * les deux, le processus redémarre — et laisser une action sans trace, ce
 * qu'un journal d'audit est justement là pour empêcher.
 */
export async function recordAudit(
  actor: AuditActor,
  action: string,
  entityType: string,
  entityId?: string | null,
  details: Record<string, unknown> = {},
  client: AuditClient = db,
): Promise<void> {
  await client.insert(auditLogs).values({
    actorUserId: actor.userId,
    oauthClientId: actor.oauthClientId ?? null,
    action,
    entityType,
    entityId: entityId ?? null,
    source: actor.source,
    ipAddress: actor.ipAddress ?? null,
    // L'auteur est aussi recopié dans le détail : `actor_user_id` passe à
    // NULL quand son compte est supprimé (clé étrangère), et la ligne ne
    // disait plus qui avait agi. L'identifiant reste, lui, et se rapproche
    // de la ligne « user.delete » qui décrit le compte supprimé.
    details: { ...details, acteurId: actor.userId },
  });
}
