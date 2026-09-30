-- M2: row-level security, triggers and foreign keys the TypeScript schema cannot express, plus
-- the default workflow for workspaces created before M2. See 0002 for the conventions.

-- ---------------------------------------------------------------- composite SET NULL (PostgreSQL 15+)
-- A plain ON DELETE SET NULL on a composite key would null workspace_id as well; the column list
-- nulls only the reference.
ALTER TABLE projects ADD CONSTRAINT projects_department_fk
  FOREIGN KEY (workspace_id, department_id) REFERENCES departments (workspace_id, id)
  ON DELETE SET NULL (department_id);--> statement-breakpoint
ALTER TABLE tasks ADD CONSTRAINT tasks_source_note_fk
  FOREIGN KEY (workspace_id, source_note_id) REFERENCES notes (workspace_id, id)
  ON DELETE SET NULL (source_note_id);--> statement-breakpoint

-- ---------------------------------------------------------------- plain tenant tables
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE workflows FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY workflows_tenant ON workflows
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE board_columns ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE board_columns FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY board_columns_tenant ON board_columns
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE projects FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY projects_tenant ON projects
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE project_members FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY project_members_tenant ON project_members
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE project_stars ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE project_stars FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY project_stars_tenant ON project_stars
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tasks_tenant ON tasks
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE task_assignees FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY task_assignees_tenant ON task_assignees
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE task_stars ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE task_stars FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY task_stars_tenant ON task_stars
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE subtasks FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY subtasks_tenant ON subtasks
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE task_comments FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY task_comments_tenant ON task_comments
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE labels ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE labels FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY labels_tenant ON labels
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE task_labels ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE task_labels FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY task_labels_tenant ON task_labels
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE task_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE task_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY task_events_tenant ON task_events
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE attachments FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY attachments_tenant ON attachments
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE task_attachments FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY task_attachments_tenant ON task_attachments
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE calendar_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY calendar_events_tenant ON calendar_events
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE calendar_event_attendees ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE calendar_event_attendees FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY calendar_event_attendees_tenant ON calendar_event_attendees
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE activity_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY activity_events_tenant ON activity_events
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

-- ---------------------------------------------------------------- private to their owner
-- Notes and notebooks are private in v1: the tenant and the owner must both match.
ALTER TABLE note_categories ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE note_categories FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY note_categories_owner ON note_categories
  USING (workspace_id = (SELECT app.current_workspace_id()) AND owner_id = (SELECT app.current_user_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()) AND owner_id = (SELECT app.current_user_id()));--> statement-breakpoint

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE notes FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY notes_owner ON notes
  USING (workspace_id = (SELECT app.current_workspace_id()) AND owner_id = (SELECT app.current_user_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()) AND owner_id = (SELECT app.current_user_id()));--> statement-breakpoint

-- ---------------------------------------------------------------- notifications
-- An inbox spans workspaces: its owner reads it outside any one tenant. The fan-out worker writes
-- rows for other people, inside the workspace the event happened in and with no user set.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY notifications_recipient ON notifications
  USING (recipient_id = (SELECT app.current_user_id()));--> statement-breakpoint
CREATE POLICY notifications_fanout ON notifications
  USING (workspace_id = (SELECT app.current_workspace_id()) AND (SELECT app.current_user_id()) IS NULL)
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()) AND (SELECT app.current_user_id()) IS NULL);--> statement-breakpoint

-- ---------------------------------------------------------------- updated_at
CREATE TRIGGER workflows_touch BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER board_columns_touch BEFORE UPDATE ON board_columns FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER projects_touch BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER tasks_touch BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER subtasks_touch BEFORE UPDATE ON subtasks FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER calendar_events_touch BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER notes_touch BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint

-- ---------------------------------------------------------------- a task's status is its column's
-- The column is the source of truth (RFC §7); the denormalised status can never disagree with it.
CREATE OR REPLACE FUNCTION app.sync_task_status() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT c.status INTO NEW.status
  FROM board_columns c
  WHERE c.workspace_id = NEW.workspace_id AND c.id = NEW.column_id;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER tasks_sync_status
  BEFORE INSERT OR UPDATE OF column_id ON tasks
  FOR EACH ROW EXECUTE FUNCTION app.sync_task_status();--> statement-breakpoint

