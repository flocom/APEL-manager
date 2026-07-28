import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
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

export const taskLeadTimeUnitEnum = pgEnum("task_lead_time_unit", [
  "days",
  "weeks",
  "months",
]);

export const associationMemberStatusEnum = pgEnum(
  "association_member_status",
  ["active", "pending", "inactive"],
);

export const financialAccountTypeEnum = pgEnum("financial_account_type", [
  "bank",
  "cash",
]);

export const accountingCategoryTypeEnum = pgEnum(
  "accounting_category_type",
  ["income", "expense"],
);

export const accountingEntryTypeEnum = pgEnum("accounting_entry_type", [
  "income",
  "expense",
]);

export const accountingEntryStatusEnum = pgEnum("accounting_entry_status", [
  "draft",
  "posted",
]);

export const associationDocumentTypeEnum = pgEnum(
  "association_document_type",
  ["ag_minutes", "attestation", "other"],
);

export const associationDocumentStatusEnum = pgEnum(
  "association_document_status",
  ["draft", "final", "archived"],
);

export const outboundMailProviderEnum = pgEnum("outbound_mail_provider", [
  "resend",
  "smtp",
]);

export const outboundMailTestStatusEnum = pgEnum(
  "outbound_mail_test_status",
  ["untested", "success", "failed"],
);

export const oauthTokenTypeEnum = pgEnum("oauth_token_type", [
  "access",
  "refresh",
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
  /** Incrémenté à chaque changement de mot de passe pour invalider les sessions émises avant. */
  sessionEpoch: integer("session_epoch").notNull().default(0),
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
  /** Compteur d'édition (verrou optimiste : rejette les écritures concurrentes périmées). */
  version: integer("version").notNull().default(0),
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
    /** Durée canonique en jours, utilisée par les tris, rappels et recalculs. */
    leadTimeDays: integer("lead_time_days").notNull().default(7),
    /** Valeur et unité choisies par l'utilisateur, conservées pour l'affichage. */
    leadTimeValue: integer("lead_time_value").notNull().default(7),
    leadTimeUnit: taskLeadTimeUnitEnum("lead_time_unit")
      .notNull()
      .default("days"),
    /** Date de début de traitement calculée = événement - durée d'anticipation. */
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    status: taskStatusEnum("status").notNull().default("todo"),
    /** Ordre d'affichage dans la check-list (réordonnable). */
    position: integer("position").notNull().default(0),
    /** Compteur d'édition (verrou optimiste). */
    version: integer("version").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    eventIdx: index("tasks_event_idx").on(t.eventId),
    statusDueIdx: index("tasks_status_due_idx").on(t.status, t.dueAt),
    leadTimeValueCheck: check(
      "tasks_lead_time_value_check",
      sql`${t.leadTimeValue} >= 0`,
    ),
    leadTimeConsistencyCheck: check(
      "tasks_lead_time_consistency_check",
      sql`${t.leadTimeDays} = ${t.leadTimeValue} * case ${t.leadTimeUnit} when 'days' then 1 when 'weeks' then 7 when 'months' then 30 end`,
    ),
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
    /** Jeton de désinscription autonome (lien public dans l'e-mail de confirmation). */
    cancelToken: text("cancel_token"),
    /** Horodatage du rappel J-1 envoyé au bénévole (anti-doublon). */
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    slotIdx: index("volunteer_signups_slot_idx").on(t.slotId),
    userIdx: index("volunteer_signups_user_idx").on(t.userId),
    cancelTokenIdx: uniqueIndex("volunteer_signups_cancel_token_idx").on(
      t.cancelToken,
    ),
    // Anti-doublon : un même e-mail ne peut s'inscrire qu'une fois par créneau.
    slotEmailIdx: uniqueIndex("volunteer_signups_slot_email_idx")
      .on(t.slotId, sql`lower(${t.email})`)
      .where(sql`${t.email} is not null`),
  }),
);

