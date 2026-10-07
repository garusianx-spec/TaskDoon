-- Platform-wide table: do not add a workspace_id or tenant RLS policy.
CREATE TRIGGER system_broadcasts_touch_updated_at
BEFORE UPDATE ON system_broadcasts
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
-- Archiving preserves provenance; the application must never physically erase broadcasts.
REVOKE DELETE, TRUNCATE ON system_broadcasts FROM taskin_app;
--> statement-breakpoint
-- Keep the isolated admin role read-only and limit the outbox view to bookkeeping.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taskin_platform_admin') THEN
    GRANT SELECT ON system_broadcasts TO taskin_platform_admin;
    GRANT SELECT (id, event_type, aggregate_type, workspace_id, created_at, published_at)
      ON outbox_events TO taskin_platform_admin;
  END IF;
END
$$;
