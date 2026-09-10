ALTER TABLE "meeting_attendance" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_attendance" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "meeting_attendance" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "meeting_attendance" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "meeting_attendance" ADD COLUMN "cancel_token" text;--> statement-breakpoint
ALTER TABLE "meeting_attendance" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_attendance_event_email_unique" ON "meeting_attendance" USING btree ("event_id",lower("email")) WHERE "meeting_attendance"."user_id" is null and "meeting_attendance"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_attendance_cancel_token_idx" ON "meeting_attendance" USING btree ("cancel_token");--> statement-breakpoint
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_identite" CHECK ("meeting_attendance"."user_id" is not null or "meeting_attendance"."name" is not null);