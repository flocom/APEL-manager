import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";

import { APP_NAME } from "@/lib/app-config";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  oauthAuthorizationCodes,
  oauthClients,
  oauthTokens,
  users,
  type Role,
} from "@/lib/db/schema";
import { getAssociationSettings } from "@/lib/services/association-settings";

const MCP_PATH = "/api/mcp";
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTHORIZATION_CODE_TTL_MS = 10 * 60 * 1000;
const CONSENT_TOKEN_TTL_SECONDS = 10 * 60;
const MAX_PARAMETER_LENGTH = 2_048;
const MAX_CONSENT_TOKEN_LENGTH = 16_384;

export const MCP_OAUTH_SCOPES = ["mcp:read", "mcp:write"] as const;

type McpOAuthScope = (typeof MCP_OAUTH_SCOPES)[number];
type TokenEndpointAuthMethod =
  | "none"
  | "client_secret_post"
  | "client_secret_basic";
type OAuthGrantType = "authorization_code" | "refresh_token";

type OAuthClientRow = typeof oauthClients.$inferSelect;

type AuthorizationRequest = {
  clientInternalId: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  state?: string;
  resource: string;
};

type ConsentTokenPayload = AuthorizationRequest & {
  version: 1;
  userId: string;
  expiresAt: number;
};

export type AuthenticatedMcpRequest = {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  role: Role;
  scopes: string[];
  /** Identifiant public OAuth, utile dans les réponses et les journaux externes. */
  clientId: string;
  /** UUID interne à utiliser pour les relations et le journal d’audit. */
  oauthClientId: string;
};

class OAuthProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "OAuthProtocolError";
  }
}

