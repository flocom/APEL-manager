/**
 * Valeurs de repli historiques. L'identité active est chargée depuis
 * association_settings par le service serveur et se modifie dans Configuration.
 */
export const APP_NAME =
  process.env.NEXT_PUBLIC_ASSO_NAME?.trim() || "APEL Notre Dame des Flots";

/** Nom de l'école rattachée à l'APEL. */
export const SCHOOL_NAME =
  process.env.NEXT_PUBLIC_SCHOOL_NAME?.trim() || "École Notre Dame des Flots";

/** Initiale affichée dans le logo. */
export const APP_INITIAL = APP_NAME.charAt(0).toUpperCase() || "A";

/** E-mail de contact affiché (mentions, RGPD). */
export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "";

/** Identifiant RNA officiel de l'association. */
export const ASSOCIATION_RNA =
  process.env.NEXT_PUBLIC_ASSOCIATION_RNA?.trim() || "W853001441";
