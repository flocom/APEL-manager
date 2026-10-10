CREATE TABLE "helloasso_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"client_id" text,
	"encrypted_client_secret" text,
	"client_secret_last_four" text,
	"verified_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" text,
	"last_sync_error" text,
	"last_sync_summary" jsonb,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "helloasso_settings_singleton_check" CHECK ("helloasso_settings"."id" = 'default'),
	CONSTRAINT "helloasso_settings_last_sync_status_check" CHECK ("helloasso_settings"."last_sync_status" is null or "helloasso_settings"."last_sync_status" in ('success', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "association_members" ADD COLUMN "helloasso_item_id" text;--> statement-breakpoint
ALTER TABLE "association_members" ADD COLUMN "helloasso_order_id" text;--> statement-breakpoint
ALTER TABLE "helloasso_settings" ADD CONSTRAINT "helloasso_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "association_members_helloasso_item_idx" ON "association_members" USING btree ("helloasso_item_id") WHERE "association_members"."helloasso_item_id" is not null;