import "server-only";

import { HttpError } from "@/lib/auth/guards";
import { getRuntimeVersion, shortRevision } from "@/lib/version";

/**
 * Suivi des mises à jour. L'application ne se met jamais à jour elle-même : le
 * conteneur `updater` (Watchtower) surveille l'image publiée et recrée `app` et
 * `scheduler` dès qu'une nouvelle version est disponible. Les migrations sont
 * ensuite appliquées par l'entrypoint au démarrage.
 *
 * Ce service ne sert donc qu'à *rendre visible* l'état : version en cours,
 * dernière version publiée en amont, et cadence de la surveillance.
 */

const REPOSITORY =
  process.env.UPDATE_REPOSITORY?.trim() || "flocom/APEL-manager";
const CHANNEL = process.env.UPDATE_CHANNEL?.trim() || "main";
const CHECK_ENABLED = process.env.UPDATE_CHECK_ENABLED?.trim() !== "false";
const CACHE_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;
/** Une recréation de conteneur dépasse largement le délai d'une vérification. */
const TRIGGER_TIMEOUT_MS = 20_000;

/** Cadence de surveillance du conteneur `updater`, en secondes. */
function pollIntervalSeconds() {
  const raw = Number(process.env.WATCHTOWER_POLL_INTERVAL);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 3600;
}

/**
 * Adresse interne de l'`updater`. Elle n'est jamais exposée hors du réseau
 * Compose : seule l'application peut la joindre.
 */
function watchtowerUrl() {
  return process.env.WATCHTOWER_URL?.trim() || "http://updater:8080";
}

/**
 * Jeton partagé entre l'application et l'`updater`, tous deux sur la même
 * machine. L'entrypoint le génère au premier démarrage et le conserve dans le
 * volume de configuration, où l'`updater` le relit : il n'y a aucune valeur à
 * choisir. Il reste vide hors Docker, où aucun `updater` n'existe.
 */
function watchtowerToken() {
  return process.env.WATCHTOWER_HTTP_API_TOKEN?.trim() || "";
}

/**
 * Le service `updater` n'est démarré que lorsque le profil Compose
 * `autoupdate` est actif. Compose transmet la variable telle quelle à
 * l'application, ce qui évite une seconde source de vérité.
 */
function autoUpdateEnabled() {
  return (process.env.COMPOSE_PROFILES ?? "")
    .split(",")
    .map((profile) => profile.trim())
    .includes("autoupdate");
}

export type UpdateState =
  | "up-to-date"
  | "outdated"
  | "unknown"
  | "disabled";

export interface UpdateStatus {
  current: ReturnType<typeof getRuntimeVersion>;
  latest: {
    revision: string;
    shortRevision: string;
    committedAt: string | null;
    url: string;
  } | null;
  state: UpdateState;
  autoUpdate: {
    enabled: boolean;
    pollIntervalSeconds: number;
    /** Vrai quand l'`updater` accepte un déclenchement immédiat. */
    canTriggerNow: boolean;
  };
  repository: string;
  channel: string;
  checkedAt: string | null;
  error: string | null;
}

interface CachedCheck {
  fetchedAt: number;
  latest: UpdateStatus["latest"];
  error: string | null;
}

let cache: CachedCheck | null = null;

async function fetchLatestCommit(): Promise<CachedCheck> {
  const url = `https://api.github.com/repos/${REPOSITORY}/commits/${encodeURIComponent(
    CHANNEL,
  )}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "apel-manager-update-check",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        fetchedAt: Date.now(),
        latest: null,
        error: `GitHub a répondu ${response.status}.`,
      };
    }

    const payload = (await response.json()) as {
      sha?: string;
      html_url?: string;
      commit?: { committer?: { date?: string } };
    };

    if (!payload.sha) {
      return {
        fetchedAt: Date.now(),
        latest: null,
        error: "Réponse GitHub inattendue.",
      };
    }

    return {
      fetchedAt: Date.now(),
      latest: {
        revision: payload.sha,
        shortRevision: shortRevision(payload.sha),
        committedAt: payload.commit?.committer?.date ?? null,
        url:
          payload.html_url ??
          `https://github.com/${REPOSITORY}/commit/${payload.sha}`,
      },
      error: null,
    };
  } catch (error) {
    return {
      fetchedAt: Date.now(),
      latest: null,
      error:
        error instanceof Error && error.name === "TimeoutError"
          ? "GitHub n'a pas répondu à temps."
          : "Vérification impossible (réseau indisponible ?).",
    };
  }
}

