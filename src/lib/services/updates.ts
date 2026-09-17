import "server-only";

import { HttpError } from "@/lib/auth/guards";
import { checkPublishedImage } from "@/lib/services/registry";
import { getRuntimeVersion, shortRevision } from "@/lib/version";

/**
 * Suivi des mises à jour. L'application ne se met jamais à jour elle-même : le
 * conteneur `updater` (Watchtower) surveille l'image publiée et recrée `app` et
 * `scheduler` dès qu'une nouvelle version est disponible. Les migrations sont
 * ensuite appliquées par l'entrypoint au démarrage.
 *
 * Ce service rend cet état visible — et il le mesure là où il se décide : dans
 * le registre. C'est l'image publiée que l'`updater` installe, pas le dernier
 * commit du dépôt. Les deux diffèrent pendant toute la construction, et pour
 * toujours si elle échoue.
 *
 * Le dépôt Git reste consulté, mais seulement pour distinguer « à jour » de
 * « une version est fusionnée, son image n'est pas encore publiée ». Cette
 * consultation est facultative : son échec n'empêche jamais de connaître l'état
 * réel ni de déclencher une mise à jour.
 */

const REPOSITORY =
  process.env.UPDATE_REPOSITORY?.trim() || "flocom/APEL-manager";
const CHANNEL = process.env.UPDATE_CHANNEL?.trim() || "main";
const CHECK_ENABLED = process.env.UPDATE_CHECK_ENABLED?.trim() !== "false";
/** Image réellement déployée, celle que l'`updater` surveille. */
const IMAGE =
  process.env.UPDATE_IMAGE?.trim() ||
  process.env.APEL_IMAGE?.trim() ||
  "ghcr.io/flocom/apel-manager:latest";
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;
/** Au-delà, la consultation du dépôt est abandonnée : elle n'est qu'un appoint. */
const HEAD_TTL_MS = 10 * 60 * 1000;
/** Une recréation de conteneur dépasse largement le délai d'une vérification. */
const TRIGGER_TIMEOUT_MS = 20_000;
/** Sonde de présence de l'`updater` : il répond sur son réseau, ou pas. */
const PROBE_TIMEOUT_MS = 2500;

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

/** Ce que l'application sait de l'`updater`, par observation et non par déduction. */
export type UpdaterReachability = "reachable" | "unreachable" | "not-configured";

export interface UpdateStatus {
  current: ReturnType<typeof getRuntimeVersion>;
  latest: {
    revision: string;
    shortRevision: string;
    version: string | null;
    committedAt: string | null;
    url: string;
  } | null;
  state: UpdateState;
  autoUpdate: {
    enabled: boolean;
    pollIntervalSeconds: number;
    /** Vrai quand l'`updater` accepte un déclenchement immédiat. */
    canTriggerNow: boolean;
    /** Résultat de la sonde : l'`updater` a-t-il répondu ? */
    reachability: UpdaterReachability;
  };
  /**
   * Version fusionnée dont l'image n'est pas encore publiée. Renseignée
   * seulement quand le dépôt a pu être consulté et qu'il devance le registre.
   */
  pending: {
    shortRevision: string;
    committedAt: string | null;
    url: string;
  } | null;
  /**
   * Vrai quand l'état repose sur une réponse antérieure, le registre n'ayant
   * pas répondu cette fois. Un « À jour » calculé sur une lecture d'il y a
   * trois semaines n'a pas la même valeur qu'un « À jour » de l'instant.
   */
  stale: boolean;
  repository: string;
  channel: string;
  image: string;
  checkedAt: string | null;
  error: string | null;
}

interface CheckResult {
  latest: UpdateStatus["latest"];
  error: string | null;
  /** Instant avant lequel toute nouvelle requête serait refusée d'office. */
  retryAfter: number | null;
}

interface CachedCheck extends CheckResult {
  /** Dernière tentative, réussie ou non. */
  fetchedAt: number;
  /** Dernière réponse exploitable : c'est elle que l'écran doit dater. */
  succeededAt: number | null;
  /** Dernier commit connu de la branche, pour situer une image en retard. */
  head: { revision: string; committedAt: string | null; url: string } | null;
  /** Dernière tentative de lecture du dépôt, réussie ou non. */
  headFetchedAt: number;
}

let cache: CachedCheck | null = null;
/** Évite d'empiler les consultations du dépôt lancées en arrière-plan. */
let headEnCours = false;

