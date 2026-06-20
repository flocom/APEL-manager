/**
 * Identité de l'association. Personnalisable sans toucher au code via la variable
 * d'environnement NEXT_PUBLIC_ASSO_NAME (ex. "APEL École Jean Moulin").
 */
export const APP_NAME =
  process.env.NEXT_PUBLIC_ASSO_NAME?.trim() || "APEL Manager";

/** Initiale affichée dans le logo. */
export const APP_INITIAL = APP_NAME.charAt(0).toUpperCase() || "A";

/** E-mail de contact affiché (mentions, RGPD). */
export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "";
