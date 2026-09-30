ALTER TABLE "accounting_categories" ADD COLUMN "ledger_code" text;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "opening_balance_cents" integer;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "opening_balance_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "ledger_code" text;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_opening_balance_check" CHECK (("financial_accounts"."opening_balance_cents" is null) = ("financial_accounts"."opening_balance_date" is null));