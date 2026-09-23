import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

export interface AuditActor {
  userId: string;
  source: "web" | "mcp";
  oauthClientId?: string | null;
  ipAddress?: string | null;
}

/**
 * Adresse IP du client, telle que le reverse proxy la transmet.
 *
 * La première adresse de `X-Forwarded-For` : Caddy, dans le déploiement
 * Docker, comme Vercel remplacent l'en-tête reçu du client au lieu d'y
 * ajouter la leur, si bien que cette première adresse n'est pas celle que le
 * visiteur aurait choisi d'écrire.
 */
export function clientIpAddress(request?: Request): string | null {
  return (
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request?.headers.get("x-real-ip")?.trim() ||
    null
  );
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
