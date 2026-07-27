import { ListChecks } from "lucide-react";
import Link from "next/link";

import { TaskStatusSelect } from "@/components/task-status-select";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/rbac";
import { getTasksForUser, type UserTask } from "@/lib/data";
import { formatDateTime, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function TaskItem({ task, muted }: { task: UserTask; muted?: boolean }) {
  const overdue = task.status !== "done" && isOverdue(task.dueAt);
  return (
    <Card
      className={cn(
        "flex h-full items-start justify-between gap-3 p-4",
        overdue && "ring-1 ring-coral-200",
        muted && "opacity-75",
      )}
    >
      <div className="min-w-0">
        <p className="font-medium text-slate-900">{task.title}</p>
        {task.description && (
          <p className="mt-0.5 text-sm text-slate-500">{task.description}</p>
        )}
        <p className="mt-1 text-sm text-slate-500">
          <Link
            href={`/dashboard/events/${task.eventId}`}
            className="text-brand-600 hover:underline"
          >
            {task.event.title}
          </Link>{" "}
          ·{" "}
          <span className={overdue ? "font-medium text-coral-600" : ""}>
            {overdue ? "à traiter depuis le" : "à traiter à partir du"}{" "}
            {formatDateTime(task.dueAt)}
          </span>
        </p>
      </div>
      <TaskStatusSelect taskId={task.id} status={task.status} />
    </Card>
  );
}

export default async function TasksPage() {
  const user = await requireUser();
  const tasks = await getTasksForUser(user.id);

  const overdue = tasks.filter((t) => t.status !== "done" && isOverdue(t.dueAt));
  const todo = tasks.filter((t) => t.status !== "done" && !isOverdue(t.dueAt));
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Mes tâches"
        description="Les tâches qui vous ont été attribuées, classées par date de traitement."
        icon={ListChecks}
      />

      {tasks.length === 0 && (
        <EmptyState
          icon={ListChecks}
          title="Aucune tâche assignée"
          description="Les tâches qui vous seront attribuées apparaîtront ici."
        />
      )}

      {overdue.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-coral-600">
            À traiter maintenant ({overdue.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {overdue.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        </section>
      )}

      {todo.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            À venir ({todo.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {todo.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Terminées ({done.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {done.map((task) => (
              <TaskItem key={task.id} task={task} muted />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
