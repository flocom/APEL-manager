"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/client";
import type { TaskStatus } from "@/lib/db/schema";
import { TASK_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

export function TaskStatusSelect({
  taskId,
  status,
  disabled = false,
}: {
  taskId: string;
  status: TaskStatus;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<TaskStatus>(status);
  const [saving, setSaving] = useState(false);

  async function onChange(next: TaskStatus) {
    const previous = value;
    setValue(next);
    setSaving(true);
    try {
      await api(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: { status: next },
      });
      router.refresh();
    } catch {
      setValue(previous);
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={value}
      disabled={disabled || saving}
      onChange={(e) => onChange(e.target.value as TaskStatus)}
      className={cn(
        "rounded-md border px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60",
        value === "done"
          ? "border-green-200 bg-green-50 text-green-700"
          : value === "in_progress"
            ? "border-brand-200 bg-brand-50 text-brand-700"
            : "border-slate-300 bg-white text-slate-600",
      )}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {TASK_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
