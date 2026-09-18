CREATE TABLE "membership_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_payments_amount_cents_check" CHECK ("membership_payments"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_entry_id_accounting_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."accounting_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_member_id_association_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."association_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_payments_entry_member_unique" ON "membership_payments" USING btree ("entry_id","member_id");--> statement-breakpoint
CREATE INDEX "membership_payments_entry_idx" ON "membership_payments" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "membership_payments_member_idx" ON "membership_payments" USING btree ("member_id");