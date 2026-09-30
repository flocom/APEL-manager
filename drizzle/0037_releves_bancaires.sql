CREATE TABLE "bank_statement_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank" text NOT NULL,
	"account_id" uuid,
	"account_number" text NOT NULL,
	"account_label" text,
	"iban" text,
	"statement_date" timestamp with time zone,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"opening_balance_cents" integer NOT NULL,
	"closing_balance_cents" integer NOT NULL,
	"total_debit_cents" integer NOT NULL,
	"total_credit_cents" integer NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text,
	"file_sha256" text NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"linked_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_statement_imports_bank_check" CHECK ("bank_statement_imports"."bank" in ('credit_mutuel'))
);
--> statement-breakpoint
CREATE TABLE "bank_statement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"operation_date" timestamp with time zone NOT NULL,
	"value_date" timestamp with time zone,
	"label" text NOT NULL,
	"details" text,
	"amount_cents" integer NOT NULL,
	"direction" text NOT NULL,
	"decision" text NOT NULL,
	"entry_id" uuid,
	"cash_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_statement_lines_amount_cents_check" CHECK ("bank_statement_lines"."amount_cents" > 0),
	CONSTRAINT "bank_statement_lines_direction_check" CHECK ("bank_statement_lines"."direction" in ('debit', 'credit')),
	CONSTRAINT "bank_statement_lines_decision_check" CHECK ("bank_statement_lines"."decision" in ('imported', 'linked', 'skipped'))
);
--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "bank_account_number" text;--> statement-breakpoint
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_import_id_bank_statement_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."bank_statement_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_entry_id_accounting_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."accounting_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_cash_entry_id_accounting_entries_id_fk" FOREIGN KEY ("cash_entry_id") REFERENCES "public"."accounting_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statement_imports_file_account_idx" ON "bank_statement_imports" USING btree ("file_sha256","account_number");--> statement-breakpoint
CREATE INDEX "bank_statement_imports_account_idx" ON "bank_statement_imports" USING btree ("account_id","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statement_lines_fingerprint_idx" ON "bank_statement_lines" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "bank_statement_lines_import_idx" ON "bank_statement_lines" USING btree ("import_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statement_lines_entry_idx" ON "bank_statement_lines" USING btree ("entry_id") WHERE "bank_statement_lines"."entry_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statement_lines_cash_entry_idx" ON "bank_statement_lines" USING btree ("cash_entry_id") WHERE "bank_statement_lines"."cash_entry_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_accounts_bank_account_number_idx" ON "financial_accounts" USING btree ("bank_account_number") WHERE "financial_accounts"."bank_account_number" is not null;