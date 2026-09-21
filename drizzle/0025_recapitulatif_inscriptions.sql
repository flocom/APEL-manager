CREATE TYPE "public"."signup_notice_mode" AS ENUM('immediat', 'quotidien', 'aucun');--> statement-breakpoint
ALTER TABLE "association_settings" ADD COLUMN "signup_notice_mode" "signup_notice_mode" DEFAULT 'immediat' NOT NULL;--> statement-breakpoint
ALTER TABLE "association_settings" ADD COLUMN "signup_digest_sent_at" timestamp with time zone;