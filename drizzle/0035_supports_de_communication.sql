CREATE TABLE "communication_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"tts_provider" text,
	"encrypted_tts_api_key" text,
	"tts_api_key_last_four" text,
	"tts_voice" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communication_settings_singleton_check" CHECK ("communication_settings"."id" = 'default'),
	CONSTRAINT "communication_settings_tts_provider_check" CHECK ("communication_settings"."tts_provider" is null or "communication_settings"."tts_provider" in ('openai', 'elevenlabs'))
);
--> statement-breakpoint
CREATE TABLE "communication_supports" (
	"kind" text PRIMARY KEY NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communication_settings" ADD CONSTRAINT "communication_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_supports" ADD CONSTRAINT "communication_supports_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;