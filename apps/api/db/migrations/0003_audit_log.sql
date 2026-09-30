-- Append-only audit trail, range-partitioned by month (drizzle-kit cannot declare partitioned
-- tables, so it lives here; src/platform/db/schema/audit.ts mirrors it for queries).
-- taskin_app may INSERT and SELECT through the parent table and nothing else.

CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY,
  workspace_id uuid,
  actor_user_id uuid,
  actor_session_id uuid,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  changes jsonb,
  ip inet,
  user_agent text,
  request_id text,
  trace_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);--> statement-breakpoint

-- Catches anything outside the monthly partitions, so an insert never fails for lack of one.
CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;--> statement-breakpoint

CREATE INDEX audit_logs_ws_created_idx ON audit_logs (workspace_id, created_at DESC);--> statement-breakpoint
CREATE INDEX audit_logs_resource_idx ON audit_logs (workspace_id, resource_type, resource_id);--> statement-breakpoint
CREATE INDEX audit_logs_request_idx ON audit_logs (request_id);--> statement-breakpoint

REVOKE ALL ON audit_logs FROM taskin_app;--> statement-breakpoint
GRANT SELECT, INSERT ON audit_logs TO taskin_app;--> statement-breakpoint
REVOKE ALL ON audit_logs_default FROM taskin_app;--> statement-breakpoint

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- Global events (sign-in, sessions) have no workspace; tenant events must match the tenant.
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT
  WITH CHECK (workspace_id IS NULL OR workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint
CREATE POLICY audit_logs_tenant_read ON audit_logs FOR SELECT
  USING (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

-- Creates the partitions for this month and the next `months_ahead`. A daily worker job calls
-- it, so rows never have to land in the default partition. New partitions are only reachable
-- through the parent (the app's direct privileges are revoked).
CREATE OR REPLACE FUNCTION app.ensure_audit_partitions(months_ahead integer DEFAULT 3)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  first_month date := date_trunc('month', now())::date;
  from_day date;
  to_day date;
  partition_name text;
  created integer := 0;
BEGIN
  FOR m IN 0..months_ahead LOOP
    from_day := (first_month + make_interval(months => m))::date;
    to_day := (from_day + interval '1 month')::date;
    partition_name := format('audit_logs_%s', to_char(from_day, 'YYYY_MM'));
    IF to_regclass('public.' || partition_name) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE public.%I PARTITION OF public.audit_logs FOR VALUES FROM (%L) TO (%L)',
        partition_name, from_day, to_day
      );
      EXECUTE format('REVOKE ALL ON public.%I FROM taskin_app', partition_name);
      created := created + 1;
    END IF;
  END LOOP;
  RETURN created;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.ensure_audit_partitions(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.ensure_audit_partitions(integer) TO taskin_app;--> statement-breakpoint

-- Retention: drops monthly partitions that ended more than `keep_months` ago.
CREATE OR REPLACE FUNCTION app.drop_expired_audit_partitions(keep_months integer DEFAULT 12)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  cutoff date := (date_trunc('month', now()) - make_interval(months => keep_months))::date;
  partition record;
  dropped integer := 0;
BEGIN
  FOR partition IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'public.audit_logs'::regclass
      AND c.relname ~ '^audit_logs_[0-9]{4}_[0-9]{2}$'
      AND to_date(substring(c.relname FROM 12), 'YYYY_MM') < cutoff
  LOOP
    EXECUTE format('DROP TABLE public.%I', partition.relname);
    dropped := dropped + 1;
  END LOOP;
  RETURN dropped;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.drop_expired_audit_partitions(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.drop_expired_audit_partitions(integer) TO taskin_app;--> statement-breakpoint

SELECT app.ensure_audit_partitions(3);
