ALTER TABLE "users" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Les comptes déjà là sont validés d'office, à leur date de création.
--
-- La colonne naît vide, et vide veut désormais dire « en attente » : sans
-- cette ligne, la mise à jour enfermerait dehors tout le bureau, administrateur
-- compris, et plus personne ne pourrait valider qui que ce soit. Ces comptes
-- servaient hier ; les tenir pour validés ne change rien à ce qu'ils voyaient.
UPDATE "users"
SET "approved_at" = "created_at"
WHERE "approved_at" IS NULL;
