-- Development roles (docker-entrypoint-initdb.d runs this once, as the superuser, on a fresh
-- volume; the API test setup runs it too). Production roles and passwords are provisioned by
-- operations, never from this file.
--
--   taskin_migrator  owns the schema and runs migrations; BYPASSRLS for seeds and the few
--                    SECURITY DEFINER lookups that must cross tenants.
--   taskin_app       what the API connects as: DML only, subject to row-level security.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'taskin_migrator') THEN
    CREATE ROLE taskin_migrator LOGIN PASSWORD 'taskin_migrator' BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'taskin_app') THEN
    CREATE ROLE taskin_app LOGIN PASSWORD 'taskin_app' NOBYPASSRLS;
  END IF;
END
$$;