function noStoreHeaders(
  contentType = "application/json; charset=utf-8",
): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  const responseHeaders = noStoreHeaders();
  if (headers) {
    new Headers(headers).forEach((value, key) => {
      responseHeaders.set(key, value);
    });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function oauthErrorResponse(error: unknown): Response {
  if (error instanceof OAuthProtocolError) {
    const headers: HeadersInit | undefined =
      error.code === "invalid_client"
        ? { "WWW-Authenticate": 'Basic realm="APEL MCP OAuth"' }
        : undefined;
    return jsonResponse(
      {
        error: error.code,
        error_description: error.message,
      },
      error.status,
      headers,
    );
  }

  console.error("[oauth] erreur inattendue:", error);
  return jsonResponse(
    {
      error: "server_error",
      error_description: "Le serveur OAuth a rencontré une erreur.",
    },
    500,
  );
}

function randomOpaqueToken(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function base64UrlSha256(value: string): string {
  return createHash("sha256").update(value, "ascii").digest("base64url");
}

function equalStrings(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function getConsentSecret(): Buffer {
  const secret = process.env.OAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "OAUTH_SECRET ou AUTH_SECRET doit contenir au moins 32 caractères.",
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

function normalizeConfiguredUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} doit être une URL absolue valide.`);
  }
  if (!isSecurePublicUrl(url)) {
    throw new Error(`${label} doit utiliser HTTPS (HTTP permis en local).`);
  }
  return url;
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function isSecurePublicUrl(url: URL): boolean {
  return url.protocol === "https:" || (
    url.protocol === "http:" && isLoopbackHost(url.hostname)
  );
}

function requestOrigin(request: Request): string {
  const configured =
    process.env.OAUTH_ISSUER?.trim() ||
    process.env.MCP_BASE_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    const url = normalizeConfiguredUrl(configured, "L’URL publique OAuth");
    return url.origin;
  }
  return normalizeConfiguredUrl(request.url, "L’URL de la requête").origin;
}

export function getOAuthIssuer(request: Request): string {
  const configured = process.env.OAUTH_ISSUER?.trim();
  if (configured) {
    const url = normalizeConfiguredUrl(configured, "OAUTH_ISSUER");
    return url.href.replace(/\/$/, "");
  }
  return requestOrigin(request);
}

export function getMcpResourceUrl(request: Request): string {
  const configured = process.env.MCP_RESOURCE_URL?.trim();
  if (configured) {
    const url = normalizeConfiguredUrl(configured, "MCP_RESOURCE_URL");
    if (url.pathname !== MCP_PATH || url.search || url.hash) {
      throw new Error(
        `MCP_RESOURCE_URL doit pointer exactement vers ${MCP_PATH}.`,
      );
    }
    return url.href;
  }
  return new URL(MCP_PATH, `${requestOrigin(request)}/`).href;
}

function metadataCorsHeaders(): Headers {
  const headers = noStoreHeaders();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  return headers;
}

export function oauthMetadataOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: metadataCorsHeaders(),
  });
}

export function oauthAuthorizationServerMetadata(request: Request): Response {
  try {
    const issuer = getOAuthIssuer(request);
    return new Response(
      JSON.stringify({
        issuer,
        authorization_endpoint: `${issuer}/api/oauth/authorize`,
        token_endpoint: `${issuer}/api/oauth/token`,
        revocation_endpoint: `${issuer}/api/oauth/revoke`,
        registration_endpoint: `${issuer}/api/oauth/register`,
        response_types_supported: ["code"],
        response_modes_supported: ["query"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: [
          "none",
          "client_secret_post",
          "client_secret_basic",
        ],
        revocation_endpoint_auth_methods_supported: [
          "none",
          "client_secret_post",
          "client_secret_basic",
        ],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: MCP_OAUTH_SCOPES,
      }),
      { headers: metadataCorsHeaders() },
    );
  } catch (error) {
    return oauthErrorResponse(error);
  }
}

export function oauthProtectedResourceMetadata(request: Request): Response {
  try {
    return new Response(
      JSON.stringify({
        resource: getMcpResourceUrl(request),
        resource_name: `${APP_NAME} — serveur MCP`,
        authorization_servers: [getOAuthIssuer(request)],
        bearer_methods_supported: ["header"],
        scopes_supported: MCP_OAUTH_SCOPES,
      }),
      { headers: metadataCorsHeaders() },
    );
  } catch (error) {
    return oauthErrorResponse(error);
  }
}

export function getMcpAuthenticationChallenge(
  request: Request,
  scopes: readonly string[] = MCP_OAUTH_SCOPES,
): string {
  const metadataUrl = new URL(
    "/.well-known/oauth-protected-resource/mcp",
    getMcpResourceUrl(request),
  ).href;
  return `Bearer resource_metadata="${metadataUrl}", scope="${scopes.join(" ")}"`;
}

function parseStringArray(
  value: unknown,
  field: string,
  defaults: readonly string[],
): string[] {
  if (value === undefined) return [...defaults];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 20 ||
    value.some((item) => typeof item !== "string")
  ) {
    throw new OAuthProtocolError(
      "invalid_client_metadata",
      `${field} doit être une liste non vide de chaînes.`,
    );
  }
  return [...new Set(value as string[])];
}

function validateRedirectUri(value: string): string {
  if (value.length > MAX_PARAMETER_LENGTH) {
    throw new OAuthProtocolError(
      "invalid_redirect_uri",
      "L’URI de redirection est trop longue.",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OAuthProtocolError(
      "invalid_redirect_uri",
      "L’URI de redirection est invalide.",
    );
  }

  if (
    !isSecurePublicUrl(url) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new OAuthProtocolError(
      "invalid_redirect_uri",
      "Les redirections doivent utiliser HTTPS, ou HTTP sur localhost, sans fragment.",
    );
  }
  return url.href;
}

function normalizeScopes(value: string | undefined): string[] {
  if (!value) return [...MCP_OAUTH_SCOPES];
  if (value.length > MAX_PARAMETER_LENGTH) {
    throw new OAuthProtocolError(
      "invalid_scope",
      "La portée demandée est trop longue.",
    );
  }
  const scopes = [...new Set(value.split(/\s+/).filter(Boolean))];
  if (
    scopes.length === 0 ||
    scopes.some(
      (scope) =>
        !MCP_OAUTH_SCOPES.includes(scope as McpOAuthScope),
    )
  ) {
    throw new OAuthProtocolError(
      "invalid_scope",
      "Une ou plusieurs portées demandées ne sont pas disponibles.",
    );
  }
  return scopes;
}

function ensureScopeSubset(requested: string[], allowed: string[]): void {
  if (requested.some((scope) => !allowed.includes(scope))) {
    throw new OAuthProtocolError(
      "invalid_scope",
      "Le client n’est pas autorisé à demander cette portée.",
    );
  }
}

function isTokenEndpointAuthMethod(
  value: string,
): value is TokenEndpointAuthMethod {
  return [
    "none",
    "client_secret_post",
    "client_secret_basic",
  ].includes(value);
}

function isGrantType(value: string): value is OAuthGrantType {
  return value === "authorization_code" || value === "refresh_token";
}

export async function registerOAuthClient(
  request: Request,
): Promise<Response> {
  try {
    if (!request.headers.get("content-type")?.includes("application/json")) {
      throw new OAuthProtocolError(
        "invalid_client_metadata",
        "Le corps doit être envoyé en application/json.",
      );
    }

    let parsedBody: unknown;
    try {
      const rawBody = await request.text();
      if (rawBody.length > 32_768) {
        throw new OAuthProtocolError(
          "invalid_client_metadata",
          "Le document d’enregistrement est trop volumineux.",
        );
      }
      parsedBody = JSON.parse(rawBody);
    } catch (error) {
      if (error instanceof OAuthProtocolError) throw error;
      throw new OAuthProtocolError(
        "invalid_client_metadata",
        "Le document d’enregistrement n’est pas un JSON valide.",
      );
    }
    if (
      !parsedBody ||
      typeof parsedBody !== "object" ||
      Array.isArray(parsedBody)
    ) {
      throw new OAuthProtocolError(
        "invalid_client_metadata",
        "Le document d’enregistrement doit être un objet JSON.",
      );
    }
    const body = parsedBody as Record<string, unknown>;
    const name =
      typeof body.client_name === "string" ? body.client_name.trim() : "";
    if (!name || name.length > 120) {
      throw new OAuthProtocolError(
        "invalid_client_metadata",
        "client_name est requis et limité à 120 caractères.",
      );
    }

    const rawRedirectUris = parseStringArray(
      body.redirect_uris,
      "redirect_uris",
      [],
    );
    if (rawRedirectUris.length > 10) {
      throw new OAuthProtocolError(
        "invalid_client_metadata",
        "Un client ne peut pas enregistrer plus de 10 redirections.",
      );
    }
    const redirectUris = rawRedirectUris.map(validateRedirectUri);

    const authMethod =
      typeof body.token_endpoint_auth_method === "string"
        ? body.token_endpoint_auth_method
        : "none";
    if (!isTokenEndpointAuthMethod(authMethod)) {
      throw new OAuthProtocolError(
        "invalid_client_metadata",
        "Méthode d’authentification du client non prise en charge.",
      );
    }

    const grantTypes = parseStringArray(
      body.grant_types,
      "grant_types",
      ["authorization_code", "refresh_token"],
    );
    if (
      !grantTypes.includes("authorization_code") ||
      grantTypes.some((grantType) => !isGrantType(grantType))
    ) {
      throw new OAuthProtocolError(
        "invalid_client_metadata",
        "Seuls authorization_code et refresh_token sont pris en charge.",
      );
    }

    const responseTypes = parseStringArray(
      body.response_types,
      "response_types",
      ["code"],
    );
    if (responseTypes.length !== 1 || responseTypes[0] !== "code") {
      throw new OAuthProtocolError(
        "invalid_client_metadata",
        "Seul response_type=code est pris en charge.",
      );
    }

    const requestedScopes =
      typeof body.scope === "string" ? body.scope : undefined;
    const scopes = normalizeScopes(requestedScopes);
    const clientId = randomOpaqueToken("mcp_client_");
    const clientSecret =
      authMethod === "none" ? undefined : randomOpaqueToken("mcp_secret_");
    const now = new Date();

    await db.insert(oauthClients).values({
      clientId,
      name,
      clientSecretHash: clientSecret ? sha256(clientSecret) : null,
      redirectUris,
      tokenEndpointAuthMethod: authMethod,
      grantTypes,
      scopes,
      enabled: true,
      updatedAt: now,
    });

    return jsonResponse(
      {
        client_id: clientId,
        client_name: name,
        redirect_uris: redirectUris,
        token_endpoint_auth_method: authMethod,
        grant_types: grantTypes,
        response_types: ["code"],
        scope: scopes.join(" "),
        client_id_issued_at: Math.floor(now.getTime() / 1000),
        ...(clientSecret
          ? {
              client_secret: clientSecret,
              client_secret_expires_at: 0,
            }
          : {}),
      },
      201,
    );
  } catch (error) {
    return oauthErrorResponse(error);
  }
}

function getSingleParameter(
  parameters: URLSearchParams,
  name: string,
  required = true,
): string | undefined {
  const values = parameters.getAll(name);
  if (values.length > 1) {
    throw new OAuthProtocolError(
      "invalid_request",
      `Le paramètre ${name} ne doit apparaître qu’une fois.`,
    );
  }
  const value = values[0];
  if (required && !value) {
    throw new OAuthProtocolError(
      "invalid_request",
      `Le paramètre ${name} est requis.`,
    );
  }
  if (value && value.length > MAX_PARAMETER_LENGTH) {
    throw new OAuthProtocolError(
      "invalid_request",
      `Le paramètre ${name} est trop long.`,
    );
  }
  return value;
}

function oauthRedirect(
  redirectUri: string,
  parameters: Record<string, string | undefined>,
): Response {
  const destination = new URL(redirectUri);
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined) destination.searchParams.set(key, value);
  }
  return new Response(null, {
    status: 303,
    headers: {
      "Cache-Control": "no-store",
      Location: destination.href,
      Pragma: "no-cache",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function authorizationErrorRedirect(
  redirectUri: string,
  state: string | undefined,
  error: OAuthProtocolError,
): Response {
  return oauthRedirect(redirectUri, {
    error: error.code,
    error_description: error.message,
    state,
  });
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function htmlResponse(
  markup: string,
  status = 200,
  formActionOrigins: readonly string[] = [],
): Response {
  const headers = noStoreHeaders("text/html; charset=utf-8");
  const formActions = ["'self'", ...new Set(formActionOrigins)].join(" ");
  // Cloudflare respecte no-transform et n'injecte donc pas son script
  // d'obfuscation d'e-mail dans ces pages OAuth volontairement sans script.
  headers.set("Cache-Control", "no-store, no-transform");
  headers.set(
    "Content-Security-Policy",
    `default-src 'none'; style-src 'unsafe-inline'; form-action ${formActions}; frame-ancestors 'none'; base-uri 'none'`,
  );
  headers.set("X-Frame-Options", "DENY");
  return new Response(markup, { status, headers });
}

function oauthHtmlError(error: unknown): Response {
  const normalized =
    error instanceof OAuthProtocolError
      ? error
      : new OAuthProtocolError(
          "server_error",
          "Le serveur OAuth a rencontré une erreur.",
          500,
        );
  if (!(error instanceof OAuthProtocolError)) {
    console.error("[oauth] erreur d’autorisation inattendue:", error);
  }
  return htmlResponse(
    `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Autorisation impossible</title>
  </head>
  <body style="margin:0;background:#eff8ff;color:#082a40;font-family:ui-sans-serif,system-ui,sans-serif">
    <main style="max-width:620px;margin:10vh auto;padding:32px">
      <section style="background:#fff;border:2px solid #b8e0f7;border-radius:18px;padding:32px">
        <p style="margin:0 0 10px;color:#0873ab;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">OAuth · ${htmlEscape(APP_NAME)}</p>
        <h1 style="margin:0 0 14px;font-size:28px">Autorisation impossible</h1>
        <p style="margin:0;line-height:1.6;color:#475569">${htmlEscape(normalized.message)}</p>
      </section>
    </main>
  </body>
</html>`,
    normalized.status,
  );
}

async function validateAuthorizationRequest(
  parameters: URLSearchParams,
  request: Request,
): Promise<
  | { ok: true; value: AuthorizationRequest }
  | { ok: false; response: Response }
> {
  let clientId: string;
  try {
    clientId = getSingleParameter(parameters, "client_id")!;
  } catch (error) {
    return { ok: false, response: oauthHtmlError(error) };
  }

  const [client] = await db
    .select()
    .from(oauthClients)
    .where(
      and(
        eq(oauthClients.clientId, clientId),
        eq(oauthClients.enabled, true),
      ),
    )
    .limit(1);
  if (!client) {
    return {
      ok: false,
      response: oauthHtmlError(
        new OAuthProtocolError(
          "unauthorized_client",
          "Ce client OAuth est inconnu ou désactivé.",
          401,
        ),
      ),
    };
  }

  let redirectUri: string;
  try {
    redirectUri = validateRedirectUri(
      getSingleParameter(parameters, "redirect_uri")!,
    );
    if (!client.redirectUris.includes(redirectUri)) {
      throw new OAuthProtocolError(
        "invalid_request",
        "L’URI de redirection ne correspond pas à celle du client.",
      );
    }
  } catch (error) {
    return { ok: false, response: oauthHtmlError(error) };
  }

  let state: string | undefined;
  try {
    state = getSingleParameter(parameters, "state", false);
  } catch (error) {
    const normalized =
      error instanceof OAuthProtocolError
        ? error
        : new OAuthProtocolError("invalid_request", "Le state est invalide.");
    return {
      ok: false,
      response: authorizationErrorRedirect(
        redirectUri,
        undefined,
        normalized,
      ),
    };
  }

  try {
    if (!client.grantTypes.includes("authorization_code")) {
      throw new OAuthProtocolError(
        "unauthorized_client",
        "Ce client n’est pas autorisé à utiliser authorization_code.",
      );
    }

    if (getSingleParameter(parameters, "response_type") !== "code") {
      throw new OAuthProtocolError(
        "unsupported_response_type",
        "Seul response_type=code est pris en charge.",
      );
    }

    const codeChallenge = getSingleParameter(
      parameters,
      "code_challenge",
    )!;
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
      throw new OAuthProtocolError(
        "invalid_request",
        "Le code_challenge PKCE est invalide.",
      );
    }
    if (
      getSingleParameter(parameters, "code_challenge_method") !== "S256"
    ) {
      throw new OAuthProtocolError(
        "invalid_request",
        "PKCE avec code_challenge_method=S256 est obligatoire.",
      );
    }

    const resource = getSingleParameter(parameters, "resource")!;
    if (!equalStrings(resource, getMcpResourceUrl(request))) {
      throw new OAuthProtocolError(
        "invalid_target",
        `La ressource doit correspondre exactement à ${getMcpResourceUrl(request)}.`,
      );
    }

    const rawScope = getSingleParameter(parameters, "scope", false);
    const scopes = rawScope
      ? normalizeScopes(rawScope)
      : [...client.scopes];
    if (scopes.length === 0) {
      throw new OAuthProtocolError(
        "invalid_scope",
        "Ce client ne dispose d’aucune portée OAuth.",
      );
    }
    ensureScopeSubset(scopes, [...MCP_OAUTH_SCOPES]);
    ensureScopeSubset(scopes, client.scopes);

    return {
      ok: true,
      value: {
        clientInternalId: client.id,
        clientId: client.clientId,
        clientName: client.name,
        redirectUri,
        codeChallenge,
        scopes,
        state,
        resource,
      },
    };
  } catch (error) {
    const normalized =
      error instanceof OAuthProtocolError
        ? error
        : new OAuthProtocolError("server_error", "Erreur OAuth.", 500);
    return {
      ok: false,
      response: authorizationErrorRedirect(
        redirectUri,
        state,
        normalized,
      ),
    };
  }
}

function signConsentToken(payload: ConsentTokenPayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = createHmac("sha256", getConsentSecret())
    .update(encodedPayload, "ascii")
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyConsentToken(token: string): ConsentTokenPayload {
  if (!token || token.length > MAX_CONSENT_TOKEN_LENGTH) {
    throw new OAuthProtocolError(
      "invalid_request",
      "La demande de consentement est invalide.",
    );
  }
  const [encodedPayload, providedSignature, extra] = token.split(".");
  if (!encodedPayload || !providedSignature || extra) {
    throw new OAuthProtocolError(
      "invalid_request",
      "La demande de consentement est invalide.",
    );
  }
  const expectedSignature = createHmac("sha256", getConsentSecret())
    .update(encodedPayload, "ascii")
    .digest("base64url");
  if (!equalStrings(providedSignature, expectedSignature)) {
    throw new OAuthProtocolError(
      "invalid_request",
      "La demande de consentement n’a pas pu être vérifiée.",
    );
  }

  let payload: ConsentTokenPayload;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as ConsentTokenPayload;
  } catch {
    throw new OAuthProtocolError(
      "invalid_request",
      "La demande de consentement est illisible.",
    );
  }
  if (
    payload.version !== 1 ||
    typeof payload.userId !== "string" ||
    typeof payload.clientInternalId !== "string" ||
    typeof payload.clientId !== "string" ||
    typeof payload.redirectUri !== "string" ||
    typeof payload.codeChallenge !== "string" ||
    !Array.isArray(payload.scopes) ||
    typeof payload.resource !== "string" ||
    typeof payload.expiresAt !== "number" ||
    payload.expiresAt < Math.floor(Date.now() / 1000)
  ) {
    throw new OAuthProtocolError(
      "invalid_request",
      "La demande de consentement est expirée ou incomplète.",
    );
  }
  return payload;
}

function authorizationPath(payload: AuthorizationRequest): string {
  const parameters = new URLSearchParams({
    response_type: "code",
    client_id: payload.clientId,
    redirect_uri: payload.redirectUri,
    code_challenge: payload.codeChallenge,
    code_challenge_method: "S256",
    scope: payload.scopes.join(" "),
    resource: payload.resource,
  });
  if (payload.state) parameters.set("state", payload.state);
  return `/api/oauth/authorize?${parameters.toString()}`;
}

function loginRedirect(request: Request, next: string): Response {
  const destination = new URL("/login", request.url);
  destination.searchParams.set("next", next);
  return new Response(null, {
    status: 303,
    headers: {
      "Cache-Control": "no-store",
      Location: destination.href,
    },
  });
}

function scopeLabel(scope: string): string {
  if (scope === "mcp:read") return "Consulter les données de l’association";
  if (scope === "mcp:write") {
    return "Créer et modifier les données autorisées par votre rôle";
  }
  return scope;
}

function scopesAllowedForRole(role: Role): string[] {
  return role === "member"
    ? ["mcp:read"]
    : [...MCP_OAUTH_SCOPES];
}

function scopesGrantedToRole(requested: string[], role: Role): string[] {
  const allowed = scopesAllowedForRole(role);
  return requested.filter((scope) => allowed.includes(scope));
}

function consentPage(
  request: AuthorizationRequest,
  user: { id: string; name: string; email: string },
  association: { associationName: string; rna: string },
): Response {
  const consentToken = signConsentToken({
    ...request,
    version: 1,
    userId: user.id,
    expiresAt:
      Math.floor(Date.now() / 1000) + CONSENT_TOKEN_TTL_SECONDS,
  });
  const scopeItems = request.scopes
    .map(
      (scope) =>
        `<li style="margin:8px 0">${htmlEscape(scopeLabel(scope))}</li>`,
    )
    .join("");

  return htmlResponse(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Autoriser ${htmlEscape(request.clientName)}</title>
  </head>
  <body style="margin:0;background:#eff8ff;color:#082a40;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <main style="max-width:660px;margin:6vh auto;padding:24px">
      <section style="overflow:hidden;background:#fff;border:2px solid #b8e0f7;border-radius:20px">
        <header style="padding:26px 30px;background:#082a40;color:#fff;border-bottom:6px solid #2ccbbb">
          <p style="margin:0 0 8px;color:#9af1e3;font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase">${htmlEscape(association.associationName)} · RNA ${htmlEscape(association.rna)}</p>
          <h1 style="margin:0;font-size:28px;line-height:1.15">Autoriser l’accès MCP</h1>
        </header>
        <div style="padding:30px">
          <p style="margin:0 0 18px;line-height:1.65;color:#475569">
            <strong style="color:#082a40">${htmlEscape(request.clientName)}</strong>
            souhaite agir au nom de <strong style="color:#082a40">${htmlEscape(user.name)}</strong>
            (<!--email_off-->${htmlEscape(user.email)}<!--/email_off-->).
          </p>
          <div style="padding:18px 20px;background:#ecfdf9;border:2px solid #9af1e3;border-radius:14px">
            <p style="margin:0;font-weight:800">Ce connecteur pourra :</p>
            <ul style="margin:10px 0 0;padding-left:20px;color:#105753;line-height:1.5">${scopeItems}</ul>
          </div>
          <p style="margin:18px 0 0;color:#64748b;font-size:13px;line-height:1.55">
            Les droits applicatifs restent limités par votre rôle. Les actions sensibles
            demeurent contrôlées et journalisées.
          </p>
          <form method="post" action="/api/oauth/authorize" style="display:flex;gap:12px;justify-content:flex-end;margin-top:26px">
            <input type="hidden" name="consent_token" value="${htmlEscape(consentToken)}">
            <button type="submit" name="decision" value="deny" style="cursor:pointer;padding:12px 18px;border:2px solid #b8e0f7;border-radius:12px;background:#fff;color:#075d8d;font-weight:800">Refuser</button>
            <button type="submit" name="decision" value="approve" style="cursor:pointer;padding:12px 18px;border:2px solid #12aa9e;border-radius:12px;background:#2ccbbb;color:#082a40;font-weight:900">Autoriser</button>
          </form>
        </div>
      </section>
    </main>
  </body>
</html>`,
    200,
    [new URL(request.redirectUri).origin],
  );
}

export async function authorizeOAuthGet(
  request: Request,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const validation = await validateAuthorizationRequest(
      url.searchParams,
      request,
    );
    if (!validation.ok) return validation.response;

    const user = await getCurrentUser();
    if (!user) {
      return loginRedirect(request, authorizationPath(validation.value));
    }
    const scopes = scopesGrantedToRole(validation.value.scopes, user.role);
    if (scopes.length === 0) {
      return authorizationErrorRedirect(
        validation.value.redirectUri,
        validation.value.state,
        new OAuthProtocolError(
          "invalid_scope",
          "Votre rôle ne permet pas la portée demandée.",
          403,
        ),
      );
    }
    const association = await getAssociationSettings();
    return consentPage({ ...validation.value, scopes }, user, association);
  } catch (error) {
    return oauthHtmlError(error);
  }
}