/** Jetons de réinitialisation de mot de passe (à usage unique, expirables). */
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
  /** Liste de tâches avec durée canonique et unité d'affichage. */
  tasks: jsonb("tasks")
    .$type<
      {
        title: string;
        leadTimeDays: number;
        leadTimeValue?: number;
        leadTimeUnit?: "days" | "weeks" | "months";
        description?: string;
      }[]
    >()
    .notNull()
    .default(sql`'[]'::jsonb`),
  /** Compteur d'édition (verrou optimiste). */
  version: integer("version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Adhérent de l'association, distinct d'un compte applicatif. */
export const associationMembers = pgTable(
  "association_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Liaison facultative vers le compte utilisé pour se connecter. */
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    postalCode: text("postal_code"),
    city: text("city"),
    country: text("country").notNull().default("France"),
    status: associationMemberStatusEnum("status")
      .notNull()
      .default("pending"),
    /** Année scolaire au format 2026-2027. */
    schoolYear: text("school_year").notNull(),
    membershipFeeCents: integer("membership_fee_cents").notNull().default(0),
    feePaidAt: timestamp("fee_paid_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: text("notes"),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: uniqueIndex("association_members_user_idx")
      .on(t.userId)
      .where(sql`${t.userId} is not null`),
    statusSchoolYearIdx: index(
      "association_members_status_school_year_idx",
    ).on(t.status, t.schoolYear),
    nameIdx: index("association_members_name_idx").on(t.lastName, t.firstName),
    feeCheck: check(
      "association_members_membership_fee_cents_check",
      sql`${t.membershipFeeCents} >= 0`,
    ),
  }),
);

/** Compte de trésorerie réel : compte bancaire ou caisse. */
export const financialAccounts = pgTable(
  "financial_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    type: financialAccountTypeEnum("type").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    typeActiveIdx: index("financial_accounts_type_active_idx").on(
      t.type,
      t.isActive,
    ),
  }),
);

/** Catégorie analytique de recette ou de dépense. */
export const accountingCategories = pgTable(
  "accounting_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    type: accountingCategoryTypeEnum("type").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    typeActiveIdx: index("accounting_categories_type_active_idx").on(
      t.type,
      t.isActive,
    ),
  }),
);

/** Mouvement de trésorerie. Les montants sont toujours stockés en centimes. */
export const accountingEntries = pgTable(
  "accounting_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: accountingEntryTypeEnum("type").notNull(),
    status: accountingEntryStatusEnum("status").notNull().default("draft"),
    accountId: uuid("account_id").references(() => financialAccounts.id, {
      onDelete: "set null",
    }),
    categoryId: uuid("category_id").references(() => accountingCategories.id, {
      onDelete: "set null",
    }),
    label: text("label").notNull(),
    amountCents: integer("amount_cents").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    counterparty: text("counterparty"),
    paymentMethod: text("payment_method"),
    reference: text("reference"),
    notes: text("notes"),
    attachmentUrl: text("attachment_url"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    occurredAtIdx: index("accounting_entries_occurred_at_idx").on(
      t.occurredAt,
    ),
    statusOccurredAtIdx: index(
      "accounting_entries_status_occurred_at_idx",
    ).on(t.status, t.occurredAt),
    accountIdx: index("accounting_entries_account_idx").on(t.accountId),
    categoryIdx: index("accounting_entries_category_idx").on(t.categoryId),
    amountCheck: check(
      "accounting_entries_amount_cents_check",
      sql`${t.amountCents} > 0`,
    ),
  }),
);

/** PV d'AG, attestation ou document libre de l'association. */
export const associationDocuments = pgTable(
  "association_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: associationDocumentTypeEnum("type").notNull(),
    status: associationDocumentStatusEnum("status")
      .notNull()
      .default("draft"),
    title: text("title").notNull(),
    documentDate: timestamp("document_date", { withTimezone: true }).notNull(),
    content: text("content").notNull().default(""),
    memberId: uuid("member_id").references(() => associationMembers.id, {
      onDelete: "set null",
    }),
    fileUrl: text("file_url"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    typeStatusDateIdx: index(
      "association_documents_type_status_date_idx",
    ).on(t.type, t.status, t.documentDate),
    memberIdx: index("association_documents_member_idx").on(t.memberId),
  }),
);