/**
 * Compare la révision embarquée à la dernière révision publiée. Le résultat est
 * mis en cache une demi-heure pour ne pas épuiser le quota anonyme de l'API
 * GitHub, `force` permet une vérification immédiate depuis l'interface.
 */
export async function getUpdateStatus(
  { force = false }: { force?: boolean } = {},
): Promise<UpdateStatus> {
  const current = getRuntimeVersion();
  const enabled = autoUpdateEnabled();
  const autoUpdate = {
    enabled,
    pollIntervalSeconds: pollIntervalSeconds(),
    canTriggerNow: enabled && watchtowerToken().length > 0,
  };

  if (!CHECK_ENABLED) {
    return {
      current,
      latest: null,
      state: "disabled",
      autoUpdate,
      repository: REPOSITORY,
      channel: CHANNEL,
      checkedAt: null,
      error: null,
    };
  }

  const fresh = cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
  if (force || !fresh) {
    cache = await fetchLatestCommit();
  }

  const checked = cache!;
  let state: UpdateState = "unknown";
  if (checked.latest && current.revision) {
    state =
      checked.latest.revision === current.revision ? "up-to-date" : "outdated";
  }

  return {
    current,
    latest: checked.latest,
    state,
    autoUpdate,
    repository: REPOSITORY,
    channel: CHANNEL,
    checkedAt: new Date(checked.fetchedAt).toISOString(),
    error: checked.error,
  };
}

export type TriggerOutcome = "started" | "restarting";

/**
 * `fetch` masque la panne réelle derrière « fetch failed » et range l'erreur
 * système dans `cause`. C'est elle qui a une valeur de diagnostic.
 */
function networkCause(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code;
    return code ? `${code} — ${cause.message}` : cause.message;
  }
  return error instanceof Error ? error.message : "cause inconnue";
}

/**
 * Demande à l'`updater` de contrôler l'image immédiatement au lieu d'attendre
 * son prochain passage.
 *
 * Si une nouvelle version existe, l'`updater` recrée le conteneur de
 * l'application — donc la requête en cours meurt avant toute réponse. Cette
 * coupure est le signe que la mise à jour a commencé, pas une erreur : elle est
 * distinguée d'un refus explicite, qui lui remonte normalement.
 */
export async function triggerUpdateNow(): Promise<TriggerOutcome> {
  const url = watchtowerUrl();
  const token = watchtowerToken();
  if (!token) {
    throw new HttpError(
      409,
      "Le déclenchement immédiat n'est pas disponible : relancez la pile Docker pour que le jeton partagé avec l'updater soit généré.",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${url}/v1/update`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TRIGGER_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      // La coupure attendue quand le conteneur est en train d'être remplacé.
      return "restarting";
    }
    // Toute autre panne réseau est un vrai défaut de configuration : la dire
    // plutôt que de laisser remonter « une erreur serveur est survenue ». La
    // cause système distingue le nom introuvable (conteneur absent ou sur un
    // autre réseau) du refus de connexion (service arrêté).
    throw new HttpError(
      502,
      `Service de mise à jour injoignable sur ${url} (${networkCause(error)}). Vérifiez qu'il tourne : « docker compose ps updater ».`,
    );
  }

  if (response.status === 401) {
    throw new HttpError(
      502,
      "Jeton refusé par le service de mise à jour : il a démarré avec une autre valeur. Relancez la pile Docker pour les réaligner.",
    );
  }
  if (!response.ok) {
    throw new HttpError(
      502,
      `Le service de mise à jour a répondu ${response.status}.`,
    );
  }
  // L'updater a répondu : aucune image plus récente à installer.
  return "started";
}
