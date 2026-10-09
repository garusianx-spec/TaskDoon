-- Fresh verification volumes only. Passwords come from runtime environment, never this file.
\getenv app_password TASKIN_APP_PASSWORD
\getenv migrator_password TASKIN_MIGRATOR_PASSWORD
\getenv platform_password TASKIN_PLATFORM_ADMIN_PASSWORD
CREATE ROLE taskin_migrator LOGIN PASSWORD :'migrator_password' BYPASSRLS;
CREATE ROLE taskin_app LOGIN PASSWORD :'app_password' NOBYPASSRLS;
CREATE ROLE taskin_platform_admin LOGIN PASSWORD :'platform_password' BYPASSRLS;
ALTER ROLE taskin_platform_admin SET default_transaction_read_only = on;
CREATE DATABASE taskin OWNER taskin_migrator;
REVOKE ALL ON DATABASE taskin FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE taskin TO taskin_app;
GRANT CONNECT ON DATABASE taskin TO taskin_platform_admin;
\connect taskin
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Migrations predating the wrapper sometimes call uuidv7() without the app schema.
-- PostgreSQL16 resolves those calls through this invoker-only alias. It delegates to
-- migration0000's existing implementation; no existing migration or UUID algorithm changes.
SELECT current_setting('server_version_num')::integer < 180000 AS needs_uuidv7 \gset
\if :needs_uuidv7
CREATE OR REPLACE FUNCTION public.uuidv7() RETURNS uuid
LANGUAGE plpgsql VOLATILE PARALLEL SAFE
SET search_path = pg_catalog
AS $uuid$
BEGIN
  RETURN app.uuidv7();
END
$uuid$;
ALTER FUNCTION public.uuidv7() OWNER TO taskin_migrator;
REVOKE ALL ON FUNCTION public.uuidv7() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uuidv7() TO taskin_app;
\endif
