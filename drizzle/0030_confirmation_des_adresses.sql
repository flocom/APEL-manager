CREATE TABLE "account_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_requests_token_idx" ON "account_requests" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "account_requests_email_idx" ON "account_requests" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "account_requests_created_idx" ON "account_requests" USING btree ("created_at");