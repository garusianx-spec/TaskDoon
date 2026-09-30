-- ---------------------------------------------------------------- one workflow per project
-- Every project used its workspace's default workflow, so a column added, renamed or removed on
-- one board changed every board. Each project now gets its own copy of the columns it shows
-- today, deleted ones included, so every task's column and remembered reopen column keep
-- pointing into its own project; its tasks move to the copies. The default workflow stays as
-- it is and no project uses it. New projects get their own four built-in columns from the API.
-- Runs as taskin_migrator (BYPASSRLS).
CREATE TEMP TABLE project_workflow_map AS
  SELECT p.id AS project_id, p.workspace_id, p.workflow_id AS old_workflow_id, uuidv7() AS new_workflow_id, p.key
  FROM projects p;--> statement-breakpoint

INSERT INTO workflows (id, workspace_id, name, is_default, version)
  SELECT m.new_workflow_id, m.workspace_id, m.key, false, 1
  FROM project_workflow_map m;--> statement-breakpoint

CREATE TEMP TABLE project_column_map AS
  SELECT m.project_id, m.new_workflow_id, c.id AS old_column_id, uuidv7() AS new_column_id
  FROM project_workflow_map m
  JOIN board_columns c ON c.workflow_id = m.old_workflow_id;--> statement-breakpoint

INSERT INTO board_columns (id, workspace_id, workflow_id, title, status, tone, is_builtin, position, created_at, updated_at, deleted_at)
  SELECT cm.new_column_id, c.workspace_id, cm.new_workflow_id, c.title, c.status, c.tone, c.is_builtin, c.position, c.created_at, c.updated_at, c.deleted_at
  FROM project_column_map cm
  JOIN board_columns c ON c.id = cm.old_column_id;--> statement-breakpoint

-- Moving a card to its copy is not an edit: keep the tasks' and projects' updated_at.
ALTER TABLE tasks DISABLE TRIGGER tasks_touch;--> statement-breakpoint
ALTER TABLE projects DISABLE TRIGGER projects_touch;--> statement-breakpoint

UPDATE tasks t SET column_id = cm.new_column_id
  FROM project_column_map cm
  WHERE cm.project_id = t.project_id AND cm.old_column_id = t.column_id;--> statement-breakpoint

UPDATE tasks t SET reopen_column_id = cm.new_column_id
  FROM project_column_map cm
  WHERE cm.project_id = t.project_id AND cm.old_column_id = t.reopen_column_id;--> statement-breakpoint

UPDATE projects p SET workflow_id = m.new_workflow_id
  FROM project_workflow_map m
  WHERE m.project_id = p.id;--> statement-breakpoint

ALTER TABLE tasks ENABLE TRIGGER tasks_touch;--> statement-breakpoint
ALTER TABLE projects ENABLE TRIGGER projects_touch;--> statement-breakpoint

DROP TABLE project_column_map;--> statement-breakpoint
DROP TABLE project_workflow_map;