/** Réglages métier modifiables sans reconstruire ni redémarrer l'application. */
export const associationSettings = pgTable(
  "association_settings",
  {
    id: text("id").primaryKey().default("default"),
    associationName: text("association_name")
      .notNull()
      .default("APEL Manager"),
    schoolName: text("school_name")
      .notNull()
      .default("Votre établissement"),
    contactEmail: text("contact_email"),
    rna: text("rna").notNull().default(""),
    taskReminderWindowDays: integer("task_reminder_window_days")
      .notNull()
      .default(3),
    volunteerReminderWindowDays: integer("volunteer_reminder_window_days")
      .notNull()
      .default(2),
    telegramEnabled: boolean("telegram_enabled").notNull().default(false),
    /** Token du bot chiffré ; jamais exposé par une API de lecture. */
    encryptedTelegramBotToken: text("encrypted_telegram_bot_token"),
    telegramTokenLastFour: text("telegram_token_last_four"),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    singletonCheck: check(
      "association_settings_singleton_check",
      sql`${t.id} = 'default'`,
    ),
    taskReminderWindowCheck: check(
      "association_settings_task_reminder_window_check",
      sql`${t.taskReminderWindowDays} >= 0 and ${t.taskReminderWindowDays} <= 30`,
    ),
    volunteerReminderWindowCheck: check(
      "association_settings_volunteer_reminder_window_check",
      sql`${t.volunteerReminderWindowDays} >= 0 and ${t.volunteerReminderWindowDays} <= 30`,
    ),
  }),
);

/** Configuration unique du fournisseur de courrier sortant. */
export const outboundMailSettings = pgTable(
  "outbound_mail_settings",
  {
    id: text("id").primaryKey().default("default"),
    provider: outboundMailProviderEnum("provider").notNull().default("resend"),
    enabled: boolean("enabled").notNull().default(false),
    fromName: text("from_name"),
    fromEmail: text("from_email"),
    replyTo: text("reply_to"),
    domain: text("domain"),
    /** Secret chiffré côté application ; jamais exposé par une API de lecture. */
    encryptedApiKey: text("encrypted_api_key"),
    keyLastFour: text("key_last_four"),
    smtpHost: text("smtp_host"),
    smtpPort: integer("smtp_port"),
    smtpSecure: boolean("smtp_secure").notNull().default(false),
    smtpUsername: text("smtp_username"),
    /** Mot de passe SMTP chiffré ; jamais exposé par une API de lecture. */
    encryptedSmtpPassword: text("encrypted_smtp_password"),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestStatus: outboundMailTestStatusEnum("last_test_status")
      .notNull()
      .default("untested"),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    singletonCheck: check(
      "outbound_mail_settings_singleton_check",
      sql`${t.id} = 'default'`,
    ),
    smtpPortCheck: check(
      "outbound_mail_settings_smtp_port_check",
      sql`${t.smtpPort} is null or (${t.smtpPort} >= 1 and ${t.smtpPort} <= 65535)`,
    ),
  }),
);

/** Client OAuth autorisé à utiliser le serveur MCP. */
export const oauthClients = pgTable(
  "oauth_clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Identifiant public retourné au client OAuth. */
    clientId: text("client_id").notNull(),
    name: text("name").notNull(),
    clientSecretHash: text("client_secret_hash"),
    redirectUris: jsonb("redirect_uris")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method")
      .notNull()
      .default("none"),
    grantTypes: jsonb("grant_types")
      .$type<string[]>()
      .notNull()
      .default(sql`'["authorization_code","refresh_token"]'::jsonb`),
    scopes: jsonb("scopes")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    clientIdIdx: uniqueIndex("oauth_clients_client_id_idx").on(t.clientId),
    enabledIdx: index("oauth_clients_enabled_idx").on(t.enabled),
  }),
);

/** Code OAuth à usage unique, stocké uniquement sous forme de hash. */
export const oauthAuthorizationCodes = pgTable(
  "oauth_authorization_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    codeHash: text("code_hash").notNull(),
    oauthClientId: uuid("oauth_client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    scopes: jsonb("scopes")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    codeChallenge: text("code_challenge").notNull(),
    codeChallengeMethod: text("code_challenge_method")
      .notNull()
      .default("S256"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    codeHashIdx: uniqueIndex("oauth_authorization_codes_code_hash_idx").on(
      t.codeHash,
    ),
    clientExpiresIdx: index(
      "oauth_authorization_codes_client_expires_idx",
    ).on(t.oauthClientId, t.expiresAt),
    userIdx: index("oauth_authorization_codes_user_idx").on(t.userId),
  }),
);

