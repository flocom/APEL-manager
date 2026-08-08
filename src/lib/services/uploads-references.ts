import "server-only";

import { isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  accountingEntries,
  associationDocuments,
  associationSettings,
  eventAttachments,
} from "@/lib/db/schema";

/**
 * Fichiers encore utilisés, pour que le nettoyage des orphelins ne détruise
 * que ce qui ne sert plus.
 *
 * L'inventaire est établi en balayant *toutes* les tables, et non une liste de
 * colonnes tenue à la main : une telle liste avait déjà pris du retard sur le
 * schéma, et le logo de l'association comme les pièces jointes d'événement,
 * ajoutés après elle, étaient effacés au bout de vingt-quatre heures. Une
 * colonne ajoutée demain est prise en compte sans que personne ait à y penser.
 */

/** Identifiant de dépôt tel qu'il apparaît dans une URL `/api/uploads/<id>/…`. */
const UPLOAD_ID_IN_TEXT =
  "/api/uploads/((?:accounting|document|branding)-[0-9a-f-]{36})/";

/**
 * Le journal d'audit conserve l'historique, pas des références : un fichier
 * supprimé de la comptabilité y reste cité pour toujours et ne doit pas
 * survivre indéfiniment sur le disque pour autant. C'est aussi la seule table
 * qui grossit sans limite, donc la seule dont le balayage coûterait cher.
 */
const HISTORY_TABLES = ["audit_logs"];

/**
 * Colonnes dont on sait qu'elles portent un fichier. Elles ne servent pas à
 * établir l'inventaire mais à le contrôler : si le balayage général en manque
 * une seule, c'est qu'il est cassé, et supprimer quoi que ce soit sur cette
 * base serait une perte de données.
 */
async function knownReferencedIds(): Promise<Set<string>> {
  const [entries, documents, attachments, settings] = await Promise.all([
    db
      .select({ url: accountingEntries.attachmentUrl })
      .from(accountingEntries)
      .where(isNotNull(accountingEntries.attachmentUrl)),
    db
      .select({ url: associationDocuments.fileUrl })
      .from(associationDocuments)
      .where(isNotNull(associationDocuments.fileUrl)),
    db.select({ url: eventAttachments.fileUrl }).from(eventAttachments),
    db
      .select({ url: associationSettings.logoUrl })
      .from(associationSettings)
      .where(isNotNull(associationSettings.logoUrl)),
  ]);

  const ids = new Set<string>();
  const pattern = new RegExp(UPLOAD_ID_IN_TEXT);
  for (const row of [...entries, ...documents, ...attachments, ...settings]) {
    const match = row.url ? pattern.exec(row.url) : null;
    if (match) ids.add(match[1]);
  }
  return ids;
}

async function scanAllTables(): Promise<Set<string>> {
  const tables = (await db.execute(sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `)) as unknown as { table_name: string }[];

  const scanned = tables
    .map((row) => row.table_name)
    .filter((name) => !HISTORY_TABLES.includes(name));
  if (scanned.length === 0) return new Set();

  // La ligne entière est convertie en texte : la recherche porte donc sur
  // toutes les colonnes, quel que soit leur type, sans avoir à les énumérer.
  const query = scanned
    .map(
      (name) =>
        `select distinct (regexp_matches(to_jsonb(t.*)::text, '${UPLOAD_ID_IN_TEXT}', 'g'))[1] as id from "public"."${name.replace(/"/g, '""')}" t`,
    )
    .join(" union ");

  const rows = (await db.execute(sql.raw(query))) as unknown as {
    id: string | null;
  }[];
  return new Set(rows.map((row) => row.id).filter((id): id is string => !!id));
}

/**
 * Lève une exception plutôt que de renvoyer un inventaire douteux : l'appelant
 * abandonne alors le nettoyage, ce qui laisse au pire des fichiers inutiles sur
 * le disque — l'erreur réparable.
 */
export async function collectReferencedUploadIds(): Promise<Set<string>> {
  const [scanned, known] = await Promise.all([
    scanAllTables(),
    knownReferencedIds(),
  ]);

  const missed = [...known].filter((id) => !scanned.has(id));
  if (missed.length > 0) {
    throw new Error(
      `Inventaire des fichiers incohérent : ${missed.length} référence(s) connue(s) absente(s) du balayage (${missed.join(", ")}).`,
    );
  }

  return new Set([...scanned, ...known]);
}