export async function authorizeOAuthPost(
  request: Request,
): Promise<Response> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/x-www-form-urlencoded")) {
      throw new OAuthProtocolError(
        "invalid_request",
        "Le formulaire de consentement est invalide.",
      );
    }
    const form = await request.formData();
    const consentToken = form.get("consent_token");
    const decision = form.get("decision");
    if (typeof consentToken !== "string") {
      throw new OAuthProtocolError(
        "invalid_request",
        "La demande de consentement est absente.",
      );
    }
    const payload = verifyConsentToken(consentToken);
    const user = await getCurrentUser();
    if (!user) {
      return loginRedirect(request, authorizationPath(payload));
    }
    if (user.id !== payload.userId) {
      throw new OAuthProtocolError(
        "access_denied",
        "La session a changé. Recommencez l’autorisation.",
        403,
      );
    }

    const [client] = await db
      .select()
      .from(oauthClients)
      .where(
        and(
          eq(oauthClients.id, payload.clientInternalId),
          eq(oauthClients.clientId, payload.clientId),
          eq(oauthClients.enabled, true),
        ),
      )
      .limit(1);
    if (
      !client ||
      !client.redirectUris.includes(payload.redirectUri) ||
      !equalStrings(payload.resource, getMcpResourceUrl(request))
    ) {
      throw new OAuthProtocolError(
        "invalid_request",
        "Le client ou sa redirection n’est plus valide.",
      );
    }
    ensureScopeSubset(payload.scopes, client.scopes);
    const grantedScopes = scopesGrantedToRole(payload.scopes, user.role);
    if (grantedScopes.length === 0) {
      return oauthRedirect(payload.redirectUri, {
        error: "invalid_scope",
        error_description: "Votre rôle ne permet pas la portée demandée.",
        state: payload.state,
      });
    }

    if (decision === "deny") {
      return oauthRedirect(payload.redirectUri, {
        error: "access_denied",
        error_description: "L’utilisateur a refusé l’autorisation.",
        state: payload.state,
      });
    }
    if (decision !== "approve") {
      throw new OAuthProtocolError(
        "invalid_request",
        "La décision de consentement est invalide.",
      );
    }

    const authorizationCode = randomOpaqueToken("mcp_code_");
    await db.insert(oauthAuthorizationCodes).values({
      codeHash: sha256(authorizationCode),
      oauthClientId: client.id,
      userId: user.id,
      redirectUri: payload.redirectUri,
      scopes: grantedScopes,
      codeChallenge: payload.codeChallenge,
      codeChallengeMethod: "S256",
      expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
    });

    return oauthRedirect(payload.redirectUri, {
      code: authorizationCode,
      state: payload.state,
    });
  } catch (error) {
    return oauthHtmlError(error);
  }
}

