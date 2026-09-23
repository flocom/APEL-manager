CREATE TABLE "account_request_drops" (
	"hour" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "account_request_drops_hour_reason_pk" PRIMARY KEY("hour","reason")
);
--> statement-breakpoint
ALTER TABLE "account_requests" ADD COLUMN "ip_address" text;--> statement-breakpoint
CREATE INDEX "account_requests_ip_idx" ON "account_requests" USING btree ("ip_address","created_at");