import { ListChecks, WandSparkles } from "lucide-react";
import { notFound } from "next/navigation";

import { ApplyTemplate } from "@/components/apply-template";
import { SectionHeading } from "@/components/event-detail";
import { TaskManager } from "@/components/task-manager";
import { Card } from "@/components/ui";
import { canManageEvents, requireUser } from "@/lib/auth/rbac";
import {
  getChecklistTemplates,
  getEventWithDetails,
  getMemberOptions,
} from "@/lib/data";

export const dynamic = "force-dynamic";

/** L'onglet « Préparation » : la check-list des tâches de l'événement. */
export default async function PreparationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, event] = await Promise.all([
    requireUser(),
    getEventWithDetails(id),
  ]);
  if (!event) notFound();

  const canManage = canManageEvents(user);
  const [memberOptions, templates] = await Promise.all([
    getMemberOptions(),
    canManage ? getChecklistTemplates() : Promise.resolve([]),
  ]);

  const tasks = event.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    leadTimeDays: t.leadTimeDays,
    leadTimeValue: t.leadTimeValue,
    leadTimeUnit: t.leadTimeUnit,
    dueAt: t.dueAt.toISOString(),
    status: t.status,
    assigneeIds: t.assignees.map((a) => a.userId),
    version: t.version,
  }));

  return (
    <div className="space-y-5">
      <SectionHeading
        icon={ListChecks}
        title="Check-list de préparation"
        description="Organisez les tâches, les responsables et les dates de traitement."
      />

      {canManage && event.tasks.length === 0 && (
        <Card className="!rounded-2xl !border-sea-200 !bg-sea-50 !shadow-none p-5 sm:p-6">
          <div className="mb-4 flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sea-600 text-white">
              <WandSparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-bold text-slate-950">
                Commencer depuis un modèle
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Choisissez le type d’événement : les tâches habituelles
                seront ajoutées automatiquement.
              </p>
            </div>
          </div>
          <ApplyTemplate
            eventId={event.id}
            templates={templates.map((template) => ({
              id: template.id,
              name: template.name,
              count: template.tasks.length,
            }))}
          />
        </Card>
      )}

      <Card className="!rounded-2xl !shadow-none p-5 sm:p-6">
        <TaskManager
          eventId={event.id}
          eventVersion={event.version}
          eventStartAt={event.startAt.toISOString()}
          tasks={tasks}
          members={memberOptions}
          canManage={canManage}
          currentUserId={user.id}
          eventClosed={
            event.cancelledAt !== null || event.status === "archived"
          }
        />
      </Card>
    </div>
  );
}
