import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Niveaux de droits : admin > manager (organisateur) > member (membre). */
export const roleEnum = pgEnum("role", ["admin", "manager", "member"]);

export const eventStatusEnum = pgEnum("event_status", [
  "draft",
  "published",
  "archived",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "done",
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("member"),
  /** Identifiant de chat Telegram, pour recevoir les notifications. */
  telegramChatId: text("telegram_chat_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }),
  status: eventStatusEnum("status").notNull().default("draft"),
  /** Jeton public pour le lien d'inscription des bénévoles. */
  shareToken: text("share_token").notNull().unique(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => ({
  statusStartIdx: index("events_status_start_idx").on(t.status, t.startAt),
}));

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    /** Délai : la tâche doit être gérée X jours avant le début de l'événement. */
    leadTimeDays: integer("lead_time_days").notNull().default(7),
    /** Échéance calculée = start_at - lead_time_days. Stockée pour les requêtes. */
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    status: taskStatusEnum("status").notNull().default("todo"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    eventIdx: index("tasks_event_idx").on(t.eventId),
    statusDueIdx: index("tasks_status_due_idx").on(t.status, t.dueAt),
  }),
);

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.taskId, t.userId] }),
    userIdx: index("task_assignees_user_idx").on(t.userId),
  }),
);

export const volunteerSlots = pgTable(
  "volunteer_slots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    /** Nombre de bénévoles recherchés pour ce créneau. */
    capacity: integer("capacity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    eventIdx: index("volunteer_slots_event_idx").on(t.eventId),
  }),
);

export const volunteerSignups = pgTable(
  "volunteer_signups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => volunteerSlots.id, { onDelete: "cascade" }),
    /** Renseigné si le bénévole est un membre connecté, sinon null (inscription publique). */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    slotIdx: index("volunteer_signups_slot_idx").on(t.slotId),
    userIdx: index("volunteer_signups_user_idx").on(t.userId),
  }),
);

/** Journal des notifications envoyées : évite les doublons (un rappel par tâche/membre/type). */
export const notificationsLog = pgTable(
  "notifications_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "reminder" (bientôt dû) ou "overdue" (en retard). */
    kind: text("kind").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqueNotif: uniqueIndex("notifications_log_task_user_kind_idx").on(
      t.taskId,
      t.userId,
      t.kind,
    ),
  }),
);

/** Modèle de check-list réutilisable, éditable depuis le tableau de bord. */
export const checklistTemplates = pgTable("checklist_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  /** Liste de tâches : { title, leadTimeDays, description? }. */
  tasks: jsonb("tasks")
    .$type<{ title: string; leadTimeDays: number; description?: string }[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations (pour les requêtes db.query.*)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  taskAssignees: many(taskAssignees),
  createdEvents: many(events),
}));

export const eventsRelations = relations(events, ({ many, one }) => ({
  tasks: many(tasks),
  volunteerSlots: many(volunteerSlots),
  creator: one(users, {
    fields: [events.createdBy],
    references: [users.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  event: one(events, {
    fields: [tasks.eventId],
    references: [events.id],
  }),
  assignees: many(taskAssignees),
}));

export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, {
    fields: [taskAssignees.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskAssignees.userId],
    references: [users.id],
  }),
}));

export const volunteerSlotsRelations = relations(
  volunteerSlots,
  ({ one, many }) => ({
    event: one(events, {
      fields: [volunteerSlots.eventId],
      references: [events.id],
    }),
    signups: many(volunteerSignups),
  }),
);

export const volunteerSignupsRelations = relations(
  volunteerSignups,
  ({ one }) => ({
    slot: one(volunteerSlots, {
      fields: [volunteerSignups.slotId],
      references: [volunteerSlots.id],
    }),
    user: one(users, {
      fields: [volunteerSignups.userId],
      references: [users.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// Types inférés
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type VolunteerSlot = typeof volunteerSlots.$inferSelect;
export type VolunteerSignup = typeof volunteerSignups.$inferSelect;
export type ChecklistTemplate = typeof checklistTemplates.$inferSelect;
export type TemplateTask = ChecklistTemplate["tasks"][number];
export type Role = (typeof roleEnum.enumValues)[number];
export type EventStatus = (typeof eventStatusEnum.enumValues)[number];
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
