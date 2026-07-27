import { ClipboardList } from "lucide-react";

import { EventWorkspaceNav } from "@/components/event-workspace-nav";
import { TemplateManager } from "@/components/template-manager";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth/rbac";
import { getChecklistTemplates } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  await requireRole("manager");
  const templates = await getChecklistTemplates();

  const serialized = templates.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    tasks: template.tasks,
    version: template.version,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Modèles de check-list"
        description="Préparez une fois vos organisations types, puis réutilisez-les sur chaque événement."
        icon={ClipboardList}
      />
      <EventWorkspaceNav active="templates" />
      <TemplateManager templates={serialized} />
    </div>
  );
}
