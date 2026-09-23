CREATE TABLE "rate_limits" (
	"bucket" text NOT NULL,
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_bucket_key_window_start_pk" PRIMARY KEY("bucket","key","window_start")
);
--> statement-breakpoint
CREATE TABLE "revoked_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "revoked_sessions" ADD CONSTRAINT "revoked_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rate_limits_expires_idx" ON "rate_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "revoked_sessions_expires_idx" ON "revoked_sessions" USING btree ("expires_at");--> statement-breakpoint
-- Les clients déjà servis reçoivent la date de leur dernier usage connu.
--
-- La colonne naît vide, et vide veut désormais dire « jamais utilisé » : le
-- cron efface ces clients-là un jour après leur création. Sans cette ligne,
-- le premier passage effacerait aussi le connecteur Claude d'une association
-- qui s'en sert tous les jours, et ses jetons avec lui.
UPDATE "oauth_clients" AS c
SET "last_used_at" = GREATEST(
  (SELECT max(t."created_at") FROM "oauth_tokens" t WHERE t."oauth_client_id" = c."id"),
  (SELECT max(a."created_at") FROM "oauth_authorization_codes" a WHERE a."oauth_client_id" = c."id")
)
WHERE c."last_used_at" IS NULL;
