/** Concatène des classes en ignorant les valeurs falsy. */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

/** Normalise une chaîne optionnelle : "" ou espaces → null. */
export function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Un identifiant d'URL a-t-il la forme d'un UUID ? À vérifier avant de le
 * donner à Postgres : sinon un lien tronqué ou retouché fait échouer la
 * requête (« invalid input syntax for type uuid »), et la page affiche une
 * erreur au lieu de « introuvable ».
 */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
