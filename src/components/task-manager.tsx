"use client";

import { ChevronDown, ChevronUp, Hand } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { TaskStatusSelect } from "@/components/task-status-select";
import { Badge, Button, Input, Label, Textarea } from "@/components/ui";
import { api } from "@/lib/client";
import type { TaskStatus } from "@/lib/db/schema";
import { formatShortDate, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface TaskItemData {
  id: string;
  title: string;
  description: string | null;
  leadTimeDays: number;
  dueAt: string;
  status: TaskStatus;
  assigneeIds: string[];
}

export interface MemberOption {
  id: string;
  name: string;
}

function MemberCheckboxes({
  members,
  selected,
  onToggle,
}: {
  members: MemberOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (members.length === 0) {
    return <p className="text-xs text-slate-400">Aucun membre disponible.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {members.map((m) => {
        const active = selected.includes(m.id);
        return (
          <button
            type="button"
            key={m.id}
            onClick={() => onToggle(m.id)}
            className={
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
              (active
                ? "border-brand-300 bg-brand-50 text-brand-700"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50")
            }
          >
            {active ? "✓ " : ""}
            {m.name}
          </button>
        );
      })}
    </div>
  );
}

export function TaskManager({
  eventId,
  tasks,
  members,
  canManage,
  currentUserId,
}: {
  eventId: string;
  tasks: TaskItemData[];
  members: MemberOption[];
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const memberName = (id: string) =>
    members.find((m) => m.id === id)?.name ?? "Membre";

  // --- Formulaire d'ajout ---------------------------------------------------
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [leadTime, setLeadTime] = useState(7);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetAdd() {
    setTitle("");
    setDescription("");
    setLeadTime(7);
    setAssignees([]);
    setShowAdd(false);
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/api/events/${eventId}/tasks`, {
        body: {
          title,
          description,
          leadTimeDays: leadTime,
          assigneeIds: assignees,
        },
      });
      resetAdd();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // --- Édition / suppression ------------------------------------------------
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAssignees, setEditAssignees] = useState<string[]>([]);
  const [editLead, setEditLead] = useState(7);

  function startEdit(task: TaskItemData) {
    setEditingId(task.id);
    setEditAssignees(task.assigneeIds);
    setEditLead(task.leadTimeDays);
  }

  async function saveEdit(taskId: string) {
    setSaving(true);
    try {
      await api(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: { assigneeIds: editAssignees, leadTimeDays: editLead },
      });
      setEditingId(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function deleteTask(taskId: string) {
    if (!confirm("Supprimer cette tâche ?")) return;
    await api(`/api/tasks/${taskId}`, { method: "DELETE" });
    router.refresh();
  }

  async function move(index: number, dir: "up" | "down") {
    const j = dir === "up" ? index - 1 : index + 1;
    if (j < 0 || j >= tasks.length) return;
    const ids = tasks.map((t) => t.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await api(`/api/events/${eventId}/tasks/reorder`, { body: { orderedIds: ids } });
    router.refresh();
  }

  async function toggleSelf(taskId: string) {
    await api(`/api/tasks/${taskId}/assign-me`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Check-list de préparation
        </h2>
        {canManage && !showAdd && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            + Ajouter une tâche
          </Button>
        )}
      </div>

      {canManage && showAdd && (
        <form
          onSubmit={addTask}
          className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          {error && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div>
            <Label htmlFor="task-title">Intitulé de la tâche</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Ex. Réserver les barnums"
            />
          </div>
          <div>
            <Label htmlFor="task-desc">Description (facultatif)</Label>
            <Textarea
              id="task-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <div>
              <Label htmlFor="task-lead">À gérer combien de jours avant ?</Label>
              <Input
                id="task-lead"
                type="number"
                min={0}
                max={365}
                value={leadTime}
                onChange={(e) => setLeadTime(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Membres assignés</Label>
              <MemberCheckboxes
                members={members}
                selected={assignees}
                onToggle={(id) =>
                  setAssignees((prev) =>
                    prev.includes(id)
                      ? prev.filter((x) => x !== id)
                      : [...prev, id],
                  )
                }
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Ajout…" : "Ajouter"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={resetAdd}>
              Annuler
            </Button>
          </div>
        </form>
      )}

      {tasks.length === 0 ? (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-500">
          Aucune tâche pour le moment.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {tasks.map((task, index) => {
            const overdue = task.status !== "done" && isOverdue(task.dueAt);
            const isAssignee = task.assigneeIds.includes(currentUserId);
            const editing = editingId === task.id;
            return (
              <li key={task.id} className="p-4">
                <div className="flex items-start gap-3">
                  {canManage && (
                    <div className="flex shrink-0 flex-col text-slate-400">
                      <button
                        type="button"
                        onClick={() => move(index, "up")}
                        disabled={index === 0}
                        aria-label="Monter la tâche"
                        className="rounded p-0.5 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, "down")}
                        disabled={index === tasks.length - 1}
                        aria-label="Descendre la tâche"
                        className="rounded p-0.5 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{task.title}</p>
                    {task.description && (
                      <p className="mt-0.5 text-sm text-slate-500">
                        {task.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      <span className={overdue ? "font-medium text-red-600" : ""}>
                        Échéance {formatShortDate(task.dueAt)}
                      </span>{" "}
                      · {task.leadTimeDays} j avant l'événement
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {task.assigneeIds.length === 0 ? (
                        <span className="text-xs text-slate-500">
                          Personne assigné·e
                        </span>
                      ) : (
                        task.assigneeIds.map((id) => (
                          <Badge key={id} color="blue">
                            {memberName(id)}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <TaskStatusSelect
                      taskId={task.id}
                      status={task.status}
                      disabled={!canManage && !isAssignee}
                    />
                    <button
                      type="button"
                      onClick={() => toggleSelf(task.id)}
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-medium",
                        isAssignee
                          ? "text-slate-500 hover:text-red-600"
                          : "text-brand-600 hover:text-brand-700",
                      )}
                    >
                      <Hand className="h-3 w-3" />
                      {isAssignee ? "Me retirer" : "Je m'en charge"}
                    </button>
                    {canManage && (
                      <div className="flex gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() =>
                            editing ? setEditingId(null) : startEdit(task)
                          }
                          className="font-medium text-slate-500 hover:text-slate-800"
                        >
                          {editing ? "Fermer" : "Modifier"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTask(task.id)}
                          className="font-medium text-slate-500 hover:text-red-600"
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {canManage && editing && (
                  <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
                    <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                      <div>
                        <Label htmlFor={`lead-${task.id}`}>
                          Jours avant l'événement
                        </Label>
                        <Input
                          id={`lead-${task.id}`}
                          type="number"
                          min={0}
                          max={365}
                          value={editLead}
                          onChange={(e) => setEditLead(Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <Label>Membres assignés</Label>
                        <MemberCheckboxes
                          members={members}
                          selected={editAssignees}
                          onToggle={(id) =>
                            setEditAssignees((prev) =>
                              prev.includes(id)
                                ? prev.filter((x) => x !== id)
                                : [...prev, id],
                            )
                          }
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => saveEdit(task.id)}
                      disabled={saving}
                    >
                      Enregistrer
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
