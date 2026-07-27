import { ArrowLeft, CalendarPlus } from "lucide-react";
import Link from "next/link";

import { EventForm } from "@/components/event-form";
import { buttonClasses, PageHeader } from "@/components/ui";
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
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/dashboard/events"
        className={buttonClasses("outline", "sm")}
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux événements
      </Link>
      <PageHeader
        title="Nouvel événement"
        description="Renseignez l’essentiel maintenant ; la préparation et les bénévoles pourront être complétés ensuite."
        icon={CalendarPlus}
      />
      <EventForm templates={templateOptions} />
    </div>
  );
}
