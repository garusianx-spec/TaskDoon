DROP INDEX "note_categories_label_uq";--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "category_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "note_categories" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "note_categories_label_uq" ON "note_categories" USING btree ("workspace_id","owner_id",lower("label")) WHERE "note_categories"."deleted_at" is null;