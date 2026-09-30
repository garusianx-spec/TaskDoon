-- Agile tracking: row-level security for the worklog and dependency tables (see 0005 for the
-- conventions). Both are plain tenant tables; taskin_app already has its grants through the
-- default privileges of 0000, and the platform-admin role is given nothing here.
ALTER TABLE task_worklogs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE task_worklogs FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY task_worklogs_tenant ON task_worklogs
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE task_dependencies FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY task_dependencies_tenant ON task_dependencies
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));
