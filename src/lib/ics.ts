import { toPlainText } from "@/lib/text-formatting";

interface IcsEvent {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: Date;
  endAt?: Date | null;
}

function formatIcsDate(d: Date): string {
  // Format UTC : YYYYMMDDTHHMMSSZ
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Échappement d'une valeur TEXT (RFC 5545 §3.3.11).
 *
 * Tout saut de ligne devient la séquence littérale `\n`, qu'il s'écrive CRLF,
 * LF ou CR seul. L'ancienne version ne connaissait que les deux premiers : un
 * titre contenant un CR isolé (« Fête\rATTENDEE:mailto:… ») passait tel quel,
 * et la plupart des agendas, qui coupent les lignes sur CR comme sur LF, y
 * lisaient une propriété de plus — un invité, une alarme, une URL — glissée
 * dans le fichier que l'équipe importe. Les autres caractères de contrôle,
 * interdits dans une valeur TEXT, sont retirés : aucun n'a de sens dans un
 * titre ou un lieu, et certains lecteurs les prennent eux aussi pour des fins
 * de ligne.
 */
function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n|\u2028|\u2029|\u0085/g, "\\n")
    .replace(/(?!\t)\p{Cc}/gu, "");
}

/** Repli des lignes > 75 octets (RFC 5545 §3.1), sans couper un caractère UTF-8. */
function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const bytes = enc.encode(line);
  if (bytes.length <= 75) return line;

  const segments: string[] = [];
  let start = 0;
  let limit = 75; // 1ère ligne : 75 octets ; continuations : 74 (1 réservé à l'espace)
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Ne pas couper au milieu d'une séquence UTF-8 multi-octets.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    segments.push(dec.decode(bytes.subarray(start, end)));
    start = end;
    limit = 74;
  }
  return segments.join("\r\n ");
}

/** Génère un fichier iCalendar (.ics) pour un événement. */
export function buildEventIcs(event: IcsEvent): string {
  const end = event.endAt ?? new Date(event.startAt.getTime() + 2 * 60 * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//APEL Manager//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@apel-manager`,
    `DTSTAMP:${formatIcsDate(new Date(event.startAt))}`,
    `DTSTART:${formatIcsDate(event.startAt)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
  ];
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcs(toPlainText(event.description))}`);
  }
  if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n");
}
