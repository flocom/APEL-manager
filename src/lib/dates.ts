import { formatDistanceToNow, isPast } from "date-fns";
import { fr } from "date-fns/locale";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

// L'application est mono-fuseau : tout est affiché et saisi en heure de Paris,
// tandis que les instants sont stockés en UTC. Figer le fuseau garantit que le
// rendu serveur (UTC sur Vercel) et le rendu client (fuseau du navigateur)
// produisent exactement la même chaîne — donc pas de décalage ni de
// "hydration mismatch".
export const APP_TIMEZONE = "Europe/Paris";

/** Début de traitement d'une tâche = début de l'événement - durée d'anticipation. */
export function computeDueAt(startAt: Date, leadTimeDays: number): Date {
  return new Date(startAt.getTime() - leadTimeDays * 24 * 60 * 60 * 1000);
}

export function formatDateTime(d: Date | string): string {
  return formatInTimeZone(new Date(d), APP_TIMEZONE, "EEEE d MMMM yyyy 'à' HH'h'mm", {
    locale: fr,
  });
}

export function formatShortDate(d: Date | string): string {
  return formatInTimeZone(new Date(d), APP_TIMEZONE, "dd/MM/yyyy", { locale: fr });
}

/** Date en toutes lettres, sans le jour de la semaine : « 12 janvier 2027 ». */
export function formatLongDate(d: Date | string): string {
  return formatInTimeZone(new Date(d), APP_TIMEZONE, "d MMMM yyyy", {
    locale: fr,
  });
}

/** Comme formatLongDate, avec l'heure : « 12 janvier 2027 à 14h30 ». */
export function formatLongDateTime(d: Date | string): string {
  return formatInTimeZone(
    new Date(d),
    APP_TIMEZONE,
    "d MMMM yyyy 'à' HH'h'mm",
    { locale: fr },
  );
}

/** Heure seule : « 14h30 ». */
export function formatTimeOfDay(d: Date | string): string {
  return formatInTimeZone(new Date(d), APP_TIMEZONE, "HH'h'mm", { locale: fr });
}

export function formatRelative(d: Date | string): string {
  return formatDistanceToNow(new Date(d), { addSuffix: true, locale: fr });
}

export function isOverdue(d: Date | string): boolean {
  return isPast(new Date(d));
}

/**
 * Interprète une valeur d'<input type="datetime-local"> (heure de Paris, sans
 * fuseau) comme un instant UTC. À utiliser côté serveur lors de la validation.
 */
export function parseLocalDateTime(value: string): Date {
  return fromZonedTime(value, APP_TIMEZONE);
}

/**
 * Prépare un instant pour une requête SQL écrite à la main.
 *
 * Les requêtes construites avec `sql\`\`` puis exécutées par `db.execute`
 * passent par le mode `unsafe` du pilote, qui n'accepte que des chaînes : un
 * objet Date interpolé tel quel fait échouer la sérialisation des paramètres.
 * Le constructeur de requêtes Drizzle, lui, connaît le type des colonnes et
 * n'a pas besoin de cette conversion.
 */
export function toSqlTimestamp(value: Date | null | undefined): string | null {
  return value == null ? null : value.toISOString();
}

/** Convertit un instant en valeur pour <input type="datetime-local"> (heure de Paris). */
export function toDatetimeLocal(d: Date | string | null | undefined): string {
  if (!d) return "";
  return formatInTimeZone(new Date(d), APP_TIMEZONE, "yyyy-MM-dd'T'HH:mm");
}
