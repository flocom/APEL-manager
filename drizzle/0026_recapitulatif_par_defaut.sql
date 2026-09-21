ALTER TABLE "association_settings" ALTER COLUMN "signup_notice_mode" SET DEFAULT 'quotidien';--> statement-breakpoint
-- Alignement unique de la valeur déjà stockée.
--
-- Changer le défaut d'une colonne ne touche que les lignes à venir, et cette
-- table est un singleton : sans cette ligne, l'installation existante resterait
-- sur « immediat » et le nouveau défaut ne servirait jamais à personne.
--
-- On ne peut pas distinguer « a choisi immediat » de « n'a jamais choisi », mais
-- le réglage n'existe que depuis la migration précédente : aucune association
-- n'a encore eu l'occasion d'en décider. Le mode reste visible et modifiable
-- dans Configuration pour qui veut revenir à l'avis à l'unité.
UPDATE "association_settings"
SET "signup_notice_mode" = 'quotidien'
WHERE "signup_notice_mode" = 'immediat';
