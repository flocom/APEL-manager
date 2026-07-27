import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

// On évite de jeter une erreur à l'import (le build Next ne doit pas dépendre
// d'une connexion). La connexion réelle n'est ouverte qu'à la première requête.
const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://user:password@localhost:5432/placeholder";

type DatabaseGlobal = typeof globalThis & {
  apelPostgresClient?: ReturnType<typeof postgres>;
};

const databaseGlobal = globalThis as DatabaseGlobal;

function readPoolSize() {
  const fallback = process.env.VERCEL ? 1 : 10;
  const configured = Number(process.env.DATABASE_POOL_MAX ?? fallback);

  if (!Number.isInteger(configured) || configured < 1) return fallback;
  return Math.min(configured, 50);
}

const client =
  databaseGlobal.apelPostgresClient ??
  postgres(connectionString, {
    // Désactive les prepared statements nommés pour rester compatible avec les
    // URLs Neon "pooled", tout en fonctionnant normalement avec PostgreSQL.
    prepare: false,
    max: readPoolSize(),
    connect_timeout: 10,
    idle_timeout: 20,
  });

// Le rechargement à chaud de Next.js ne doit pas créer un nouveau pool à
// chaque compilation en développement.
if (process.env.NODE_ENV !== "production") {
  databaseGlobal.apelPostgresClient = client;
}

export const db = drizzle(client, { schema });

export { schema };
