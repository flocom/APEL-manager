CREATE TYPE "public"."accounting_category_type" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."accounting_entry_status" AS ENUM('draft', 'posted');--> statement-breakpoint
CREATE TYPE "public"."accounting_entry_type" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."association_document_status" AS ENUM('draft', 'final', 'archived');--> statement-breakpoint
CREATE TYPE "public"."association_document_type" AS ENUM('ag_minutes', 'attestation', 'other');--> statement-breakpoint
CREATE TYPE "public"."association_member_status" AS ENUM('active', 'pending', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."financial_account_type" AS ENUM('bank', 'cash');--> statement-breakpoint
CREATE TYPE "public"."oauth_token_type" AS ENUM('access', 'refresh');--> statement-breakpoint
CREATE TYPE "public"."outbound_mail_provider" AS ENUM('resend');--> statement-breakpoint
CREATE TYPE "public"."outbound_mail_test_status" AS ENUM('untested', 'success', 'failed');--> statement-breakpoint
CREATE TABLE "accounting_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "accounting_category_type" NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "accounting_entry_type" NOT NULL,
	"status" "accounting_entry_status" DEFAULT 'draft' NOT NULL,
	"account_id" uuid,
	"category_id" uuid,
	"label" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"counterparty" text,
	"payment_method" text,
	"reference" text,
	"notes" text,
	"attachment_url" text,
	"created_by" uuid,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounting_entries_amount_cents_check" CHECK ("accounting_entries"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "association_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "association_document_type" NOT NULL,
	"status" "association_document_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"document_date" timestamp with time zone NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"member_id" uuid,
	"file_url" text,
	"created_by" uuid,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "association_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"address_line_1" text,
	"address_line_2" text,
	"postal_code" text,
	"city" text,
	"country" text DEFAULT 'France' NOT NULL,
	"status" "association_member_status" DEFAULT 'pending' NOT NULL,
	"school_year" text NOT NULL,
	"membership_fee_cents" integer DEFAULT 0 NOT NULL,
	"fee_paid_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "association_members_membership_fee_cents_check" CHECK ("association_members"."membership_fee_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"oauth_client_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"source" text DEFAULT 'web' NOT NULL,
	"ip_address" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "financial_account_type" NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_authorization_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"oauth_client_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text DEFAULT 'S256' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"client_secret_hash" text,
	"redirect_uris" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"token_endpoint_auth_method" text DEFAULT 'none' NOT NULL,
	"grant_types" jsonb DEFAULT '["authorization_code","refresh_token"]'::jsonb NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"type" "oauth_token_type" NOT NULL,
	"oauth_client_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"authorization_code_id" uuid,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_mail_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"provider" "outbound_mail_provider" DEFAULT 'resend' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"from_name" text,
	"from_email" text,
	"reply_to" text,
	"domain" text,
	"encrypted_api_key" text,
	"key_last_four" text,
	"last_tested_at" timestamp with time zone,
	"last_test_status" "outbound_mail_test_status" DEFAULT 'untested' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_mail_settings_singleton_check" CHECK ("outbound_mail_settings"."id" = 'default')
);
--> statement-breakpoint
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_category_id_accounting_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."accounting_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_entries" ADD CONSTRAINT "accounting_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "association_documents" ADD CONSTRAINT "association_documents_member_id_association_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."association_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "association_documents" ADD CONSTRAINT "association_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "association_members" ADD CONSTRAINT "association_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_oauth_client_id_oauth_clients_id_fk" FOREIGN KEY ("oauth_client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_oauth_client_id_oauth_clients_id_fk" FOREIGN KEY ("oauth_client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_oauth_client_id_oauth_clients_id_fk" FOREIGN KEY ("oauth_client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_authorization_code_id_oauth_authorization_codes_id_fk" FOREIGN KEY ("authorization_code_id") REFERENCES "public"."oauth_authorization_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_mail_settings" ADD CONSTRAINT "outbound_mail_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounting_categories_type_active_idx" ON "accounting_categories" USING btree ("type","is_active");--> statement-breakpoint
CREATE INDEX "accounting_entries_occurred_at_idx" ON "accounting_entries" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "accounting_entries_status_occurred_at_idx" ON "accounting_entries" USING btree ("status","occurred_at");--> statement-breakpoint
CREATE INDEX "accounting_entries_account_idx" ON "accounting_entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "accounting_entries_category_idx" ON "accounting_entries" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "association_documents_type_status_date_idx" ON "association_documents" USING btree ("type","status","document_date");--> statement-breakpoint
CREATE INDEX "association_documents_member_idx" ON "association_documents" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "association_members_user_idx" ON "association_members" USING btree ("user_id") WHERE "association_members"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "association_members_status_school_year_idx" ON "association_members" USING btree ("status","school_year");--> statement-breakpoint
CREATE INDEX "association_members_name_idx" ON "association_members" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_client_created_idx" ON "audit_logs" USING btree ("oauth_client_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "financial_accounts_type_active_idx" ON "financial_accounts" USING btree ("type","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_authorization_codes_code_hash_idx" ON "oauth_authorization_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "oauth_authorization_codes_client_expires_idx" ON "oauth_authorization_codes" USING btree ("oauth_client_id","expires_at");--> statement-breakpoint
CREATE INDEX "oauth_authorization_codes_user_idx" ON "oauth_authorization_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_clients_client_id_idx" ON "oauth_clients" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_clients_enabled_idx" ON "oauth_clients" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_tokens_token_hash_idx" ON "oauth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "oauth_tokens_client_type_expires_idx" ON "oauth_tokens" USING btree ("oauth_client_id","type","expires_at");--> statement-breakpoint
CREATE INDEX "oauth_tokens_user_idx" ON "oauth_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_tokens_authorization_code_idx" ON "oauth_tokens" USING btree ("authorization_code_id");