/**
 * L'API publique de GitHub tolère 60 requêtes par heure et par adresse IP sans
 * authentification, quota partagé avec tout ce qui sort de la même adresse.
 * Une fois épuisé, elle répond 403 ou 429 en annonçant l'heure de remise à
 * zéro : la retenir évite d'insister pour rien.
 */
function rateLimitRetryAfter(response: Response): number | null {
  if (response.status !== 403 && response.status !== 429) return null;
  if (response.headers.get("x-ratelimit-remaining") !== "0") return null;
  const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000;
  return Number.isFinite(reset) && reset > Date.now()
    ? reset
    : Date.now() + 15 * 60 * 1000;
}

/**
 * Dernier commit de la branche suivie. Consultation d'appoint : elle ne sert
 * qu'à dire qu'une version est fusionnée sans être encore publiée, et son
 * échec ne remonte jamais comme une erreur de l'écran.
 */
async function fetchHeadCommit(): Promise<{
  head: CachedCheck["head"];
  retryAfter: number | null;
}> {
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

    const retryAfter = rateLimitRetryAfter(response);
    if (retryAfter) return { head: null, retryAfter };
    if (!response.ok) return { head: null, retryAfter: null };

    const payload = (await response.json()) as {
      sha?: string;
      html_url?: string;
      commit?: { committer?: { date?: string } };
    };
    if (!payload.sha) return { head: null, retryAfter: null };

    return {
      head: {
        revision: payload.sha,
        committedAt: payload.commit?.committer?.date ?? null,
        url:
          payload.html_url ??
          `https://github.com/${REPOSITORY}/commit/${payload.sha}`,
      },
      retryAfter: null,
    };
  } catch {
    return { head: null, retryAfter: null };
  }
}

/**
 * Consultation du dépôt, lancée sans être attendue. Elle n'alimente qu'un
 * encart d'appoint : la faire attendre par le rendu ferait dépendre l'écran
 * Configuration tout entier de la disponibilité de GitHub, et d'un quota de
 * soixante requêtes par heure partagé avec toute la machine.
 */
function rafraichirHeadEnArrierePlan() {
  if (headEnCours) return;
  const maintenant = Date.now();
  if (cache && maintenant - cache.headFetchedAt < HEAD_TTL_MS) return;
  if (cache?.retryAfter != null && maintenant < cache.retryAfter) return;

  headEnCours = true;
  void fetchHeadCommit()
    .then(({ head, retryAfter }) => {
      if (!cache) return;
      cache.headFetchedAt = Date.now();
      cache.retryAfter = retryAfter;
      if (head) cache.head = head;
    })
    .catch(() => {
      if (cache) cache.headFetchedAt = Date.now();
    })
    .finally(() => {
      headEnCours = false;
    });
}

/** Interroge le registre. Lui seul décide de l'état, lui seul est attendu. */
async function runCheck(precedent: CachedCheck | null): Promise<CachedCheck> {
  const registre = await checkPublishedImage(IMAGE);

  const latest: UpdateStatus["latest"] = registre.ok
    ? {
        revision: registre.image.revision,
        shortRevision: shortRevision(registre.image.revision),
        version: registre.image.version,
        committedAt: registre.image.createdAt,
        url: `https://github.com/${REPOSITORY}/commit/${registre.image.revision}`,
      }
    : null;

  return {
    // Un échec ne doit pas effacer la dernière réponse connue : sans elle
    // l'écran retomberait sur « État inconnu » alors qu'il sait encore quelle
    // version est publiée. L'erreur est affichée à côté, pas à la place — et
    // `stale` dit que ce qu'on lit n'est plus de première main.
    latest: latest ?? precedent?.latest ?? null,
    error: registre.ok ? null : registre.error,
    retryAfter: precedent?.retryAfter ?? null,
    head: precedent?.head ?? null,
    headFetchedAt: precedent?.headFetchedAt ?? 0,
    fetchedAt: Date.now(),
    succeededAt: latest ? Date.now() : precedent?.succeededAt ?? null,
  };
}

/**
 * Vérifie que l'`updater` est là. « Activée » sans cette sonde n'était qu'une
 * relecture de la configuration : un `updater` arrêté laissait l'écran
 * promettre une mise à jour automatique qui n'arrivait jamais.
 *
 * La sonde interroge la racine, que l'API de Watchtower n'expose pas : une
 * réponse HTTP — fût-elle 404 — prouve que le service écoute, sans risquer de
 * déclencher quoi que ce soit.
 */
