/**
 * Valeurs de repli neutres, utilisées uniquement tant que l'identité n'a pas
 * été saisie. L'identité active est chargée depuis association_settings par le
 * service serveur et se modifie dans Configuration.
 */
export const APP_NAME =
  process.env.NEXT_PUBLIC_ASSO_NAME?.trim() || "APEL Manager";

/** Nom de l'école rattachée à l'APEL. */
export const SCHOOL_NAME =
  process.env.NEXT_PUBLIC_SCHOOL_NAME?.trim() || "Votre établissement";

/** E-mail de contact affiché (mentions, RGPD). */
export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "";

/**
 * Identifiant RNA officiel de l'association. Vide par défaut : il se renseigne
 * dans Configuration et ne doit pas être versionné.
 */
export const ASSOCIATION_RNA =
  process.env.NEXT_PUBLIC_ASSOCIATION_RNA?.trim() || "";

/**
 * Dépôt du projet, au format `organisation/dépôt`. Même valeur que celle
 * surveillée par l'indicateur de version : une instance dérivée renvoie ainsi
 * vers son propre code, pas vers celui d'origine.
 */
export const PROJECT_REPOSITORY =
  process.env.UPDATE_REPOSITORY?.trim() || "flocom/APEL-manager";

export const PROJECT_REPOSITORY_URL = `https://github.com/${PROJECT_REPOSITORY}`;
