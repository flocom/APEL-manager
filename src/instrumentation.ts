/**
 * Contrôle de la configuration au démarrage du serveur.
 *
 * Un secret faible ou une APP_URL absente n'arrêtent pas l'application —
 * l'arrêter enfermerait dehors une installation qui tournait la veille —,
 * mais ils sont écrits en tête du journal, à chaque démarrage, là où
 * l'hébergeur les montre. Les administrateurs les retrouvent aussi dans
 * l'écran Configuration (lib/security-config.ts).
 */
export async function register() {
  // Seulement côté Node : le middleware tourne dans un autre environnement,
  // sans `node:crypto`. Écrit en bloc plutôt qu'en retour anticipé, pour que
  // la construction retire ce code de la version destinée au middleware.
  // Pendant `next build`, la configuration de production n'est pas là.
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { redactError } = await import("@/lib/errors");
    caviarderLesErreursDuJournal(redactError);

    const { securityConfigWarnings } = await import("@/lib/security-config");
    for (const { titre, detail } of securityConfigWarnings()) {
      console.warn(`[securite] ATTENTION — ${titre}. ${detail}`);
    }
  }
}

const DEJA_CAVIARDE = Symbol.for("apel.console-caviardee");

/**
 * Toute erreur écrite au journal passe par `redactError`, y compris celles
 * que Next écrit lui-même.
 *
 * Nos propres `catch` la caviardaient déjà. Mais une erreur inattendue pendant
 * le rendu d'une page — un identifiant qui n'est pas un UUID, une panne de la
 * base — est écrite par Next, avec `console.error`, telle quelle : le SQL de
 * la requête et toutes ses valeurs (jetons de partage ou de désinscription,
 * adresses, identifiants), dans les journaux que l'hébergeur conserve. On
 * remplace donc chaque `Error` passée à `console.error` ou `console.warn` par
 * sa forme caviardée. Le reste du message ne change pas, et l'empreinte
 * (`digest`) que Next affiche sur la page d'erreur est gardée : c'est elle
 * qui permet de retrouver la ligne du journal.
 */
function caviarderLesErreursDuJournal(
  redactError: (error: unknown) => string,
): void {
  const marque = globalThis as { [DEJA_CAVIARDE]?: boolean };
  // Une seule fois par processus : envelopper deux fois ne caviarderait pas
  // mieux, et chaque couche ajouterait son coût à chaque ligne.
  if (marque[DEJA_CAVIARDE]) return;
  marque[DEJA_CAVIARDE] = true;

  const caviarder = (argument: unknown): unknown => {
    if (!(argument instanceof Error)) return argument;
    const digest = (argument as { digest?: unknown }).digest;
    const texte = redactError(argument);
    return typeof digest === "string" && digest
      ? `${texte}\n  (digest ${digest})`
      : texte;
  };
  for (const methode of ["error", "warn"] as const) {
    const origine = console[methode].bind(console);
    console[methode] = (...args: unknown[]) => origine(...args.map(caviarder));
  }
}