async function probeUpdater(): Promise<UpdaterReachability> {
  try {
    await fetch(`${watchtowerUrl()}/`, {
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return "reachable";
  } catch {
    // La sonde tourne même quand le profil n'est pas déclaré : `docker compose
    // --profile autoupdate up` active le service en ligne de commande sans que
    // COMPOSE_PROFILES n'en garde trace, et l'écran annonçait alors
    // « Désactivée » pendant que l'updater faisait son travail.
    return autoUpdateEnabled() ? "unreachable" : "not-configured";
  }
}

/**
 * Compare la révision embarquée à celle de l'image publiée. Le résultat est
 * mis en cache dix minutes, `force` permet une vérification immédiate depuis
 * l'interface.
 */
export async function getUpdateStatus(
  { force = false }: { force?: boolean } = {},
): Promise<UpdateStatus> {
  const current = getRuntimeVersion();
  const enabled = autoUpdateEnabled();

  if (!CHECK_ENABLED) {
    const reachability = await probeUpdater();
    const actif = enabled || reachability === "reachable";
    return {
      current,
      latest: null,
      state: "disabled",
      autoUpdate: {
        enabled: actif,
        pollIntervalSeconds: pollIntervalSeconds(),
        canTriggerNow: actif && watchtowerToken().length > 0,
        reachability,
      },
      pending: null,
      stale: false,
      repository: REPOSITORY,
      channel: CHANNEL,
      image: IMAGE,
      checkedAt: null,
      error: null,
    };
  }

  const fresh = cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
  const [checked, reachability] = await Promise.all([
    force || !fresh ? runCheck(cache) : Promise.resolve(cache!),
    probeUpdater(),
  ]);
  cache = checked;
  // Lancée seulement maintenant : elle écrit dans le cache déjà en place.
  rafraichirHeadEnArrierePlan();

  let state: UpdateState = "unknown";
  if (checked.latest && current.revision) {
    state =
      checked.latest.revision === current.revision ? "up-to-date" : "outdated";
  }

  // Une version fusionnée dont l'image n'est pas encore publiée : ni « à jour »
  // ni installable. Le dire évite qu'on attende une mise à jour qui n'existe
  // pas encore, ou qu'on ignore une publication en échec.
  const pending =
    checked.head &&
    checked.latest &&
    checked.head.revision !== checked.latest.revision &&
    checked.head.revision !== current.revision
      ? {
          shortRevision: shortRevision(checked.head.revision),
          committedAt: checked.head.committedAt,
          url: checked.head.url,
        }
      : null;

  const actif = enabled || reachability === "reachable";
  return {
    current,
    latest: checked.latest,
    state,
    autoUpdate: {
      enabled: actif,
      pollIntervalSeconds: pollIntervalSeconds(),
      canTriggerNow: actif && watchtowerToken().length > 0,
      reachability,
    },
    pending,
    stale: Boolean(checked.error && checked.latest),
    repository: REPOSITORY,
    channel: CHANNEL,
    image: IMAGE,
    checkedAt:
      checked.succeededAt === null
        ? null
        : new Date(checked.succeededAt).toISOString(),
    error: checked.error,
  };
}

export type TriggerOutcome = "no-update" | "restarting";

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
 * Une coupure en plein vol est le signe attendu que l'`updater` remplace le
 * conteneur qui l'interroge : la requête meurt avec lui. Le délai dépassé n'est
 * qu'une des formes que prend cette coupure — la connexion peut aussi être
 * réinitialisée ou fermée net, selon le moment où le processus reçoit son
 * signal d'arrêt. Ne reconnaître que le délai dépassé faisait passer une mise à
 * jour en cours pour un service injoignable.
 */
function estCoupureEnVol(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  const cause = error.cause;
  const code =
    cause instanceof Error ? (cause as NodeJS.ErrnoException).code : undefined;
  return (
    code === "ECONNRESET" ||
    code === "UND_ERR_SOCKET" ||
    code === "EPIPE" ||
    /socket hang up|other side closed|terminated/i.test(
      cause instanceof Error ? cause.message : "",
    )
  );
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
    if (estCoupureEnVol(error)) return "restarting";
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
  // L'updater a répondu sans nous interrompre : il n'avait rien à installer.
  return "no-update";
}
