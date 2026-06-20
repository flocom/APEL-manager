import Link from "next/link";

import { EventForm } from "@/components/event-form";
import { Card } from "@/components/ui";
import { requireRole } from "@/lib/auth/rbac";
import { getChecklistTemplates } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  await requireRole("manager");
  const templates = await getChecklistTemplates();
  const templateOptions = templates.map((t) => ({
    id: t.id,
    name: t.name,
    count: t.tasks.length,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/events"
          className="text-sm text-brand-600 hover:underline"
        >
          ← Retour aux événements
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Nouvel événement
        </h1>
      </div>
      <Card className="p-6">
        <EventForm templates={templateOptions} />
      </Card>
    </div>
  );
}
