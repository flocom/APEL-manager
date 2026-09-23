/**
 * Une erreur inattendue, telle qu'elle peut aller au journal du serveur.
 *
 * Drizzle enveloppe chaque échec de requête dans un message qui recopie le SQL
 * et toutes ses valeurs (« Failed query: … params: … ») : noms, adresses,
 * téléphones, montants, jetons de désinscription. PostgreSQL, de son côté, cite
 * volontiers la valeur fautive (« Key (email)=(…) already exists », « invalid
 * input syntax for type uuid: "…" »). Écrire l'erreur telle quelle mettait tout
 * cela dans les journaux, que l'hébergeur conserve et que d'autres lisent.
 *
 * Ce qui reste suffit à trouver la panne sans rien dire des personnes : la
 * classe de chaque erreur de la chaîne, le code SQLSTATE, la contrainte, la
 * table et la colonne, puis les premières lignes de la pile. Pour une erreur
 * qui ne vient pas de la base, le message est gardé, adresses e-mail masquées :
 * « Cannot read properties of undefined » est l'information utile.
 *
 * Module pur : utilisable partout, middleware compris.
 */

const PROFONDEUR_MAX = 4;
const LIGNES_DE_PILE = 6;

type ErreurPostgres = {
  name?: string;
  code?: unknown;
  severity?: unknown;
  constraint_name?: unknown;
  table_name?: unknown;
  column_name?: unknown;
  routine?: unknown;
};

function estErreurDeRequete(error: Error): boolean {
  return (
    error.name === "DrizzleQueryError" ||
    ("query" in error && "params" in error)
  );
}

function estErreurPostgres(error: Error): boolean {
  const e = error as ErreurPostgres;
  return (
    error.name === "PostgresError" ||
    (typeof e.code === "string" &&
      /^[0-9A-Z]{5}$/.test(e.code) &&
      typeof e.severity === "string")
  );
}

function masquer(message: string): string {
  return message
    .replace(/[^\s@"'<>()]+@[^\s@"'<>()]+\.[^\s@"'<>()]+/g, "[adresse]")
    .slice(0, 300);
}

function decrire(error: unknown): string {
  if (!(error instanceof Error)) {
    return typeof error === "string" ? masquer(error) : typeof error;
  }
  // Sa classe ne se nomme pas elle-même (`name` vaut « Error ») : on la dit.
  if (estErreurDeRequete(error)) return "DrizzleQueryError";
  if (estErreurPostgres(error)) {
    const e = error as ErreurPostgres;
    const details = [
      ["contrainte", e.constraint_name],
      ["table", e.table_name],
      ["colonne", e.column_name],
      ["routine", e.routine],
    ]
      .filter(([, valeur]) => typeof valeur === "string" && valeur)
      .map(([cle, valeur]) => `${cle} ${valeur as string}`);
    return `PostgresError ${String(e.code)}${details.length ? ` (${details.join(", ")})` : ""}`;
  }
  const brut = (error as { code?: unknown }).code;
  const code = typeof brut === "string" ? ` [${brut}]` : "";
  return `${error.name}${code}: ${masquer(error.message)}`;
}

/** L'erreur réduite à ce qui peut s'écrire au journal. */
export function redactError(error: unknown): string {
  const chaine: string[] = [];
  let courante: unknown = error;
  for (let i = 0; i < PROFONDEUR_MAX && courante; i += 1) {
    chaine.push(decrire(courante));
    courante =
      courante instanceof Error ? (courante as { cause?: unknown }).cause : null;
  }
  const pile =
    error instanceof Error && error.stack
      ? error.stack
          .split("\n")
          .filter((ligne) => ligne.trimStart().startsWith("at "))
          .slice(0, LIGNES_DE_PILE)
          .join("\n")
      : "";
  return pile ? `${chaine.join(" ← ")}\n${pile}` : chaine.join(" ← ");
}
