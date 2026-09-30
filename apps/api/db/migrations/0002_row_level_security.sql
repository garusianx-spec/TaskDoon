-- Tenant isolation, triggers and the few functions that must see across tenants.
--
-- Every tenant table gets ENABLE + FORCE row-level security and a policy keyed on
-- app.current_workspace_id(), which the API sets per transaction. An unset setting is NULL,
-- NULL = x is never true, so a query outside a tenant transaction sees nothing (fail closed).
-- taskin_app has no BYPASSRLS; taskin_migrator does (migrations, seeds, SECURITY DEFINER below).

-- ---------------------------------------------------------------- workspaces
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY workspaces_tenant ON workspaces
  USING (id = (SELECT app.current_workspace_id()))
  WITH CHECK (id = (SELECT app.current_workspace_id()));--> statement-breakpoint
-- The workspace switcher lists every workspace the user belongs to, outside any one tenant.
CREATE POLICY workspaces_member_read ON workspaces FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = workspaces.id
      AND m.user_id = (SELECT app.current_user_id())
      AND m.status = 'active'
  ));--> statement-breakpoint

-- ---------------------------------------------------------------- workspace_members
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY workspace_members_tenant ON workspace_members
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint
CREATE POLICY workspace_members_self_read ON workspace_members FOR SELECT
  USING (user_id = (SELECT app.current_user_id()));--> statement-breakpoint

-- ---------------------------------------------------------------- roles
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE roles FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY roles_tenant ON roles
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint
-- The switcher shows the user's role in each of their workspaces.
CREATE POLICY roles_member_read ON roles FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = roles.workspace_id
      AND m.user_id = (SELECT app.current_user_id())
      AND m.status = 'active'
  ));--> statement-breakpoint

-- ---------------------------------------------------------------- plain tenant tables
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY role_permissions_tenant ON role_permissions
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE departments FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY departments_tenant ON departments
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY invitations_tenant ON invitations
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

-- ---------------------------------------------------------------- privileges
-- Plans are reference data managed by seeds.
REVOKE INSERT, UPDATE, DELETE ON plans FROM taskin_app;--> statement-breakpoint

-- ---------------------------------------------------------------- updated_at
CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER workspaces_touch BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER departments_touch BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER roles_touch BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER workspace_members_touch BEFORE UPDATE ON workspace_members FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER idempotency_keys_touch BEFORE UPDATE ON idempotency_keys FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint

-- ---------------------------------------------------------------- the owner row is immutable
-- The owner role holds every permission implicitly and has no role_permissions rows. Nothing
-- may give it any, whatever the API does. Its key, rank and lock flag cannot change either.
CREATE OR REPLACE FUNCTION app.protect_locked_role_permissions() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM roles r WHERE r.id = NEW.role_id AND r.is_locked) THEN
    RAISE EXCEPTION 'the permissions of a locked role cannot change'
      USING ERRCODE = 'TK001', HINT = 'owner_immutable';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER role_permissions_protect_locked
  BEFORE INSERT OR UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION app.protect_locked_role_permissions();--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.protect_locked_roles() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_locked AND (NEW.key, NEW.rank, NEW.is_locked, NEW.workspace_id)
                     IS DISTINCT FROM (OLD.key, OLD.rank, OLD.is_locked, OLD.workspace_id) THEN
    RAISE EXCEPTION 'a locked role cannot change'
      USING ERRCODE = 'TK001', HINT = 'owner_immutable';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER roles_protect_locked
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION app.protect_locked_roles();--> statement-breakpoint

-- ---------------------------------------------------------------- outbox wake-up
-- One notification per inserting statement; NOTIFY is delivered at commit, so the relay never
-- sees an event before its transaction is visible.
CREATE OR REPLACE FUNCTION app.notify_outbox() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify('outbox', '');
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER outbox_events_notify
  AFTER INSERT ON outbox_events
  FOR EACH STATEMENT EXECUTE FUNCTION app.notify_outbox();--> statement-breakpoint

-- ---------------------------------------------------------------- cross-tenant lookups
-- The only reads that may cross tenants, each returning ids and nothing else. They run as
-- taskin_migrator (SECURITY DEFINER) with a pinned search_path.

-- Accepting an invitation: the invitee is not yet a member, so it cannot see the row.
CREATE OR REPLACE FUNCTION app.find_invitation(p_token_hash bytea)
RETURNS TABLE (workspace_id uuid, invitation_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT i.workspace_id, i.id FROM public.invitations i WHERE i.token_hash = p_token_hash
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.find_invitation(bytea) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.find_invitation(bytea) TO taskin_app;--> statement-breakpoint

-- The purge job: deleted workspaces whose grace period is over.
CREATE OR REPLACE FUNCTION app.workspaces_due_for_purge(p_limit integer)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT w.id FROM public.workspaces w
  WHERE w.deleted_at IS NOT NULL AND w.purge_after <= now()
  ORDER BY w.purge_after
  LIMIT p_limit
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.workspaces_due_for_purge(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.workspaces_due_for_purge(integer) TO taskin_app;
