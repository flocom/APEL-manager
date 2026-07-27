import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

import type { Role } from "@/lib/db/schema";
import type { AuditActor } from "@/lib/services/audit";

export interface McpPrincipal {
  userId: string;
  name: string;
  email: string;
  role: Role;
  scopes: string[];
  oauthClientId: string | null;
}

const roleRank: Record<Role, number> = {
  member: 1,
  manager: 2,
  admin: 3,
};

export function requireMcpAccess(
  principal: McpPrincipal,
  scope: "mcp:read" | "mcp:write",
  minimumRole: Role = "member",
) {
  if (!principal.scopes.includes(scope)) {
    throw new Error(`Le jeton ne possède pas le scope ${scope}.`);
  }
  if (roleRank[principal.role] < roleRank[minimumRole]) {
    throw new Error(
      `Cette action nécessite au minimum le rôle ${minimumRole}.`,
    );
  }
}

export function mcpAuditActor(principal: McpPrincipal): AuditActor {
  return {
    userId: principal.userId,
    source: "mcp",
    oauthClientId: principal.oauthClientId,
  };
}

function jsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      item instanceof Date ? item.toISOString() : item,
    ),
  );
}

export function toolResult(
  value: Record<string, unknown>,
  message?: string,
): CallToolResult {
  const safe = jsonSafe(value) as Record<string, unknown>;
  return {
    content: [
      {
        type: "text",
        text: message ? `${message}\n\n${JSON.stringify(safe)}` : JSON.stringify(safe),
      },
    ],
    structuredContent: safe,
  };
}

export const readOnlyTool: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const writeTool: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

export const destructiveTool: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};
