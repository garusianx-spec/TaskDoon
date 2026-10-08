-- Provisions (or repairs) taskin_platform_admin on an existing database: the role the platform
-- admin reads use. Idempotent; run it as a superuser (only a superuser may grant BYPASSRLS),
-- connected to the application database:
--
--   docker exec -i taskin-postgres-1 psql -U postgres -d taskin -v ON_ERROR_STOP=1 < infra/postgres/platform-admin-role.sql
--
-- Needed when the database was created before the role existed: docker-entrypoint-initdb.d
-- (01-roles.sql) only runs on a fresh volume, and migration 0015 grants nothing to a role that
-- does not exist yet. The password below is the development one (DATABASE_PLATFORM_ADMIN_URL in
-- infra/docker-compose.yml); production sets its own and keeps it out of this file.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'taskin_platform_admin') THEN
    CREATE ROLE taskin_platform_admin LOGIN PASSWORD 'taskin_platform_admin' BYPASSRLS;
  END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO taskin_platform_admin', current_database());
END
$$;
ALTER ROLE taskin_platform_admin SET default_transaction_read_only = on;

-- Exactly what migration 0015 grants: SELECT on what the admin screens show, and a message's
-- linked-task id (four columns of tasks, never the task itself).
GRANT SELECT ON users, auth_sessions, workspaces, workspace_members, roles, role_permissions, departments, plans,
  projects, project_members, conversations, conversation_members, messages, message_mentions, message_reactions,
  attachments, platform_audit_logs
TO taskin_platform_admin;
GRANT SELECT (id, workspace_id, source_message_id, deleted_at) ON tasks TO taskin_platform_admin;

-- Phase 4: broadcasts and operational bookkeeping, never outbox payloads or headers.
DO $$
BEGIN
  IF to_regclass('public.system_broadcasts') IS NOT NULL THEN
    GRANT SELECT ON system_broadcasts TO taskin_platform_admin;
  END IF;
END
$$;
GRANT SELECT (id, event_type, aggregate_type, workspace_id, created_at, published_at) ON outbox_events TO taskin_platform_admin;
