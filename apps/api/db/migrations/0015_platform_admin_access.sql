-- Platform super admin (phase 1): who may read across tenants, and how.
--
-- The platform audit log is append-only, like audit_logs: the API may add rows and read them,
-- never change or remove one.
REVOKE UPDATE, DELETE, TRUNCATE ON platform_audit_logs FROM taskin_app;--> statement-breakpoint

-- Verified platform-admin reads use their own login role, taskin_platform_admin (created with the
-- other roles; BYPASSRLS, every transaction read-only by default), on a pool of their own. It can
-- only SELECT, and only these tables: what the admin screens show. The tenant policies themselves
-- are unchanged, and taskin_app never bypasses them. Where the role does not exist (yet), nothing
-- is granted and the admin routes answer 503 until it is provisioned and migrations run again.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'taskin_platform_admin') THEN
    GRANT SELECT ON users, auth_sessions, workspaces, workspace_members, roles, role_permissions, departments, plans,
      projects, project_members, conversations, conversation_members, messages, message_mentions, message_reactions,
      attachments, platform_audit_logs
    TO taskin_platform_admin;
    -- A message's linked task: the id only, never the task itself.
    GRANT SELECT (id, workspace_id, source_message_id, deleted_at) ON tasks TO taskin_platform_admin;
  END IF;
END
$$;
