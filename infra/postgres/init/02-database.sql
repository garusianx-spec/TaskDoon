-- The application database, owned by the migrator (it then owns the public schema too).
SELECT 'CREATE DATABASE taskin OWNER taskin_migrator'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'taskin')\gexec

REVOKE ALL ON DATABASE taskin FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE taskin TO taskin_app;
