ALTER TABLE "association_settings" ADD COLUMN "recaptcha_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "association_settings" ADD COLUMN "recaptcha_site_key" text;--> statement-breakpoint
ALTER TABLE "association_settings" ADD COLUMN "encrypted_recaptcha_secret" text;--> statement-breakpoint
ALTER TABLE "association_settings" ADD COLUMN "recaptcha_min_score" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "association_settings" ADD CONSTRAINT "association_settings_recaptcha_min_score_check" CHECK ("association_settings"."recaptcha_min_score" >= 0 and "association_settings"."recaptcha_min_score" <= 100);