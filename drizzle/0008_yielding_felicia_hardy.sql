CREATE TYPE "public"."task_lead_time_unit" AS ENUM('days', 'weeks', 'months');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "lead_time_value" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "lead_time_unit" "task_lead_time_unit" DEFAULT 'days' NOT NULL;--> statement-breakpoint
UPDATE "tasks" SET "lead_time_value" = "lead_time_days";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_time_value_check" CHECK ("tasks"."lead_time_value" >= 0);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_time_consistency_check" CHECK ("tasks"."lead_time_days" = "tasks"."lead_time_value" * case "tasks"."lead_time_unit" when 'days' then 1 when 'weeks' then 7 when 'months' then 30 end);
