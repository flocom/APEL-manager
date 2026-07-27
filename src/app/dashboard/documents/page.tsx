import { asc, desc } from "drizzle-orm";
import { Files } from "lucide-react";

import {
  DocumentsManager,
  type AssociationDocumentView,
} from "@/components/documents-manager";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import {
  associationDocuments,
  associationMembers,
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  await requireRole("manager");
  const [documents, members] = await Promise.all([
    db
      .select()
      .from(associationDocuments)
      .orderBy(desc(associationDocuments.documentDate)),
    db
      .select({
        id: associationMembers.id,
        firstName: associationMembers.firstName,
        lastName: associationMembers.lastName,
      })
      .from(associationMembers)
      .orderBy(asc(associationMembers.lastName), asc(associationMembers.firstName)),
  ]);

  const serialized: AssociationDocumentView[] = documents.map((document) => ({
    id: document.id,
    type: document.type,
    status: document.status,
    title: document.title,
    documentDate: document.documentDate.toISOString(),
    content: document.content,
    memberId: document.memberId,
    fileUrl: document.fileUrl,
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
