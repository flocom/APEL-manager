CREATE TABLE "accounting_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_url" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"label" text,
	"amount_cents" integer,
	"receipt_date" timestamp with time zone,
	"uploaded_by" uuid,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_receipts_file_url_unique" UNIQUE("file_url"),
	CONSTRAINT "accounting_receipts_amount_cents_check" CHECK ("accounting_receipts"."amount_cents" is null or "accounting_receipts"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "accounting_receipts" ADD CONSTRAINT "accounting_receipts_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounting_receipts_created_at_idx" ON "accounting_receipts" USING btree ("created_at");