import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  feuilleAdherents,
  formatAdherentsCsv,
  tableauAdherents,
  tarifDeReference,
} from "@/lib/adherent-export";
import { currentSchoolYear } from "@/lib/dates";
import { db } from "@/lib/db";
import { associationMembers } from "@/lib/db/schema";
import { buildXlsx } from "@/lib/xlsx";

import { getAssociationSettings } from "./association-settings";
import { recordAudit, type AuditActor } from "./audit";

const drapeau = z
  .enum(["0", "1"])
  .optional()
  .transform((value) => value === "1");

export const adherentsExportSchema = z.object({
  annee: z.string().regex(/^\d{4}-\d{4}$/, "Année scolaire invalide (ex. 2026-2027)."),
  format: z.enum(["xlsx", "csv"]).default("xlsx"),
  /**
   * Par défaut, les seules adhésions actives : c'est ce que l'APEL
   * départementale compte. Une fiche en attente n'est pas encore une adhésion,
   * on ne l'ajoute que sur demande ; une fiche inactive (archivée) jamais.
   */
  enAttente: drapeau,
  /** Familles adhérentes par un autre établissement, écartées par défaut. */
  autresEtablissements: drapeau,
});

/**
 * Liste des adhérents d'une année pour l'APEL départementale
 * (`tableauAdherents`), en classeur Excel — ce que les départementales
 * demandent — ou en CSV. Le fichier porte des coordonnées de familles et sort
 * de l'association : chaque export est consigné au journal.
 */
export async function exportAdherents(input: unknown, actor: AuditActor) {
  const { annee, format, enAttente, autresEtablissements } =
    adherentsExportSchema.parse(input);
  const statuts: ("active" | "pending")[] = enAttente ? ["active", "pending"] : ["active"];
  const [adherents, settings] = await Promise.all([
    db
      .select()
      .from(associationMembers)
      .where(
        and(
          eq(associationMembers.schoolYear, annee),
          inArray(associationMembers.status, statuts),
        ),
      ),
    getAssociationSettings(),
  ]);

  const tableau = tableauAdherents(adherents, {
    annee,
    associationName: settings.associationName,
    schoolName: settings.schoolName,
    autresEtablissements,
    tarifPublieCents: tarifDeReference(annee, currentSchoolYear(), settings.membershipFeeCents),
    exporteLe: new Date(),
  });

  await recordAudit(actor, "adherent.export", "association_member", undefined, {
    schoolYear: annee,
    format,
    statuts,
    autresEtablissements,
    count: tableau.retenus,
  });

  const nom = `adherents-apel-${annee}`;
  if (format === "csv") {
    return {
      filename: `${nom}.csv`,
      contentType: "text/csv; charset=utf-8",
      body: Buffer.from(formatAdherentsCsv(tableau), "utf8"),
    };
  }
  return {
    filename: `${nom}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body: buildXlsx([feuilleAdherents(tableau, annee)]),
  };
}
