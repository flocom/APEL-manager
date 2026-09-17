import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "Migration impossible : la variable d'environnement DATABASE_URL est absente.",
  );
  process.exit(1);
}

const migrationsFolder = fileURLToPath(
  new URL("../drizzle", import.meta.url),
);
const client = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 10,
  idle_timeout: 5,
});

/**
 * Codes qui signifient « la base n'est pas encore joignable ». Eux seuls
 * justifient de réessayer : au démarrage d'une pile, PostgreSQL met quelques
 * secondes à accepter les connexions.
 *
 * Tout le reste — une erreur SQL, un index unique refusé par des doublons
 * réels, une contrainte violée par les données en place — se reproduira à
 * l'identique trente fois de suite. Les confondre faisait afficher
 * « PostgreSQL indisponible » pendant quatre minutes pour une migration
 * fautive, et envoyait chercher une panne de base qui n'existait pas.
 */
const CODES_CONNEXION = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ECONNRESET",
  "EPIPE",
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
  // PostgreSQL démarre, accepte la connexion et la refuse aussitôt.
  "57P03",
]);

function estPanneDeConnexion(error) {
  for (let cause = error; cause; cause = cause.cause) {
    if (cause.code && CODES_CONNEXION.has(String(cause.code))) return true;
  }
  return false;
}

/** Code 2 : inutile de réessayer. Code 1 : la base n'est pas encore là. */
const SORTIE_FATALE = 2;
const SORTIE_REESSAYABLE = 1;

let migrationFailed = false;

try {
  console.log("Application des migrations PostgreSQL...");
  await migrate(drizzle(client), { migrationsFolder });
  console.log("Migrations PostgreSQL appliquées.");
} catch (error) {
  migrationFailed = true;
  const reessayable = estPanneDeConnexion(error);
  process.exitCode = reessayable ? SORTIE_REESSAYABLE : SORTIE_FATALE;
  console.error(
    reessayable
      ? "PostgreSQL n'est pas joignable pour appliquer les migrations."
      : "Migration refusée par PostgreSQL : cette version ne peut pas démarrer.",
  );
  console.error(error instanceof Error ? error.message : error);
} finally {
  try {
    await client.end({ timeout: 5 });
  } catch (error) {
    // Ne pas écraser un diagnostic fatal par un simple défaut de fermeture.
    process.exitCode = process.exitCode || SORTIE_REESSAYABLE;
    console.error("Impossible de fermer proprement la connexion PostgreSQL.");
    if (!migrationFailed) {
      console.error(error instanceof Error ? error.message : error);
    }
  }
}
