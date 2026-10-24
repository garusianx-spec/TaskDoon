-- Additive, tenant-scoped project classifications. Existing primary assignments are read
-- alongside the junction, so deployment does not require a blocking data backfill.
ALTER TABLE project_departments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE project_departments FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY project_departments_tenant ON project_departments
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

-- An invoker trigger keeps writes from older application versions compatible. Only the
-- changed primary is replaced; removing a department must preserve other selections.
-- The new API replaces the full selection explicitly in the same project transaction.
CREATE FUNCTION app.sync_project_primary_department() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.department_id IS NOT DISTINCT FROM NEW.department_id THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.department_id IS NOT NULL THEN
    DELETE FROM public.project_departments
      WHERE workspace_id = NEW.workspace_id AND project_id = NEW.id AND department_id = OLD.department_id;
  END IF;
  IF NEW.department_id IS NOT NULL THEN
    INSERT INTO public.project_departments (workspace_id, project_id, department_id)
      VALUES (NEW.workspace_id, NEW.id, NEW.department_id)
      ON CONFLICT (project_id, department_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION app.sync_project_primary_department() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER projects_sync_primary_department
  AFTER INSERT OR UPDATE OF department_id ON projects
  FOR EACH ROW EXECUTE FUNCTION app.sync_project_primary_department();
