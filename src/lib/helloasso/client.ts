import "server-only";

import { createHash } from "node:crypto";

import { formatInTimeZone } from "date-fns-tz";

import { HttpError } from "@/lib/auth/guards";
import { APP_TIMEZONE } from "@/lib/dates";
import type { HelloAssoFormRef } from "@/lib/helloasso/form-link";

/**
 * Client minimal de l'API HelloAsso v5 : un jeton, puis les adhésions d'un
 * formulaire. Rien d'autre n'est appelé.
 *
 * L'adresse de l'API se règle par `HELLOASSO_API_URL` : le bac à sable
 * (`https://api.helloasso-sandbox.com`) et le serveur simulé des tests
 * passent par là. Le secret client ne quitte jamais ce fichier que dans le
 * corps de la demande de jeton.
 */

const DEFAULT_API_URL = "https://api.helloasso.com";
const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 100;
/** Garde-fou : 50 pages de 100, bien au-delà de l'année d'une école. */
const MAX_PAGES = 50;
/** Le jeton est remplacé une minute avant son expiration annoncée. */
const TOKEN_MARGIN_SECONDS = 60;
const DEFAULT_TOKEN_LIFETIME_SECONDS = 1800;

export type HelloAssoCredentials = {
  clientId: string;
  clientSecret: string;
};

/** Un paiement d'une adhésion, tel que l'API le décrit (champs utiles seulement). */
export type HelloAssoApiPayment = {
  id?: number | string;
  /** Total du paiement, en centimes ; peut couvrir plusieurs lignes. */
  amount?: number | null;
  /** Contribution volontaire à HelloAsso : jamais une recette de l'association. */
  amountTip?: number | null;
  state?: string | null;
  date?: string | null;
};

export type HelloAssoApiPerson = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  address?: string | null;
  city?: string | null;
  zipCode?: string | null;
  country?: string | null;
};

/** Une ligne de commande (`/forms/{type}/{slug}/items`), réduite à ce qui sert. */
export type HelloAssoApiItem = {
  id: number | string;
  /** « Membership », « Payment », « Donation »… */
  type?: string | null;
  /** « Processed », « Registered », « Waiting », « Canceled »… */
  state?: string | null;
  /** Prix en centimes, remise déduite, options NON comprises. */
  amount?: number | null;
  name?: string | null;
  options?: { amount?: number | null }[] | null;
  order?: { id?: number | string | null; date?: string | null } | null;
  /** Celui qui a payé, avec ses coordonnées. */
  payer?: HelloAssoApiPerson | null;
  /** L'adhérent lui-même (prénom et nom seulement) ; peut différer du payeur. */
  user?: { firstName?: string | null; lastName?: string | null } | null;
  payments?: HelloAssoApiPayment[] | null;
};

export function helloassoApiUrl(): string {
  return (
    process.env.HELLOASSO_API_URL?.trim().replace(/\/+$/, "") ||
    DEFAULT_API_URL
  );
}

// ---------------------------------------------------------------------------
// Jeton d'accès
// ---------------------------------------------------------------------------

type CachedToken = { accessToken: string; expiresAt: number };

/**
 * HelloAsso interdit de redemander un jeton à chaque appel, et plafonne la
 * route d'authentification (10 par 10 s, 20 par 10 min, 50 par heure). Le
 * jeton est donc gardé en mémoire jusqu'à une minute de son expiration.
 *
 * La clé mêle l'identifiant client et une empreinte du secret : un secret
 * remplacé ne réutilise pas le jeton de l'ancien, et le secret lui-même ne
 * sert pas de clé. La promesse est gardée, pas seulement le résultat : deux
 * appels simultanés partagent la même demande. Une installation n'a qu'une
 * paire de clés à la fois : la table ne grossit pas.
 */
const tokens = new Map<string, Promise<CachedToken>>();

function tokenKey(credentials: HelloAssoCredentials): string {
  const empreinte = createHash("sha256")
    .update(credentials.clientSecret)
    .digest("base64url");
  return `${credentials.clientId}\u0000${empreinte}`;
}

/** Ce que dit une panne réseau, sans rien recopier de la requête. */
function networkDetail(error: unknown): string {
  return error instanceof Error && error.name === "TimeoutError"
    ? "délai dépassé"
    : "réseau indisponible";
}

