-- Extensions, the `app` schema and helper functions every later migration relies on.
-- Runs as taskin_migrator (the database owner); taskin_app is created by infra/postgres/init.

CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gin;--> statement-breakpoint

CREATE SCHEMA IF NOT EXISTS app;--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO taskin_app;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO taskin_app;--> statement-breakpoint

-- Every table and sequence this role creates from here on is DML-accessible to taskin_app.
-- Tables that must be narrower (plans, audit_logs) revoke explicitly in their own migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO taskin_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO taskin_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;--> statement-breakpoint

-- Time-ordered UUIDv7 (RFC 9562). PostgreSQL 18 has uuidv7() built in; older servers (local
-- development on 16/17) get the same layout from a random v4 with the millisecond timestamp
-- overlaid on its first 48 bits and the version nibble flipped from 4 to 7.
CREATE OR REPLACE FUNCTION app.uuidv7() RETURNS uuid
LANGUAGE plpgsql VOLATILE PARALLEL SAFE
AS $$
BEGIN
  IF current_setting('server_version_num')::int >= 180000 THEN
    RETURN uuidv7();
  END IF;
  RETURN encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
          FROM 1 FOR 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
END
$$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.uuidv7() TO taskin_app;--> statement-breakpoint

-- The tenant and user a transaction acts for, set with set_config(..., true) by the API's
-- UnitOfWork. Unset (or reset to '' at transaction end) reads as NULL, so policies fail closed.
CREATE OR REPLACE FUNCTION app.current_workspace_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE
AS $$ SELECT nullif(current_setting('app.workspace_id', true), '')::uuid $$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.current_workspace_id() TO taskin_app;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE
AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.current_user_id() TO taskin_app;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
