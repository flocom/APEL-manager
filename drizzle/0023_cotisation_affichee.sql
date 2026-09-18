CREATE TYPE "public"."membership_fee_basis" AS ENUM('famille', 'enfant', 'non_precise');--> statement-breakpoint
ALTER TABLE "association_settings" ADD COLUMN "membership_fee_cents" integer;--> statement-breakpoint
ALTER TABLE "association_settings" ADD COLUMN "membership_fee_basis" "membership_fee_basis" DEFAULT 'non_precise' NOT NULL;--> statement-breakpoint
ALTER TABLE "association_settings" ADD COLUMN "membership_fee_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "association_settings" ADD CONSTRAINT "association_settings_membership_fee_check" CHECK ("association_settings"."membership_fee_cents" is null or "association_settings"."membership_fee_cents" >= 0);