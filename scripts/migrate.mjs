import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

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

let migrationFailed = false;

try {
  console.log("Application des migrations PostgreSQL...");
  await migrate(drizzle(client), { migrationsFolder });
  console.log("Migrations PostgreSQL appliquées.");
} catch (error) {
  migrationFailed = true;
  process.exitCode = 1;
  console.error("Échec des migrations PostgreSQL.");
  console.error(error instanceof Error ? error.message : error);
} finally {
  try {
    await client.end({ timeout: 5 });
  } catch (error) {
    process.exitCode = 1;
    console.error("Impossible de fermer proprement la connexion PostgreSQL.");
    if (!migrationFailed) {
      console.error(error instanceof Error ? error.message : error);
    }
  }
}
