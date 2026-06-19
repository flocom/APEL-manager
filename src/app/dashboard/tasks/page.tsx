import Link from "next/link";

import { TaskStatusSelect } from "@/components/task-status-select";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth/rbac";
import { getTasksForUser, type UserTask } from "@/lib/data";
import { formatDateTime, isOverdue } from "@/lib/dates";

export const dynamic = "force-dynamic";

function TaskItem({ task }: { task: UserTask }) {
  const overdue = task.status !== "done" && isOverdue(task.dueAt);
  return (
    <div className="flex items-start justify-between gap-3 p-4">
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
          <span className={overdue ? "font-medium text-red-600" : ""}>
            à gérer avant le {formatDateTime(task.dueAt)}
          </span>
        </p>
      </div>
      <TaskStatusSelect taskId={task.id} status={task.status} />
    </div>
  );
}

export default async function TasksPage() {
  const user = await requireUser();
  const tasks = await getTasksForUser(user.id);

  const overdue = tasks.filter((t) => t.status !== "done" && isOverdue(t.dueAt));
  const todo = tasks.filter((t) => t.status !== "done" && !isOverdue(t.dueAt));
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mes tâches</h1>
        <p className="text-slate-500">
          Les tâches qui vous ont été attribuées, par échéance.
        </p>
      </div>

      {tasks.length === 0 && (
        <Card className="p-6 text-sm text-slate-500">
          Aucune tâche ne vous est assignée pour le moment.
        </Card>
      )}

      {overdue.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-red-600">
            En retard ({overdue.length})
          </h2>
          <Card className="divide-y divide-slate-100 ring-1 ring-red-100">
            {overdue.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </Card>
        </section>
      )}

      {todo.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            À faire ({todo.length})
          </h2>
          <Card className="divide-y divide-slate-100">
            {todo.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </Card>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Terminées ({done.length})
          </h2>
          <Card className="divide-y divide-slate-100 opacity-75">
            {done.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
