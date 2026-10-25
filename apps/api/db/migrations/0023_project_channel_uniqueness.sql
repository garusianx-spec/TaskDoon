-- Preserve every duplicate history: oldest row remains the companion; extra histories become private read-only archives.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
WITH ranked AS (
 SELECT id, row_number() OVER (PARTITION BY workspace_id, project_id ORDER BY (membership_mode = 'project_synced' AND kind = 'channel') DESC, created_at, id) AS n
 FROM conversations WHERE project_id IS NOT NULL
)
UPDATE conversations c SET project_id = NULL, archived_at = coalesce(archived_at, now()), membership_mode = 'manual', is_private = true
FROM ranked r WHERE c.id = r.id AND r.n > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_project_uq" ON "conversations" USING btree ("workspace_id","project_id") WHERE "conversations"."project_id" is not null;
