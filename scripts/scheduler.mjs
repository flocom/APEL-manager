const targetUrl =
  process.env.CRON_TARGET_URL?.trim() ||
  "http://app:3000/api/cron/notifications";
const cronSecret = process.env.CRON_SECRET?.trim();
const scheduledHour = readInteger("SCHEDULER_HOUR_UTC", 7, 0, 23);
const scheduledMinute = readInteger("SCHEDULER_MINUTE_UTC", 0, 0, 59);
const requestTimeoutMs = readInteger(
  "SCHEDULER_REQUEST_TIMEOUT_MS",
  120_000,
  1_000,
  300_000,
);
const retryDelayMs = readInteger(
  "SCHEDULER_RETRY_DELAY_MS",
  60_000,
  1_000,
  3_600_000,
);
const retryCount = readInteger("SCHEDULER_RETRY_COUNT", 3, 1, 10);

// Synchronisation HelloAsso : sans clés d'API ni lien de formulaire, l'appel
// répond aussitôt qu'il n'a rien à faire. 0 désactive la boucle.
const helloassoUrl =
  process.env.HELLOASSO_SYNC_URL?.trim() ||
  siblingUrl(targetUrl, "/api/cron/helloasso");
const helloassoIntervalMinutes = readInteger(
  "HELLOASSO_SYNC_INTERVAL_MINUTES",
  60,
  0,
  10_080,
);

if (!cronSecret) {
  console.error("CRON_SECRET est absent : le scheduler ne peut pas démarrer.");
  process.exit(1);
}

let stopping = false;
// Plusieurs boucles attendent en même temps : chacune a sa minuterie et sa
// requête en cours, que l'arrêt interrompt toutes.
const pendingWaits = new Set();
const activeControllers = new Set();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    for (const pending of pendingWaits) {
      clearTimeout(pending.timer);
      pending.resolve();
    }
    pendingWaits.clear();
    for (const controller of activeControllers) controller.abort();
  });
}

function readInteger(name, fallback, minimum, maximum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    console.warn(
      `${name} est invalide, utilisation de la valeur par défaut ${fallback}.`,
    );
    return fallback;
  }
  return value;
}

/** La même origine que `url`, avec un autre chemin. */
function siblingUrl(url, path) {
  try {
    return new URL(path, url).toString();
  } catch {
    return `http://app:3000${path}`;
  }
}

function nextExecution(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(scheduledHour, scheduledMinute, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    const pending = { resolve };
    pending.timer = setTimeout(() => {
      pendingWaits.delete(pending);
      resolve();
    }, milliseconds);
    pendingWaits.add(pending);
  });
}

async function trigger(url, label, attempts) {
  for (let attempt = 1; attempt <= attempts && !stopping; attempt += 1) {
    const controller = new AbortController();
    activeControllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${cronSecret}` },
        signal: controller.signal,
      });
      const body = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
      }

      console.log(
        `[${new Date().toISOString()}] ${label} exécutée : ${body.slice(0, 1_000)}`,
      );
      return;
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Échec : ${label} (${attempt}/${attempts}) :`,
        error instanceof Error ? error.message : error,
      );
      if (attempt < attempts && !stopping) await wait(retryDelayMs);
    } finally {
      clearTimeout(timeout);
      activeControllers.delete(controller);
    }
  }
}

async function notificationsLoop() {
  if (process.env.RUN_CRON_ON_START === "true") {
    await trigger(targetUrl, "Tâche des notifications", retryCount);
  }
  while (!stopping) {
    const next = nextExecution();
    console.log(
      `Prochaine exécution des notifications : ${next.toISOString()} (${targetUrl}).`,
    );
    await wait(Math.max(0, next.getTime() - Date.now()));
    if (!stopping) {
      await trigger(targetUrl, "Tâche des notifications", retryCount);
    }
  }
}

/**
 * Un seul essai par passage : le suivant arrive à l'intervalle, et une clé
 * refusée ne se corrige pas en réessayant dans la minute. L'échec est de
 * toute façon affiché dans Configuration.
 */
async function helloassoLoop() {
  const intervalMs = Math.max(5, helloassoIntervalMinutes) * 60_000;
  console.log(
    `Synchronisation HelloAsso toutes les ${Math.max(5, helloassoIntervalMinutes)} minutes (${helloassoUrl}).`,
  );
  // Premier passage peu après le démarrage, une fois l'application prête.
  await wait(60_000);
  while (!stopping) {
    await trigger(helloassoUrl, "Synchronisation HelloAsso", 1);
    if (!stopping) await wait(intervalMs);
  }
}

await Promise.all([
  notificationsLoop(),
  helloassoIntervalMinutes > 0 ? helloassoLoop() : Promise.resolve(),
]);

console.log("Scheduler arrêté proprement.");
