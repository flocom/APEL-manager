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
    ipAddress:
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request?.headers.get("x-real-ip") ??
      null,
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
