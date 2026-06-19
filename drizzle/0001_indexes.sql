CREATE INDEX "events_status_start_idx" ON "events" USING btree ("status","start_at");--> statement-breakpoint
CREATE INDEX "task_assignees_user_idx" ON "task_assignees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_event_idx" ON "tasks" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "tasks_status_due_idx" ON "tasks" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "volunteer_signups_slot_idx" ON "volunteer_signups" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "volunteer_signups_user_idx" ON "volunteer_signups" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "volunteer_slots_event_idx" ON "volunteer_slots" USING btree ("event_id");