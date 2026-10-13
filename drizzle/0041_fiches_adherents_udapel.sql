CREATE TABLE "member_update_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"sent_to" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "association_members" ADD COLUMN "civility" text;--> statement-breakpoint
ALTER TABLE "association_members" ADD COLUMN "street_number" text;--> statement-breakpoint
ALTER TABLE "association_members" ADD COLUMN "locality" text;--> statement-breakpoint
ALTER TABLE "association_members" ADD COLUMN "national_fee_elsewhere" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "association_members" ADD COLUMN "other_school_name" text;--> statement-breakpoint
ALTER TABLE "member_update_requests" ADD CONSTRAINT "member_update_requests_member_id_association_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."association_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_update_requests" ADD CONSTRAINT "member_update_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_update_requests_token_idx" ON "member_update_requests" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "member_update_requests_member_idx" ON "member_update_requests" USING btree ("member_id","created_at");--> statement-breakpoint
ALTER TABLE "association_members" ADD CONSTRAINT "association_members_civility_check" CHECK ("association_members"."civility" is null or "association_members"."civility" in ('M', 'Mme', 'Mrme'));