/**
 * Identité de la version en cours d'exécution. Les trois valeurs sont injectées
 * dans l'image au moment de la construction (voir Dockerfile et le workflow
 * `docker-publish`). Hors image, elles restent vides : l'application affiche
 * alors « développement ».
 */

export const APP_VERSION = process.env.APP_VERSION?.trim() || "dev";

/** SHA complet du commit ayant produit l'image. */
export const APP_REVISION = process.env.APP_REVISION?.trim() || "";

/** Date ISO 8601 de construction de l'image. */
export const APP_BUILD_TIME = process.env.APP_BUILD_TIME?.trim() || "";

/** Forme courte et lisible d'un SHA de commit. */
export function shortRevision(revision: string) {
  return revision.trim().slice(0, 7);
}

export interface RuntimeVersion {
  version: string;
  revision: string;
  shortRevision: string;
  buildTime: string | null;
  /** Vrai quand l'application ne tourne pas depuis une image versionnée. */
  development: boolean;
}

export function getRuntimeVersion(): RuntimeVersion {
  return {
    version: APP_VERSION,
    revision: APP_REVISION,
    shortRevision: shortRevision(APP_REVISION),
    buildTime: APP_BUILD_TIME || null,
    development: APP_VERSION === "dev" && !APP_REVISION,
  };
}
