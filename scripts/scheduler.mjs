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

if (!cronSecret) {
  console.error("CRON_SECRET est absent : le scheduler ne peut pas démarrer.");
  process.exit(1);
}

let stopping = false;
let timer;
let timerResolve;
let activeController;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    if (timer) clearTimeout(timer);
    timer = undefined;
    timerResolve?.();
    timerResolve = undefined;
    activeController?.abort();
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

function nextExecution(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(scheduledHour, scheduledMinute, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    timerResolve = resolve;
    timer = setTimeout(() => {
      timer = undefined;
      timerResolve = undefined;
      resolve();
    }, milliseconds);
  });
}

async function triggerNotifications() {
  for (let attempt = 1; attempt <= retryCount && !stopping; attempt += 1) {
    const controller = new AbortController();
    activeController = controller;
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetch(targetUrl, {
        headers: { Authorization: `Bearer ${cronSecret}` },
        signal: controller.signal,
      });
      const body = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
      }

      console.log(
        `[${new Date().toISOString()}] Notifications exécutées : ${body.slice(0, 1_000)}`,
      );
      return;
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Échec du cron (${attempt}/${retryCount}) :`,
        error instanceof Error ? error.message : error,
      );
      if (attempt < retryCount && !stopping) await wait(retryDelayMs);
    } finally {
      clearTimeout(timeout);
      if (activeController === controller) activeController = undefined;
    }
  }
}

if (process.env.RUN_CRON_ON_START === "true") {
  await triggerNotifications();
}

while (!stopping) {
  const next = nextExecution();
  console.log(
    `Prochaine exécution des notifications : ${next.toISOString()} (${targetUrl}).`,
  );
  await wait(Math.max(0, next.getTime() - Date.now()));
  if (!stopping) await triggerNotifications();
}

console.log("Scheduler arrêté proprement.");
