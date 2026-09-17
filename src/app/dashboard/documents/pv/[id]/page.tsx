import { asc } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { PvEditeur, type PvDocumentView } from "@/components/pv/pv-editeur";
import { requireRole } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { associationMembers } from "@/lib/db/schema";
import { payloadVide } from "@/lib/documents/ag-types";
import { getAssociationDocument } from "@/lib/services/documents";
import { getAssociationSettings } from "@/lib/services/association-settings";

export const dynamic = "force-dynamic";

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
  await requireRole("manager");
  const { id } = await params;

  const [document, association, adherents] = await Promise.all([
    getAssociationDocument(id),
    getAssociationSettings(),
    db
      .select({
        id: associationMembers.id,
        firstName: associationMembers.firstName,
        lastName: associationMembers.lastName,
      })
      .from(associationMembers)
      .orderBy(asc(associationMembers.lastName), asc(associationMembers.firstName)),
  ]);

  if (!document) notFound();
  // Un procès-verbal saisi en texte libre garde son formulaire d'origine : on
  // ne convertit pas d'office ce que quelqu'un a déjà rédigé autrement.
  if (document.type !== "ag_minutes" || !document.payload) {
    redirect("/dashboard/documents");
  }

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
