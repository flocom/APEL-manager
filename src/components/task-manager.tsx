"use client";

import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  EllipsisVertical,
  GripVertical,
  Hand,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { FormattedText } from "@/components/formatted-text";
import { TaskStatusSelect } from "@/components/task-status-select";
import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/client";
import type { TaskStatus } from "@/lib/db/schema";
import {
  computeDueAt,
  formatDateTime,
  formatShortDate,
  isOverdue,
} from "@/lib/dates";
import {
  formatLeadTimeDuration,
  LEAD_TIME_MAX,
  leadTimeToDays,
  type LeadTimeUnit,
} from "@/lib/task-lead-time";
import { useMutationError } from "@/lib/use-mutation-error";
import { cn } from "@/lib/utils";

export interface TaskItemData {
  id: string;
  title: string;
  description: string | null;
  leadTimeDays: number;
  leadTimeValue: number;
  leadTimeUnit: LeadTimeUnit;
  dueAt: string;
  status: TaskStatus;
  assigneeIds: string[];
  version: number;
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
  eventVersion,
  eventStartAt,
  tasks,
  members,
  canManage,
  currentUserId,
}: {
  eventId: string;
  eventVersion: number;
  eventStartAt: string;
  tasks: TaskItemData[];
  members: MemberOption[];
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const onError = useMutationError();
  const memberName = (id: string) =>
    members.find((m) => m.id === id)?.name ?? "Membre";
  const [orderedTasks, setOrderedTasks] = useState(tasks);
  const [orderVersion, setOrderVersion] = useState(eventVersion);
  const [orderSaving, setOrderSaving] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    edge: "before" | "after";
  } | null>(null);
  const [orderAnnouncement, setOrderAnnouncement] = useState("");

  useEffect(() => {
    setOrderedTasks(tasks);
    setOrderVersion(eventVersion);
  }, [eventVersion, tasks]);

  // --- Formulaire d'ajout ---------------------------------------------------
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [leadAmount, setLeadAmount] = useState(1);
  const [leadUnit, setLeadUnit] = useState<LeadTimeUnit>("weeks");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetAdd() {
    setTitle("");
    setDescription("");
    setLeadAmount(1);
    setLeadUnit("weeks");
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
          leadTimeDays: leadTimeToDays(leadAmount, leadUnit),
          leadTimeValue: leadAmount,
          leadTimeUnit: leadUnit,
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
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [editAssignees, setEditAssignees] = useState<string[]>([]);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLeadAmount, setEditLeadAmount] = useState(1);
  const [editLeadUnit, setEditLeadUnit] =
    useState<LeadTimeUnit>("weeks");
  const [editVersion, setEditVersion] = useState(0);

  function startEdit(task: TaskItemData) {
    setEditingId(task.id);
    setActionMenuId(null);
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditAssignees(task.assigneeIds);
    setEditLeadAmount(task.leadTimeValue);
    setEditLeadUnit(task.leadTimeUnit);
    setEditVersion(task.version);
  }

  async function saveEdit(taskId: string) {
    setSaving(true);
    try {
      await api(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: {
          title: editTitle,
          description: editDescription,
          assigneeIds: editAssignees,
          leadTimeDays: leadTimeToDays(editLeadAmount, editLeadUnit),
          leadTimeValue: editLeadAmount,
          leadTimeUnit: editLeadUnit,
          version: editVersion,
        },
      });
      setEditingId(null);
      router.refresh();
    } catch (err) {
      onError(err);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTask(taskId: string) {
    setActionMenuId(null);
    if (!confirm("Supprimer cette tâche ?")) return;
    try {
      await api(`/api/tasks/${taskId}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      onError(err);
    }
  }

  async function persistOrder(
    nextTasks: TaskItemData[],
    movedTask: TaskItemData,
  ) {
    const previousTasks = orderedTasks;
    const nextIndex = nextTasks.findIndex((task) => task.id === movedTask.id);
    setOrderedTasks(nextTasks);
    setOrderSaving(true);
    setOrderAnnouncement("");

    try {
      const response = await api<{ version: number }>(
        `/api/events/${eventId}/tasks/reorder`,
        {
          body: {
            orderedIds: nextTasks.map((task) => task.id),
            version: orderVersion,
          },
        },
      );
      setOrderVersion(response.version);
      setOrderAnnouncement(
        `${movedTask.title} est maintenant en position ${nextIndex + 1} sur ${nextTasks.length}.`,
      );
      router.refresh();
    } catch (err) {
      setOrderedTasks(previousTasks);
      setOrderAnnouncement(
        "La réorganisation a échoué. L’ordre précédent a été restauré.",
      );
      onError(err);
    } finally {
      setOrderSaving(false);
    }
  }

  async function move(index: number, dir: "up" | "down") {
    const j = dir === "up" ? index - 1 : index + 1;
    if (orderSaving || j < 0 || j >= orderedTasks.length) return;
    const nextTasks = [...orderedTasks];
    const movedTask = nextTasks[index];
    if (!movedTask) return;
    [nextTasks[index], nextTasks[j]] = [nextTasks[j], nextTasks[index]];
    await persistOrder(nextTasks, movedTask);
  }

  function startDragging(
    event: React.DragEvent<HTMLButtonElement>,
    taskId: string,
  ) {
    if (orderSaving) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    // Firefox exige une donnée pour initier le glissement.
    event.dataTransfer.setData("text/plain", taskId);
    setDraggedTaskId(taskId);
    setDropTarget(null);
  }

  function targetDuringDrag(
    event: React.DragEvent<HTMLLIElement>,
    targetId: string,
  ) {
    if (!draggedTaskId || draggedTaskId === targetId || orderSaving) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const edge =
      event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    setDropTarget((current) =>
      current?.id === targetId && current.edge === edge
        ? current
        : { id: targetId, edge },
    );
  }

  async function dropTask(
    event: React.DragEvent<HTMLLIElement>,
    targetId: string,
  ) {
    event.preventDefault();
    const sourceId =
      draggedTaskId || event.dataTransfer.getData("text/plain");
    const bounds = event.currentTarget.getBoundingClientRect();
    const fallbackEdge =
      event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    const target =
      dropTarget?.id === targetId
        ? dropTarget
        : { id: targetId, edge: fallbackEdge };
    setDraggedTaskId(null);
    setDropTarget(null);

    if (!sourceId || !target || sourceId === target.id || orderSaving) return;
    const movedTask = orderedTasks.find((task) => task.id === sourceId);
    if (!movedTask) return;

    const nextTasks = orderedTasks.filter((task) => task.id !== sourceId);
    const targetIndex = nextTasks.findIndex((task) => task.id === target.id);
    if (targetIndex < 0) return;
    nextTasks.splice(
      target.edge === "after" ? targetIndex + 1 : targetIndex,
      0,
      movedTask,
    );
    await persistOrder(nextTasks, movedTask);
  }

  async function toggleSelf(taskId: string) {
    try {
      await api(`/api/tasks/${taskId}/assign-me`);
      router.refresh();
    } catch (err) {
      onError(err);
    }
  }

  const completedCount = orderedTasks.filter(
    (task) => task.status === "done",
  ).length;
  const progress =
    orderedTasks.length > 0
      ? Math.round((completedCount / orderedTasks.length) * 100)
      : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Tâches</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {completedCount} terminée{completedCount > 1 ? "s" : ""} sur{" "}
            {orderedTasks.length}
          </p>
        </div>
        {canManage && !showAdd && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            + Ajouter une tâche
          </Button>
        )}
      </div>

      {orderedTasks.length > 0 && (
        <div
          className="h-2 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label="Avancement de la check-list"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span
            className="block h-full rounded-full bg-brand-600 transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

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
          <div className="grid gap-3 sm:grid-cols-[minmax(280px,360px)_1fr]">
            <div>
              <Label htmlFor="task-lead">
                À partir de quand faut-il la traiter ?
              </Label>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(130px,1fr)] gap-2">
                <Input
                  id="task-lead"
                  type="number"
                  min={0}
                  max={LEAD_TIME_MAX[leadUnit]}
                  value={leadAmount}
                  onChange={(e) => setLeadAmount(Number(e.target.value))}
                  required
                  aria-label="Durée avant l'événement"
                />
                <Select
                  value={leadUnit}
                  onChange={(e) => {
                    const unit = e.target.value as LeadTimeUnit;
                    setLeadUnit(unit);
                    setLeadAmount((value) =>
                      Math.min(value, LEAD_TIME_MAX[unit]),
                    );
                  }}
                  aria-label="Unité de durée"
                >
                  <option value="days">jour(s) avant</option>
                  <option value="weeks">semaine(s) avant</option>
                  <option value="months">mois avant</option>
                </Select>
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-brand-700">
                <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Traitement à partir du{" "}
                {formatDateTime(
                  computeDueAt(
                    new Date(eventStartAt),
                    leadTimeToDays(leadAmount, leadUnit),
                  ),
                )}
              </p>
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

      {canManage && orderedTasks.length > 1 && (
        <p className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <GripVertical className="h-4 w-4 text-brand-600" />
          Saisissez la poignée d’une tâche pour la déplacer par glisser-déposer.
        </p>
      )}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {orderAnnouncement}
      </p>

      {orderedTasks.length === 0 ? (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-500">
          Aucune tâche pour le moment.
        </p>
      ) : (
        <ul
          className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white"
          aria-busy={orderSaving}
        >
          {orderedTasks.map((task, index) => {
            const overdue = task.status !== "done" && isOverdue(task.dueAt);
            const isAssignee = task.assigneeIds.includes(currentUserId);
            const editing = editingId === task.id;
            const isDragging = draggedTaskId === task.id;
            const isDropTarget = dropTarget?.id === task.id;
            return (
              <li
                key={task.id}
                onDragOver={
                  canManage
                    ? (event) => targetDuringDrag(event, task.id)
                    : undefined
                }
                onDrop={
                  canManage
                    ? (event) => dropTask(event, task.id)
                    : undefined
                }
                className={cn(
                  "relative p-4 transition-[background-color,opacity]",
                  isDragging && "bg-brand-50/70 opacity-45",
                  isDropTarget && "bg-brand-50/40",
                )}
              >
                {isDropTarget && (
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute left-3 right-3 z-10 h-1 rounded-full bg-brand-600",
                      dropTarget.edge === "before"
                        ? "-top-0.5"
                        : "-bottom-0.5",
                    )}
                  />
                )}
                <div className="flex items-start gap-3">
                  {canManage && (
                    <div className="flex shrink-0 flex-col items-center gap-0.5 text-slate-400">
                      <button
                        type="button"
                        draggable={!orderSaving}
                        onDragStart={(event) =>
                          startDragging(event, task.id)
                        }
                        onDragEnd={() => {
                          setDraggedTaskId(null);
                          setDropTarget(null);
                        }}
                        aria-label={`Déplacer la tâche « ${task.title} » par glisser-déposer`}
                        aria-disabled={orderSaving}
                        title="Glisser pour réorganiser"
                        className="cursor-grab rounded-md p-1 text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-800 active:cursor-grabbing"
                      >
                        <GripVertical className="h-5 w-5" />
                      </button>
                      <div className="flex opacity-50 transition-opacity hover:opacity-100 focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={() => move(index, "up")}
                          disabled={orderSaving || index === 0}
                          aria-label="Monter la tâche"
                          className="rounded p-0.5 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(index, "down")}
                          disabled={
                            orderSaving || index === orderedTasks.length - 1
                          }
                          aria-label="Descendre la tâche"
                          className="rounded p-0.5 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{task.title}</p>
                    {task.description && (
                      <FormattedText
                        text={task.description}
                        className="mt-0.5 text-sm text-slate-500"
                      />
                    )}
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                      <CalendarClock className="h-3.5 w-3.5 text-brand-600" />
                      <span
                        className={
                          overdue ? "font-semibold text-coral-700" : ""
                        }
                      >
                        À démarrer le {formatShortDate(task.dueAt)}
                      </span>
                      <span aria-hidden>·</span>
                      <span>
                        {formatLeadTimeDuration(
                          task.leadTimeValue,
                          task.leadTimeUnit,
                        )}
                      </span>
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
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setActionMenuId((current) =>
                              current === task.id ? null : task.id,
                            )
                          }
                          className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          aria-label={`Actions pour « ${task.title} »`}
                          aria-expanded={actionMenuId === task.id}
                        >
                          <EllipsisVertical className="h-4 w-4" />
                        </button>
                        {actionMenuId === task.id && (
                          <div className="absolute right-0 top-9 z-20 w-36 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                            <button
                              type="button"
                              onClick={() => {
                                if (editing) {
                                  setEditingId(null);
                                  setActionMenuId(null);
                                } else {
                                  startEdit(task);
                                }
                              }}
                              className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              {editing ? "Fermer l’édition" : "Modifier"}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteTask(task.id)}
                              className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-coral-700 hover:bg-coral-50"
                            >
                              Supprimer
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {canManage && editing && (
                  <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor={`title-${task.id}`}>Intitulé</Label>
                        <Input
                          id={`title-${task.id}`}
                          value={editTitle}
                          onChange={(event) =>
                            setEditTitle(event.target.value)
                          }
                          maxLength={200}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor={`description-${task.id}`}>
                          Description (facultatif)
                        </Label>
                        <Textarea
                          id={`description-${task.id}`}
                          value={editDescription}
                          onChange={(event) =>
                            setEditDescription(event.target.value)
                          }
                          rows={2}
                          maxLength={2000}
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[minmax(280px,360px)_1fr]">
                      <div>
                        <Label htmlFor={`lead-${task.id}`}>
                          À partir de quand faut-il la traiter ?
                        </Label>
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(130px,1fr)] gap-2">
                          <Input
                            id={`lead-${task.id}`}
                            type="number"
                            min={0}
                            max={LEAD_TIME_MAX[editLeadUnit]}
                            value={editLeadAmount}
                            onChange={(e) =>
                              setEditLeadAmount(Number(e.target.value))
                            }
                            required
                            aria-label="Durée avant l'événement"
                          />
                          <Select
                            value={editLeadUnit}
                            onChange={(e) => {
                              const unit = e.target.value as LeadTimeUnit;
                              setEditLeadUnit(unit);
                              setEditLeadAmount((value) =>
                                Math.min(value, LEAD_TIME_MAX[unit]),
                              );
                            }}
                            aria-label="Unité de durée"
                          >
                            <option value="days">jour(s) avant</option>
                            <option value="weeks">semaine(s) avant</option>
                            <option value="months">mois avant</option>
                          </Select>
                        </div>
                        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-brand-700">
                          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          Traitement à partir du{" "}
                          {formatDateTime(
                            computeDueAt(
                              new Date(eventStartAt),
                              leadTimeToDays(
                                editLeadAmount,
                                editLeadUnit,
                              ),
                            ),
                          )}
                        </p>
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
                      disabled={saving || !editTitle.trim()}
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