/** Jeton OAuth d'accès ou de rafraîchissement, stocké sous forme de hash. */
export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenHash: text("token_hash").notNull(),
    type: oauthTokenTypeEnum("type").notNull(),
    oauthClientId: uuid("oauth_client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorizationCodeId: uuid("authorization_code_id").references(
      () => oauthAuthorizationCodes.id,
      { onDelete: "set null" },
    ),
    scopes: jsonb("scopes")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex("oauth_tokens_token_hash_idx").on(t.tokenHash),
    clientTypeExpiresIdx: index("oauth_tokens_client_type_expires_idx").on(
      t.oauthClientId,
      t.type,
      t.expiresAt,
    ),
    userIdx: index("oauth_tokens_user_idx").on(t.userId),
    authorizationCodeIdx: index("oauth_tokens_authorization_code_idx").on(
      t.authorizationCodeId,
    ),
  }),
);

/** Journal transversal des actions sensibles, y compris celles du MCP. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    oauthClientId: uuid("oauth_client_id").references(() => oauthClients.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    source: text("source").notNull().default("web"),
    ipAddress: text("ip_address"),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    entityIdx: index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    actorCreatedIdx: index("audit_logs_actor_created_idx").on(
      t.actorUserId,
      t.createdAt,
    ),
    clientCreatedIdx: index("audit_logs_client_created_idx").on(
      t.oauthClientId,
      t.createdAt,
    ),
    createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// Relations (pour les requêtes db.query.*)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many, one }) => ({
  taskAssignees: many(taskAssignees),
  createdEvents: many(events),
  associationMember: one(associationMembers),
  accountingEntries: many(accountingEntries),
  associationDocuments: many(associationDocuments),
  updatedAssociationSettings: many(associationSettings),
  updatedMailSettings: many(outboundMailSettings),
  oauthClients: many(oauthClients),
  oauthAuthorizationCodes: many(oauthAuthorizationCodes),
  oauthTokens: many(oauthTokens),
  auditLogs: many(auditLogs),
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

export const associationMembersRelations = relations(
  associationMembers,
  ({ one, many }) => ({
    user: one(users, {
      fields: [associationMembers.userId],
      references: [users.id],
    }),
    documents: many(associationDocuments),
  }),
);

export const financialAccountsRelations = relations(
  financialAccounts,
  ({ many }) => ({
    entries: many(accountingEntries),
  }),
);

export const accountingCategoriesRelations = relations(
  accountingCategories,
  ({ many }) => ({
    entries: many(accountingEntries),
  }),
);

export const accountingEntriesRelations = relations(
  accountingEntries,
  ({ one }) => ({
    account: one(financialAccounts, {
      fields: [accountingEntries.accountId],
      references: [financialAccounts.id],
    }),
    category: one(accountingCategories, {
      fields: [accountingEntries.categoryId],
      references: [accountingCategories.id],
    }),
    creator: one(users, {
      fields: [accountingEntries.createdBy],
      references: [users.id],
    }),
  }),
);

export const associationDocumentsRelations = relations(
  associationDocuments,
  ({ one }) => ({
    member: one(associationMembers, {
      fields: [associationDocuments.memberId],
      references: [associationMembers.id],
    }),
    creator: one(users, {
      fields: [associationDocuments.createdBy],
      references: [users.id],
    }),
  }),
);

export const outboundMailSettingsRelations = relations(
  outboundMailSettings,
  ({ one }) => ({
    updater: one(users, {
      fields: [outboundMailSettings.updatedBy],
      references: [users.id],
    }),
  }),
);

export const associationSettingsRelations = relations(
  associationSettings,
  ({ one }) => ({
    updater: one(users, {
      fields: [associationSettings.updatedBy],
      references: [users.id],
    }),
  }),
);

export const oauthClientsRelations = relations(
  oauthClients,
  ({ one, many }) => ({
    creator: one(users, {
      fields: [oauthClients.createdBy],
      references: [users.id],
    }),
    authorizationCodes: many(oauthAuthorizationCodes),
    tokens: many(oauthTokens),
    auditLogs: many(auditLogs),
  }),
);

export const oauthAuthorizationCodesRelations = relations(
  oauthAuthorizationCodes,
  ({ one, many }) => ({
    client: one(oauthClients, {
      fields: [oauthAuthorizationCodes.oauthClientId],
      references: [oauthClients.id],
    }),
    user: one(users, {
      fields: [oauthAuthorizationCodes.userId],
      references: [users.id],
    }),
    tokens: many(oauthTokens),
  }),
);

export const oauthTokensRelations = relations(oauthTokens, ({ one }) => ({
  client: one(oauthClients, {
    fields: [oauthTokens.oauthClientId],
    references: [oauthClients.id],
  }),
  user: one(users, {
    fields: [oauthTokens.userId],
    references: [users.id],
  }),
  authorizationCode: one(oauthAuthorizationCodes, {
    fields: [oauthTokens.authorizationCodeId],
    references: [oauthAuthorizationCodes.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [auditLogs.actorUserId],
    references: [users.id],
  }),
  oauthClient: one(oauthClients, {
    fields: [auditLogs.oauthClientId],
    references: [oauthClients.id],
  }),
}));

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
export type AssociationMember = typeof associationMembers.$inferSelect;
export type NewAssociationMember = typeof associationMembers.$inferInsert;
export type FinancialAccount = typeof financialAccounts.$inferSelect;
export type NewFinancialAccount = typeof financialAccounts.$inferInsert;
export type AccountingCategory = typeof accountingCategories.$inferSelect;
export type NewAccountingCategory = typeof accountingCategories.$inferInsert;
export type AccountingEntry = typeof accountingEntries.$inferSelect;
export type NewAccountingEntry = typeof accountingEntries.$inferInsert;
export type AssociationDocument = typeof associationDocuments.$inferSelect;
export type NewAssociationDocument = typeof associationDocuments.$inferInsert;
export type AssociationSettings = typeof associationSettings.$inferSelect;
export type NewAssociationSettings = typeof associationSettings.$inferInsert;
export type OutboundMailSettings = typeof outboundMailSettings.$inferSelect;
export type NewOutboundMailSettings =
  typeof outboundMailSettings.$inferInsert;
export type OAuthClient = typeof oauthClients.$inferSelect;
export type NewOAuthClient = typeof oauthClients.$inferInsert;
export type OAuthAuthorizationCode =
  typeof oauthAuthorizationCodes.$inferSelect;
export type NewOAuthAuthorizationCode =
  typeof oauthAuthorizationCodes.$inferInsert;
export type OAuthToken = typeof oauthTokens.$inferSelect;
export type NewOAuthToken = typeof oauthTokens.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type Role = (typeof roleEnum.enumValues)[number];
export type EventStatus = (typeof eventStatusEnum.enumValues)[number];
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type AssociationMemberStatus =
  (typeof associationMemberStatusEnum.enumValues)[number];
export type FinancialAccountType =
  (typeof financialAccountTypeEnum.enumValues)[number];
export type AccountingCategoryType =
  (typeof accountingCategoryTypeEnum.enumValues)[number];
export type AccountingEntryType =
  (typeof accountingEntryTypeEnum.enumValues)[number];
export type AccountingEntryStatus =
  (typeof accountingEntryStatusEnum.enumValues)[number];
export type AssociationDocumentType =
  (typeof associationDocumentTypeEnum.enumValues)[number];
export type AssociationDocumentStatus =
  (typeof associationDocumentStatusEnum.enumValues)[number];
export type OutboundMailProvider =
  (typeof outboundMailProviderEnum.enumValues)[number];
export type OutboundMailTestStatus =
  (typeof outboundMailTestStatusEnum.enumValues)[number];
export type OAuthTokenType = (typeof oauthTokenTypeEnum.enumValues)[number];
