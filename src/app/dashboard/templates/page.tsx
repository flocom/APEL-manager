import { ClipboardList } from "lucide-react";

import { TemplateManager } from "@/components/template-manager";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/rbac";
import { getChecklistTemplates } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  await requireRole("manager");
  const templates = await getChecklistTemplates();

  const serialized = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    tasks: t.tasks,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modèles de check-list"
        description="Créez et modifiez les check-lists réutilisables pour vos événements."
        icon={ClipboardList}
      />
      <TemplateManager templates={serialized} />
    </div>
  );
}
