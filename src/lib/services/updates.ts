import "server-only";

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

/** Cadence de surveillance du conteneur `updater`, en secondes. */
function pollIntervalSeconds() {
  const raw = Number(process.env.WATCHTOWER_POLL_INTERVAL);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 3600;
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
  const autoUpdate = {
    enabled: autoUpdateEnabled(),
    pollIntervalSeconds: pollIntervalSeconds(),
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
