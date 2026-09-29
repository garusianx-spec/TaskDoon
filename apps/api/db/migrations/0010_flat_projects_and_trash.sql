ALTER TABLE "projects" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_deleted_by_fk" FOREIGN KEY ("workspace_id","deleted_by") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_trash_idx" ON "projects" USING btree ("deleted_at") WHERE "projects"."deleted_at" is not null;--> statement-breakpoint
-- Phase 3.1: projects are flat. Sub-projects become top-level projects of their own (their
-- tasks, boards and members are untouched); the column stays until a later release drops it.
-- Runs as taskin_migrator (BYPASSRLS). Moving a project up is not an edit: keep updated_at.
ALTER TABLE projects DISABLE TRIGGER projects_touch;--> statement-breakpoint
UPDATE projects SET parent_id = NULL WHERE parent_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE projects ENABLE TRIGGER projects_touch;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_flat" CHECK ("projects"."parent_id" is null);