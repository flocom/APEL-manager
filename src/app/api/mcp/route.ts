import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import {
  authenticateMcpRequest,
  getMcpAuthenticationChallenge,
  getMcpResourceUrl,
} from "@/lib/mcp/oauth";
import { createApelMcpServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED_METHODS = "GET, POST, DELETE, OPTIONS";
const ALLOWED_HEADERS = [
  "Authorization",
  "Content-Type",
  "Accept",
  "MCP-Protocol-Version",
  "Mcp-Session-Id",
  "Last-Event-ID",
].join(", ");

function allowedOrigins(request: Request): Set<string> {
  const resourceOrigin = new URL(getMcpResourceUrl(request)).origin;
  return new Set([
    resourceOrigin,
    "https://claude.ai",
    "https://www.claude.ai",
  ]);
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Expose-Headers":
      "Mcp-Session-Id, MCP-Protocol-Version, WWW-Authenticate",
    Vary: "Origin",
  });
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins(request).has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  corsHeaders(request).forEach((value, key) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function validateRequestSource(request: Request): Response | null {
  const resource = new URL(getMcpResourceUrl(request));
  const host = request.headers.get("host")?.toLowerCase();
  const expectedHost = resource.host.toLowerCase();
  const localHosts = new Set([
    "localhost:3000",
    "127.0.0.1:3000",
    "[::1]:3000",
  ]);
  if (
    host &&
    host !== expectedHost &&
    !(process.env.NODE_ENV !== "production" && localHosts.has(host))
  ) {
    return new Response(
      JSON.stringify({ error: "Host MCP non autorisé." }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins(request).has(origin)) {
    return new Response(
      JSON.stringify({ error: "Origine MCP non autorisée." }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  return null;
}

function unauthorized(request: Request) {
  return withCors(
    request,
    new Response(
      JSON.stringify({
        error: "unauthorized",
        error_description: "Un jeton OAuth valide est requis.",
      }),
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json; charset=utf-8",
          "WWW-Authenticate": getMcpAuthenticationChallenge(request),
        },
      },
    ),
  );
}

async function handleMcp(request: Request): Promise<Response> {
  const invalidSource = validateRequestSource(request);
  if (invalidSource) return withCors(request, invalidSource);

  const authentication = await authenticateMcpRequest(request);
  if (!authentication) return unauthorized(request);

  const server = createApelMcpServer({
    userId: authentication.user.id,
    name: authentication.user.name,
    email: authentication.user.email,
    role: authentication.role,
    scopes: authentication.scopes,
    oauthClientId: authentication.oauthClientId,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, {
      authInfo: {
        token: "oauth",
        clientId: authentication.clientId,
        scopes: authentication.scopes,
        extra: {
          userId: authentication.user.id,
          role: authentication.role,
        },
      },
    });
    return withCors(request, response);
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

export async function GET(request: Request) {
  return handleMcp(request);
}

export async function POST(request: Request) {
  return handleMcp(request);
}

export async function DELETE(request: Request) {
  return handleMcp(request);
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
