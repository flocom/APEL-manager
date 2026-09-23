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

export async function recordAudit(
  actor: AuditActor,
  action: string,
  entityType: string,
  entityId?: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(auditLogs).values({
    actorUserId: actor.userId,
    oauthClientId: actor.oauthClientId ?? null,
    action,
    entityType,
    entityId: entityId ?? null,
    source: actor.source,
    ipAddress: actor.ipAddress ?? null,
    details,
  });
}
