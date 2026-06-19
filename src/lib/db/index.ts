import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

// On évite de jeter une erreur à l'import (le build Next ne doit pas dépendre
// d'une connexion). La connexion réelle n'est ouverte qu'à la première requête.
const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://user:password@localhost:5432/placeholder";

const sql = neon(connectionString);

export const db = drizzle(sql, { schema });

export { schema };