async function requestToken(
  credentials: HelloAssoCredentials,
): Promise<CachedToken> {
  let response: Response;
  try {
    response = await fetch(`${helloassoApiUrl()}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new HttpError(
      502,
      `HelloAsso est injoignable (${networkDetail(error)}). Réessayez dans un instant.`,
    );
  }

  if (!response.ok) {
    // Le détail ne va qu'au journal du serveur, et ne contient au plus que
    // l'identifiant client — jamais le secret, qu'HelloAsso ne renvoie pas.
    const detail = await response.text().catch(() => "");
    console.warn(
      `[helloasso] jeton refusé (${response.status})`,
      detail.slice(0, 300),
    );
    if ([400, 401, 403].includes(response.status)) {
      throw new HttpError(
        400,
        "HelloAsso a refusé ces clés. Vérifiez l’identifiant et le secret client (sur HelloAsso : Mon compte › Intégrations et API).",
      );
    }
    if (response.status === 429) {
      throw new HttpError(
        502,
        "HelloAsso limite les connexions : trop de demandes en peu de temps. Réessayez dans quelques minutes.",
      );
    }
    throw new HttpError(
      502,
      `HelloAsso ne répond pas correctement (erreur ${response.status}). Réessayez plus tard.`,
    );
  }

  const payload = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    expires_in?: unknown;
  } | null;
  if (typeof payload?.access_token !== "string" || !payload.access_token) {
    throw new HttpError(502, "HelloAsso a renvoyé une réponse inattendue.");
  }
  // `expires_in` arrive en chaîne (« 1800 ») dans la documentation.
  const lifetime = Number(payload.expires_in);
  const seconds =
    Number.isFinite(lifetime) && lifetime > 0
      ? lifetime
      : DEFAULT_TOKEN_LIFETIME_SECONDS;
  return {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Math.max(0, seconds - TOKEN_MARGIN_SECONDS) * 1000,
  };
}

/** Un jeton valide ; `renew` en impose un neuf (après un 401, ou pour vérifier des clés). */
async function accessToken(
  credentials: HelloAssoCredentials,
  renew = false,
): Promise<string> {
  const key = tokenKey(credentials);
  const pending = renew ? undefined : tokens.get(key);
  if (pending) {
    const cached = await pending.catch(() => null);
    if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
  }

  const request = requestToken(credentials);
  tokens.set(key, request);
  request.catch(() => {
    if (tokens.get(key) === request) tokens.delete(key);
  });
  return (await request).accessToken;
}

/**
 * Demande un jeton neuf : HelloAsso accepte-t-il ces clés ? Lève une
 * `HttpError` 400 si elles sont refusées, 502 si HelloAsso est injoignable.
 * Le jeton obtenu reste en cache pour la synchronisation qui suit.
 */
export async function verifyHelloAssoCredentials(
  credentials: HelloAssoCredentials,
): Promise<void> {
  await accessToken(credentials, true);
}

// ---------------------------------------------------------------------------
// Données
// ---------------------------------------------------------------------------

async function callApi(url: string, token: string): Promise<Response> {
  try {
    return await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new HttpError(
      502,
      `HelloAsso est injoignable (${networkDetail(error)}). Réessayez dans un instant.`,
    );
  }
}

/** GET authentifié ; un 401 renouvelle le jeton et réessaie UNE fois. */
async function getJson(
  credentials: HelloAssoCredentials,
  url: string,
): Promise<unknown> {
  let response = await callApi(url, await accessToken(credentials));
  if (response.status === 401) {
    response = await callApi(url, await accessToken(credentials, true));
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.warn(
      `[helloasso] appel refusé (${response.status})`,
      detail.slice(0, 300),
    );
    if (response.status === 401) {
      throw new HttpError(
        400,
        "HelloAsso a refusé ces clés. Vérifiez l’identifiant et le secret client dans Configuration.",
      );
    }
    // 403 : les clés valent pour une autre association que celle du lien.
    if (response.status === 403 || response.status === 404) {
      throw new HttpError(
        400,
        "Formulaire HelloAsso introuvable pour ces clés : vérifiez que le lien de « Comment régler » mène bien à un formulaire de votre association.",
      );
    }
    if (response.status === 429) {
      throw new HttpError(
        502,
        "HelloAsso limite les appels pour le moment. Réessayez dans quelques minutes.",
      );
    }
    throw new HttpError(
      502,
      `HelloAsso ne répond pas correctement (erreur ${response.status}). Réessayez plus tard.`,
    );
  }

  const payload: unknown = await response.json().catch(() => undefined);
  if (payload === undefined) {
    throw new HttpError(502, "HelloAsso a renvoyé une réponse illisible.");
  }
  return payload;
}

/**
 * Toutes les lignes du formulaire depuis `from` (date de commande, incluse),
 * dans l'ordre chronologique, options et champs personnalisés compris.
 *
 * HelloAsso renvoie un jeton de suite même à la dernière page : on s'arrête
 * quand une page revient vide, et au plus tard après `MAX_PAGES` pages.
 */
export async function fetchFormItems(
  credentials: HelloAssoCredentials,
  form: Pick<HelloAssoFormRef, "organizationSlug" | "formType" | "formSlug">,
  from: Date,
): Promise<HelloAssoApiItem[]> {
  const path = [
    "v5",
    "organizations",
    form.organizationSlug,
    "forms",
    form.formType,
    form.formSlug,
    "items",
  ]
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  // Avec le décalage horaire explicite : une date sans fuseau serait lue,
  // au mieux, à l'heure de Paris.
  const since = formatInTimeZone(from, APP_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");

  const items: HelloAssoApiItem[] = [];
  let continuationToken: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      from: since,
      pageSize: String(PAGE_SIZE),
      withDetails: "true",
      sortOrder: "Asc",
    });
    if (continuationToken) params.set("continuationToken", continuationToken);

    const payload = (await getJson(
      credentials,
      `${helloassoApiUrl()}/${path}?${params.toString()}`,
    )) as {
      data?: unknown;
      pagination?: { continuationToken?: unknown };
    } | null;
    const data = Array.isArray(payload?.data) ? payload.data : [];
    if (data.length === 0) return items;
    for (const item of data) {
      if (item && typeof item === "object" && "id" in item) {
        items.push(item as HelloAssoApiItem);
      }
    }
    const next = payload?.pagination?.continuationToken;
    if (typeof next !== "string" || !next || next === continuationToken) {
      return items;
    }
    continuationToken = next;
  }
  console.warn(
    `[helloasso] lecture arrêtée après ${MAX_PAGES} pages (${items.length} lignes).`,
  );
  return items;
}
