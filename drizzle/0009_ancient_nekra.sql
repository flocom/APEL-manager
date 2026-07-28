ALTER TYPE "public"."outbound_mail_provider" ADD VALUE 'smtp';--> statement-breakpoint
CREATE TABLE "association_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"association_name" text DEFAULT 'APEL Notre Dame des Flots' NOT NULL,
	"school_name" text DEFAULT 'École Notre Dame des Flots' NOT NULL,
	"contact_email" text,
	"rna" text DEFAULT 'W853001441' NOT NULL,
	"task_reminder_window_days" integer DEFAULT 3 NOT NULL,
	"volunteer_reminder_window_days" integer DEFAULT 2 NOT NULL,
	"telegram_enabled" boolean DEFAULT false NOT NULL,
	"encrypted_telegram_bot_token" text,
	"telegram_token_last_four" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "association_settings_singleton_check" CHECK ("association_settings"."id" = 'default'),
	CONSTRAINT "association_settings_task_reminder_window_check" CHECK ("association_settings"."task_reminder_window_days" >= 0 and "association_settings"."task_reminder_window_days" <= 30),
	CONSTRAINT "association_settings_volunteer_reminder_window_check" CHECK ("association_settings"."volunteer_reminder_window_days" >= 0 and "association_settings"."volunteer_reminder_window_days" <= 30)
);
--> statement-breakpoint
ALTER TABLE "outbound_mail_settings" ADD COLUMN "smtp_host" text;--> statement-breakpoint
ALTER TABLE "outbound_mail_settings" ADD COLUMN "smtp_port" integer;--> statement-breakpoint
ALTER TABLE "outbound_mail_settings" ADD COLUMN "smtp_secure" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "outbound_mail_settings" ADD COLUMN "smtp_username" text;--> statement-breakpoint
ALTER TABLE "outbound_mail_settings" ADD COLUMN "encrypted_smtp_password" text;--> statement-breakpoint
ALTER TABLE "association_settings" ADD CONSTRAINT "association_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_mail_settings" ADD CONSTRAINT "outbound_mail_settings_smtp_port_check" CHECK ("outbound_mail_settings"."smtp_port" is null or ("outbound_mail_settings"."smtp_port" >= 1 and "outbound_mail_settings"."smtp_port" <= 65535));