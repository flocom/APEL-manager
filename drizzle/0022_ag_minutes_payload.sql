ALTER TABLE "association_documents" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "association_documents" ADD COLUMN "content_source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "association_documents" ADD COLUMN "signed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "association_settings" ADD COLUMN "statutory_rules" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "association_documents" ADD CONSTRAINT "association_documents_content_source_check" CHECK ("association_documents"."content_source" in ('manual','payload'));