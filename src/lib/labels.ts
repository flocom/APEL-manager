import type { EventStatus, TaskStatus } from "@/lib/db/schema";

type BadgeColor = "slate" | "green" | "amber" | "red" | "blue";

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Brouillon",
  published: "Publié",
  archived: "Archivé",
};

export const EVENT_STATUS_COLORS: Record<EventStatus, BadgeColor> = {
  draft: "amber",
  published: "green",
  archived: "slate",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  done: "Terminé",
};
