import { DocumentsReglesForm } from "@/components/documents-regles-form";
import { requireRole } from "@/lib/auth/rbac";
import { getAssociationSettings } from "@/lib/services/association-settings";

export const dynamic = "force-dynamic";

export default async function ReglesStatutairesPage() {
  await requireRole("admin");
  const association = await getAssociationSettings();
  return <DocumentsReglesForm regles={association.statutoryRules ?? {}} />;
}
