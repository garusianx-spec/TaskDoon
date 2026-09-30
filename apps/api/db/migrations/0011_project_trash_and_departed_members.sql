-- Phase 3.1: the project trash and what a departed member leaves behind.
--
-- A deleted project stays in the trash for 40 days: hidden from every query, restorable by the
-- workspace owner, then purged. The API filters `deleted_at` itself; this restrictive policy makes
-- row-level security agree, so a query that forgets the filter still cannot see a trashed project.
-- Only the trash itself (its list, restore, delete and the purge) opts in with
-- `app.include_deleted`, set per transaction like the tenant.

CREATE OR REPLACE FUNCTION app.include_deleted() RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE
AS $$ SELECT coalesce(current_setting('app.include_deleted', true), '') = 'on' $$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.include_deleted() TO taskin_app;--> statement-breakpoint

-- Restrictive: it narrows the tenant policy, never widens it. SELECT policies also check the rows
-- an UPDATE reads and writes, so moving a project into or out of the trash opts in as well.
CREATE POLICY projects_hide_deleted ON projects AS RESTRICTIVE FOR SELECT
  USING (deleted_at IS NULL OR (SELECT app.include_deleted()));--> statement-breakpoint

-- ---------------------------------------------------------------- purge finders (worker)
-- Like app.workspaces_due_for_purge: they look across tenants, so they run as their owner; the
-- worker then purges each one inside its own tenant's transaction.
CREATE OR REPLACE FUNCTION app.projects_due_for_purge(p_days integer, p_limit integer)
RETURNS TABLE (workspace_id uuid, project_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.workspace_id, p.id FROM public.projects p
  WHERE p.deleted_at IS NOT NULL AND p.deleted_at <= now() - make_interval(days => p_days)
  ORDER BY p.deleted_at
  LIMIT p_limit
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.projects_due_for_purge(integer, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.projects_due_for_purge(integer, integer) TO taskin_app;--> statement-breakpoint

-- A removed member keeps their project memberships and stars for 40 days, so re-inviting them
-- gives their work back as it was. After that the state goes; their messages, tasks, comments and
-- activity never do (the member row itself stays as the anchor of that history).
CREATE OR REPLACE FUNCTION app.departed_members_due(p_days integer, p_limit integer)
RETURNS TABLE (workspace_id uuid, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT m.workspace_id, m.user_id FROM public.workspace_members m
  WHERE m.status = 'left' AND m.left_at <= now() - make_interval(days => p_days)
    AND (EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.workspace_id = m.workspace_id AND pm.user_id = m.user_id)
      OR EXISTS (SELECT 1 FROM public.project_stars s WHERE s.workspace_id = m.workspace_id AND s.user_id = m.user_id))
  ORDER BY m.left_at
  LIMIT p_limit
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.departed_members_due(integer, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.departed_members_due(integer, integer) TO taskin_app;
