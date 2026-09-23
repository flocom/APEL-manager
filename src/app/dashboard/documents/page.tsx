import { asc, desc, inArray } from "drizzle-orm";
import { Files } from "lucide-react";

import {
  DocumentsManager,
  type AssociationDocumentView,
} from "@/components/documents-manager";
import { PageHeader } from "@/components/ui";
import { hasRole, requireRole } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import {
  associationDocuments,
  associationMembers,
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const user = await requireRole("manager");
  const documents = await db
    .select()
    .from(associationDocuments)
    .orderBy(desc(associationDocuments.documentDate));

  // Le registre des adhérents est réservé aux administrateurs : un organisateur
  // ne reçoit que les noms déjà rattachés à un document de la liste — ceux que
  // l'API des documents lui montre de toute façon. Sans eux, le sélecteur
  // « Adhérent concerné » d'un document existant retomberait sur « Aucun », et
  // l'enregistrer effacerait le rattachement.
  const rattaches = [
    ...new Set(
      documents
        .map((document) => document.memberId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const voitRegistre = hasRole(user, "admin");
  const members =
    voitRegistre || rattaches.length > 0
      ? await db
          .select({
            id: associationMembers.id,
            firstName: associationMembers.firstName,
            lastName: associationMembers.lastName,
          })
          .from(associationMembers)
          .where(
            voitRegistre ? undefined : inArray(associationMembers.id, rattaches),
          )
          .orderBy(
            asc(associationMembers.lastName),
            asc(associationMembers.firstName),
          )
      : [];

  const serialized: AssociationDocumentView[] = documents.map((document) => ({
    id: document.id,
    type: document.type,
    status: document.status,
    title: document.title,
    documentDate: document.documentDate.toISOString(),
    content: document.content,
    memberId: document.memberId,
    fileUrl: document.fileUrl,
    // Un booléen suffit à l'écran : le payload complet n'a rien à faire dans
    // le flux envoyé au navigateur pour une simple liste.
    payload: document.payload !== null,
    version: document.version,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Documents"
        description="Centralisez les procès-verbaux d'AG et les attestations officielles."
        icon={Files}
      />
      <DocumentsManager
        documents={serialized}
        memberOptions={members.map((member) => ({
          id: member.id,
          name: `${member.firstName} ${member.lastName}`,
        }))}
      />
    </div>
  );
}
