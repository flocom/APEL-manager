import { asc, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { PvEditeur, type PvDocumentView } from "@/components/pv/pv-editeur";
import { hasRole, requireRole } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { associationMembers } from "@/lib/db/schema";
import { payloadVide } from "@/lib/documents/ag-types";
import { getAssociationSettings } from "@/lib/services/association-settings";

import { chargerDocument } from "./document";

export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Les adhérents déjà cités dans le procès-verbal, où qu'ils le soient :
 * bureau de séance, candidats, composition des instances… Le parcours est
 * générique pour qu'une rubrique ajoutée plus tard soit comptée sans y penser.
 */
function adherentsCites(valeur: unknown, ids = new Set<string>()): Set<string> {
  if (Array.isArray(valeur)) {
    for (const element of valeur) adherentsCites(element, ids);
  } else if (valeur && typeof valeur === "object") {
    for (const [cle, element] of Object.entries(valeur)) {
      // Filtré au format UUID : le payload est du JSON libre, et une valeur
      // mal formée ferait échouer toute la requête sur la colonne uuid.
      if (cle === "memberId" && typeof element === "string") {
        if (UUID.test(element)) ids.add(element);
      } else adherentsCites(element, ids);
    }
  }
  return ids;
}

/**
 * Écran de rédaction d'un procès-verbal d'assemblée générale.
 *
 * Toute `Date` est convertie en chaîne avant la frontière serveur/client : la
 * sérialisation est manuelle dans ce module, et un champ oublié n'arriverait
 * jamais jusqu'à l'éditeur.
 */
export default async function PvPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("manager");
  const { id } = await params;

  const [document, association] = await Promise.all([
    chargerDocument(id),
    getAssociationSettings(),
  ]);

  if (!document) notFound();
  // Un procès-verbal saisi en texte libre garde son formulaire d'origine : on
  // ne convertit pas d'office ce que quelqu'un a déjà rédigé autrement.
  if (document.type !== "ag_minutes" || !document.payload) {
    redirect("/dashboard/documents");
  }

  // Le registre des adhérents est réservé aux administrateurs. Un organisateur
  // rédige le procès-verbal en saisissant les noms ; il ne reçoit que les
  // adhérents que le document cite déjà, pour que modifier une ligne ne
  // défasse pas son rattachement. Seul l'administrateur a la liste complète
  // en suggestion.
  const voitRegistre = hasRole(user, "admin");
  const cites = [...adherentsCites(document.payload)];
  const adherents =
    voitRegistre || cites.length > 0
      ? await db
          .select({
            id: associationMembers.id,
            firstName: associationMembers.firstName,
            lastName: associationMembers.lastName,
          })
          .from(associationMembers)
          .where(voitRegistre ? undefined : inArray(associationMembers.id, cites))
          .orderBy(
            asc(associationMembers.lastName),
            asc(associationMembers.firstName),
          )
      : [];

  const vue: PvDocumentView = {
    id: document.id,
    title: document.title,
    status: document.status,
    documentDate: document.documentDate.toISOString(),
    version: document.version,
    payload: { ...payloadVide(), ...document.payload },
  };

  return (
    <PvEditeur
      document={vue}
      regles={association.statutoryRules ?? {}}
      adherents={adherents.map((a) => ({
        id: a.id,
        name: `${a.firstName} ${a.lastName}`,
      }))}
    />
  );
}