function parseBasicCredentials(
  request: Request,
): { clientId: string; clientSecret: string } | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString(
      "utf8",
    );
    const separator = decoded.indexOf(":");
    if (separator < 1) return null;
    const decode = (value: string) =>
      decodeURIComponent(value.replaceAll("+", " "));
    return {
      clientId: decode(decoded.slice(0, separator)),
      clientSecret: decode(decoded.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

async function authenticateOAuthClient(
  request: Request,
  form: URLSearchParams,
): Promise<OAuthClientRow> {
  const basic = parseBasicCredentials(request);
  const formClientId = form.get("client_id");
  if (basic && formClientId && basic.clientId !== formClientId) {
    throw new OAuthProtocolError(
      "invalid_client",
      "Les identifiants du client OAuth sont incohérents.",
      401,
    );
  }
  const clientId = basic?.clientId ?? formClientId;
  if (!clientId || clientId.length > MAX_PARAMETER_LENGTH) {
    throw new OAuthProtocolError(
      "invalid_client",
      "Le client OAuth n’a pas pu être authentifié.",
      401,
    );
  }

  const [client] = await db
    .select()
    .from(oauthClients)
    .where(
      and(
        eq(oauthClients.clientId, clientId),
        eq(oauthClients.enabled, true),
      ),
    )
    .limit(1);
  if (!client || !isTokenEndpointAuthMethod(client.tokenEndpointAuthMethod)) {
    throw new OAuthProtocolError(
      "invalid_client",
      "Le client OAuth n’a pas pu être authentifié.",
      401,
    );
  }

  if (client.tokenEndpointAuthMethod === "none") {
    if (basic || form.has("client_secret")) {
      throw new OAuthProtocolError(
        "invalid_client",
        "Ce client public ne doit pas présenter de secret.",
        401,
      );
    }
    return client;
  }

  const presentedSecret =
    client.tokenEndpointAuthMethod === "client_secret_basic"
      ? basic?.clientSecret
      : form.get("client_secret");
  const usedExpectedMethod =
    client.tokenEndpointAuthMethod === "client_secret_basic"
      ? Boolean(basic)
      : !basic && Boolean(formClientId);
  if (
    !usedExpectedMethod ||
    !presentedSecret ||
    !client.clientSecretHash ||
    !equalStrings(sha256(presentedSecret), client.clientSecretHash)
  ) {
    throw new OAuthProtocolError(
      "invalid_client",
      "Le client OAuth n’a pas pu être authentifié.",
      401,
    );
  }
  return client;
}

function validateResourceParameter(form: URLSearchParams, request: Request) {
  const resource = form.get("resource");
  if (!resource || !equalStrings(resource, getMcpResourceUrl(request))) {
    throw new OAuthProtocolError(
      "invalid_target",
      `Le paramètre resource doit correspondre exactement à ${getMcpResourceUrl(request)}.`,
    );
  }
}

function validateCodeVerifier(verifier: string | null, challenge: string) {
  if (
    !verifier ||
    !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier) ||
    !equalStrings(base64UrlSha256(verifier), challenge)
  ) {
    throw new OAuthProtocolError(
      "invalid_grant",
      "La vérification PKCE a échoué.",
    );
  }
}

async function issueTokenPair(input: {
  oauthClientId: string;
  userId: string;
  authorizationCodeId: string | null;
  scopes: string[];
  includeRefreshToken?: boolean;
}) {
  const accessToken = randomOpaqueToken("mcp_at_");
  const refreshToken = randomOpaqueToken("mcp_rt_");
  const now = Date.now();
  const tokenRows: (typeof oauthTokens.$inferInsert)[] = [
    {
      tokenHash: sha256(accessToken),
      type: "access",
      oauthClientId: input.oauthClientId,
      userId: input.userId,
      authorizationCodeId: input.authorizationCodeId,
      scopes: input.scopes,
      expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
    },
  ];
  if (input.includeRefreshToken !== false) {
    tokenRows.push({
      tokenHash: sha256(refreshToken),
      type: "refresh",
      oauthClientId: input.oauthClientId,
      userId: input.userId,
      authorizationCodeId: input.authorizationCodeId,
      scopes: input.scopes,
      expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
    });
  }
  await db.insert(oauthTokens).values(tokenRows);

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    ...(input.includeRefreshToken !== false
      ? { refresh_token: refreshToken }
      : {}),
    scope: input.scopes.join(" "),
  };
}

