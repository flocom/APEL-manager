CREATE TYPE "public"."ticketing_kind" AS ENUM('billetterie', 'boutique', 'don', 'adhesion', 'paiement');--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ticketing_kind" "ticketing_kind";