-- ---------------------------------------------------------------- every board keeps a to-do and a done column
-- Default placement needs a live to-do column and quick-complete a live done column. The API
-- checks first (409 WORKFLOW_CATEGORY_REQUIRED); this deferred trigger makes it impossible to
-- commit a board without them, however the columns were changed.
CREATE OR REPLACE FUNCTION app.check_workflow_categories() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_workflow uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_workflow := OLD.workflow_id; ELSE v_workflow := NEW.workflow_id; END IF;
  -- The whole workflow went (a workspace purge): nothing left to protect.
  IF NOT EXISTS (SELECT 1 FROM workflows w WHERE w.id = v_workflow) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM board_columns c WHERE c.workflow_id = v_workflow AND c.deleted_at IS NULL AND c.status = 'todo')
     OR NOT EXISTS (SELECT 1 FROM board_columns c WHERE c.workflow_id = v_workflow AND c.deleted_at IS NULL AND c.status = 'done') THEN
    RAISE EXCEPTION 'a workflow needs a live to-do column and a live done column'
      USING ERRCODE = 'TK002', HINT = 'workflow_category_required';
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER board_columns_categories
  AFTER INSERT OR UPDATE OR DELETE ON board_columns
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.check_workflow_categories();--> statement-breakpoint

-- ---------------------------------------------------------------- backfill: workspaces made before M2
-- Runs as taskin_migrator (BYPASSRLS). New workspaces get the same four columns from the API seed.
WITH created AS (
  INSERT INTO workflows (workspace_id, name, is_default)
  SELECT w.id, 'پیش‌فرض', true FROM workspaces w
  WHERE NOT EXISTS (SELECT 1 FROM workflows f WHERE f.workspace_id = w.id AND f.is_default)
  RETURNING id, workspace_id
)
INSERT INTO board_columns (workspace_id, workflow_id, title, status, is_builtin, position)
SELECT c.workspace_id, c.id, b.title, b.status::task_status, true, b.position
FROM created c
CROSS JOIN (VALUES
  ('برای انجام', 'todo', 'a0'),
  ('در حال انجام', 'in-progress', 'a1'),
  ('منتظر تایید', 'review', 'a2'),
  ('انجام شد', 'done', 'a3')
) AS b (title, status, position);

-- ---------------------------------------------------------------- file garbage collection
-- Uploads never completed within a day, and files no task links to after a day. Cross-tenant
-- like the purge job's lookup: ids only, as taskin_migrator.
CREATE OR REPLACE FUNCTION app.attachments_due_for_gc(p_limit integer)
RETURNS TABLE (workspace_id uuid, attachment_id uuid, reason text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  (SELECT a.workspace_id, a.id, 'stale_upload' FROM public.attachments a
   WHERE a.status = 'pending' AND a.created_at < now() - interval '24 hours'
   ORDER BY a.created_at LIMIT p_limit)
  UNION ALL
  (SELECT a.workspace_id, a.id, 'unlinked' FROM public.attachments a
   WHERE a.status IN ('scanning', 'ready', 'rejected') AND a.deleted_at IS NULL
     AND a.created_at < now() - interval '24 hours'
     AND NOT EXISTS (SELECT 1 FROM public.task_attachments ta WHERE ta.attachment_id = a.id)
   ORDER BY a.created_at LIMIT p_limit)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.attachments_due_for_gc(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.attachments_due_for_gc(integer) TO taskin_app;--> statement-breakpoint

-- ---------------------------------------------------------------- search
-- Trigram search as the table owner. Under row-level security PostgreSQL keeps an operator that
-- is not leakproof (LIKE among them) out of index conditions, so as taskin_app the trigram
-- indexes could narrow a search by workspace only. These lookups return ids, and only from the
-- caller's own workspace (and, for notes, the caller's own notes) as the transaction's settings
-- name them; EXECUTE plans each call with its pattern, so a selective pattern uses the index.
CREATE OR REPLACE FUNCTION app.search_task_ids(p_pattern text)
RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_workspace uuid := app.current_workspace_id();
BEGIN
  IF v_workspace IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY EXECUTE
    'SELECT t.id FROM public.tasks t WHERE t.workspace_id = $1 AND t.deleted_at IS NULL AND t.search_text LIKE $2'
    USING v_workspace, p_pattern;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.search_task_ids(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.search_task_ids(text) TO taskin_app;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.search_note_ids(p_pattern text)
RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_workspace uuid := app.current_workspace_id();
  v_user uuid := app.current_user_id();
BEGIN
  IF v_workspace IS NULL OR v_user IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY EXECUTE
    'SELECT n.id FROM public.notes n WHERE n.workspace_id = $1 AND n.owner_id = $2 AND n.search_text LIKE $3'
    USING v_workspace, v_user, p_pattern;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.search_note_ids(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.search_note_ids(text) TO taskin_app;