async function exchangeAuthorizationCode(
  client: OAuthClientRow,
  form: URLSearchParams,
  request: Request,
): Promise<Response> {
  validateResourceParameter(form, request);
  if (!client.grantTypes.includes("authorization_code")) {
    throw new OAuthProtocolError(
      "unauthorized_client",
      "Ce client ne peut pas utiliser authorization_code.",
    );
  }
  const rawCode = form.get("code");
  const redirectUri = form.get("redirect_uri");
  if (!rawCode || !redirectUri) {
    throw new OAuthProtocolError(
      "invalid_request",
      "code et redirect_uri sont requis.",
    );
  }

  const now = new Date();
  const [authorizationCode] = await db
    .select()
    .from(oauthAuthorizationCodes)
    .where(
      and(
        eq(oauthAuthorizationCodes.codeHash, sha256(rawCode)),
        eq(oauthAuthorizationCodes.oauthClientId, client.id),
        isNull(oauthAuthorizationCodes.usedAt),
        gt(oauthAuthorizationCodes.expiresAt, now),
      ),
    )
    .limit(1);
  if (
    !authorizationCode ||
    authorizationCode.redirectUri !== redirectUri ||
    authorizationCode.codeChallengeMethod !== "S256"
  ) {
    throw new OAuthProtocolError(
      "invalid_grant",
      "Le code d’autorisation est invalide ou expiré.",
    );
  }
  validateCodeVerifier(
    form.get("code_verifier"),
    authorizationCode.codeChallenge,
  );

  const [claimedCode] = await db
    .update(oauthAuthorizationCodes)
    .set({ usedAt: now })
    .where(
      and(
        eq(oauthAuthorizationCodes.id, authorizationCode.id),
        isNull(oauthAuthorizationCodes.usedAt),
        gt(oauthAuthorizationCodes.expiresAt, now),
      ),
    )
    .returning({ id: oauthAuthorizationCodes.id });
  if (!claimedCode) {
    throw new OAuthProtocolError(
      "invalid_grant",
      "Le code d’autorisation a déjà été utilisé.",
    );
  }

  const tokens = await issueTokenPair({
    oauthClientId: client.id,
    userId: authorizationCode.userId,
    authorizationCodeId: authorizationCode.id,
    scopes: authorizationCode.scopes,
    includeRefreshToken: client.grantTypes.includes("refresh_token"),
  });
  return jsonResponse(tokens);
}

