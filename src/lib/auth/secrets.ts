import "server-only";

import { hkdfSync } from "node:crypto";

/**
 * AUTH_SECRET et les clés qui en dérivent.
 *
 * Le même secret servait tel quel à signer les sessions, à chiffrer les
 * identifiants saisis dans Configuration (quand SETTINGS_ENCRYPTION_KEY
 * manque) et à signer le consentement OAuth (quand OAUTH_SECRET manque). Un
 * usage qui laisse fuir quelque chose de sa clé exposait alors les deux
 * autres. Chaque usage reçoit désormais sa propre clé, tirée d'AUTH_SECRET par
 * HKDF avec une étiquette distincte : connaître l'une n'apprend rien des
 * autres, et il n'y a toujours qu'un secret à conserver.
 */

/**
 * En dessous, l'application refuse de signer quoi que ce soit : c'était déjà
 * la règle, et la relever ferait tomber d'un coup une installation existante.
 */
export const AUTH_SECRET_MINIMUM = 16;

/**
 * Longueur attendue : ce que produit `openssl rand -base64 32` (44 signes), ce
 * que génère le point d'entrée Docker (64), ce que demande la documentation.
 */
export const AUTH_SECRET_RECOMMANDE = 32;

/**
 * Textes d'exemple qu'on retrouve recopiés tels quels (comparés lettres et
 * chiffres seuls : « change-me », « CHANGE_ME » et « changeme » se valent).
 */
const VALEURS_EXEMPLE = [
  "changeme",
  "changethis",
  "replaceme",
  "yoursecret",
  "votresecret",
  "placeholder",
  "generatewith",
  "opensslrand",
];

/**
 * Pourquoi ce secret est faible, ou `null` s'il convient.
 *
 * Trop court, ou « trivialement répétitif » : peu de signes différents
 * (`aaaa…`, `abab…`), un motif répété, une valeur d'exemple. Un vrai secret
 * aléatoire de 32 signes en compte bien plus de dix différents, même en
 * hexadécimal.
 */
export function secretWeakness(
  secret: string | undefined | null,
): string | null {
  const valeur = secret?.trim() ?? "";
  if (!valeur) return "il est absent";
  if (valeur.length < AUTH_SECRET_RECOMMANDE) {
    return `il ne compte que ${valeur.length} caractères (${AUTH_SECRET_RECOMMANDE} au moins)`;
  }
  if (new Set(valeur).size < 10) {
    return "il répète trop peu de caractères différents";
  }
  // Un motif court répété sur l'essentiel du secret : « secretsecretsecret… ».
  const motif = valeur.match(/^(.{1,16}?)\1+/);
  if (motif && motif[0].length >= valeur.length * 0.75) {
    return "il répète un même motif";
  }
  const reduite = valeur.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (VALEURS_EXEMPLE.some((exemple) => reduite.includes(exemple))) {
    return "il reprend une valeur d'exemple";
  }
  return null;
}

/** AUTH_SECRET tel que configuré, sans espaces autour. */
export function authSecret(): string {
  return process.env.AUTH_SECRET?.trim() ?? "";
}

/**
 * Une clé de 32 octets propre à un usage, dérivée d'AUTH_SECRET.
 *
 * L'étiquette fait partie de la dérivation : deux usages aux étiquettes
 * différentes ont des clés sans rapport. Ne jamais changer une étiquette
 * existante — ce qui a été chiffré ou signé avec l'ancienne deviendrait
 * illisible.
 */
export function deriveKeyFromAuthSecret(etiquette: string): Buffer {
  const secret = authSecret();
  if (secret.length < AUTH_SECRET_MINIMUM) {
    throw new Error(
      `AUTH_SECRET est manquant ou trop court. Définissez une chaîne aléatoire d'au moins ${AUTH_SECRET_RECOMMANDE} caractères.`,
    );
  }
  return Buffer.from(
    hkdfSync("sha256", secret, "apel-manager", etiquette, 32),
  );
}