async function rotateRefreshToken(
  client: OAuthClientRow,
  form: URLSearchParams,
  request: Request,
): Promise<Response> {
  validateResourceParameter(form, request);
  if (!client.grantTypes.includes("refresh_token")) {
    throw new OAuthProtocolError(
      "unauthorized_client",
      "Ce client ne peut pas utiliser refresh_token.",
    );
  }
  const rawRefreshToken = form.get("refresh_token");
  if (!rawRefreshToken) {
    throw new OAuthProtocolError(
      "invalid_request",
      "refresh_token est requis.",
    );
  }

  const [storedToken] = await db
    .select()
    .from(oauthTokens)
    .where(
      and(
        eq(oauthTokens.tokenHash, sha256(rawRefreshToken)),
        eq(oauthTokens.type, "refresh"),
        eq(oauthTokens.oauthClientId, client.id),
      ),
    )
    .limit(1);
  const now = new Date();
  if (
    !storedToken ||
    storedToken.revokedAt ||
    storedToken.expiresAt <= now
  ) {
    if (storedToken?.revokedAt && storedToken.authorizationCodeId) {
      await db
        .update(oauthTokens)
        .set({ revokedAt: now })
        .where(
          and(
            eq(
              oauthTokens.authorizationCodeId,
              storedToken.authorizationCodeId,
            ),
            isNull(oauthTokens.revokedAt),
          ),
        );
    }
    throw new OAuthProtocolError(
      "invalid_grant",
      "Le jeton de rafraîchissement est invalide, expiré ou réutilisé.",
    );
  }

  const requestedScope = form.get("scope");
  const scopes = requestedScope
    ? normalizeScopes(requestedScope)
    : storedToken.scopes;
  ensureScopeSubset(scopes, storedToken.scopes);

  const [rotated] = await db
    .update(oauthTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(oauthTokens.id, storedToken.id),
        isNull(oauthTokens.revokedAt),
        gt(oauthTokens.expiresAt, now),
      ),
    )
    .returning({ id: oauthTokens.id });
  if (!rotated) {
    throw new OAuthProtocolError(
      "invalid_grant",
      "Le jeton de rafraîchissement vient d’être utilisé.",
    );
  }

  const tokens = await issueTokenPair({
    oauthClientId: client.id,
    userId: storedToken.userId,
    authorizationCodeId: storedToken.authorizationCodeId,
    scopes,
  });
  return jsonResponse(tokens);
}

export async function exchangeOAuthToken(
  request: Request,
): Promise<Response> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/x-www-form-urlencoded")) {
      throw new OAuthProtocolError(
        "invalid_request",
        "Le corps doit être envoyé en application/x-www-form-urlencoded.",
      );
    }
    const rawBody = await request.text();
    if (rawBody.length > 32_768) {
      throw new OAuthProtocolError(
        "invalid_request",
        "La requête OAuth est trop volumineuse.",
      );
    }
    const form = new URLSearchParams(rawBody);
    for (const parameter of [
      "grant_type",
      "client_id",
      "client_secret",
      "code",
      "redirect_uri",
      "code_verifier",
      "resource",
      "refresh_token",
      "scope",
    ]) {
      if (form.getAll(parameter).length > 1) {
        throw new OAuthProtocolError(
          "invalid_request",
          `Le paramètre ${parameter} ne doit apparaître qu’une fois.`,
        );
      }
    }
    const client = await authenticateOAuthClient(request, form);
    const grantType = form.get("grant_type");

    if (grantType === "authorization_code") {
      return exchangeAuthorizationCode(client, form, request);
    }
    if (grantType === "refresh_token") {
      return rotateRefreshToken(client, form, request);
    }
    throw new OAuthProtocolError(
      "unsupported_grant_type",
      "Le grant_type demandé n’est pas pris en charge.",
    );
  } catch (error) {
    return oauthErrorResponse(error);
  }
}

export async function revokeOAuthToken(
  request: Request,
): Promise<Response> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/x-www-form-urlencoded")) {
      throw new OAuthProtocolError(
        "invalid_request",
        "Le corps doit être envoyé en application/x-www-form-urlencoded.",
      );
    }
    const rawBody = await request.text();
    if (rawBody.length > 32_768) {
      throw new OAuthProtocolError(
        "invalid_request",
        "La requête de révocation est trop volumineuse.",
      );
    }
    const form = new URLSearchParams(rawBody);
    for (const parameter of [
      "client_id",
      "client_secret",
      "token",
      "token_type_hint",
    ]) {
      if (form.getAll(parameter).length > 1) {
        throw new OAuthProtocolError(
          "invalid_request",
          `Le paramètre ${parameter} ne doit apparaître qu’une fois.`,
        );
      }
    }
    const client = await authenticateOAuthClient(request, form);
    const rawToken = form.get("token");
    if (!rawToken || rawToken.length > 512) {
      throw new OAuthProtocolError(
        "invalid_request",
        "Le jeton à révoquer est requis.",
      );
    }

    const [storedToken] = await db
      .select({
        id: oauthTokens.id,
        authorizationCodeId: oauthTokens.authorizationCodeId,
        userId: oauthTokens.userId,
      })
      .from(oauthTokens)
      .where(
        and(
          eq(oauthTokens.tokenHash, sha256(rawToken)),
          eq(oauthTokens.oauthClientId, client.id),
        ),
      )
      .limit(1);

    if (storedToken) {
      const familyCondition = storedToken.authorizationCodeId
        ? eq(
            oauthTokens.authorizationCodeId,
            storedToken.authorizationCodeId,
          )
        : eq(oauthTokens.id, storedToken.id);
      await db
        .update(oauthTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(oauthTokens.oauthClientId, client.id),
            eq(oauthTokens.userId, storedToken.userId),
            familyCondition,
            isNull(oauthTokens.revokedAt),
          ),
        );
    }

    // RFC 7009 impose une réponse 200 même si le jeton est déjà invalide.
    return new Response(null, { status: 200, headers: noStoreHeaders() });
  } catch (error) {
    return oauthErrorResponse(error);
  }
}

export async function authenticateMcpRequest(
  request: Request,
): Promise<AuthenticatedMcpRequest | null> {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!bearer) return null;
  const rawToken = bearer[1].trim();
  if (!rawToken || rawToken.length > 512) return null;

  const now = new Date();
  const [authenticated] = await db
    .select({
      scopes: oauthTokens.scopes,
      oauthClientId: oauthClients.id,
      clientId: oauthClients.clientId,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      userRole: users.role,
    })
    .from(oauthTokens)
    .innerJoin(
      oauthClients,
      eq(oauthTokens.oauthClientId, oauthClients.id),
    )
    .innerJoin(users, eq(oauthTokens.userId, users.id))
    .where(
      and(
        eq(oauthTokens.tokenHash, sha256(rawToken)),
        eq(oauthTokens.type, "access"),
        isNull(oauthTokens.revokedAt),
        gt(oauthTokens.expiresAt, now),
        eq(oauthClients.enabled, true),
      ),
    )
    .limit(1);

  if (!authenticated) return null;
  return {
    user: {
      id: authenticated.userId,
      name: authenticated.userName,
      email: authenticated.userEmail,
      role: authenticated.userRole,
    },
    role: authenticated.userRole,
    scopes: authenticated.scopes,
    clientId: authenticated.clientId,
    oauthClientId: authenticated.oauthClientId,
  };
}
