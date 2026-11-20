-- Account-private support: related_workspace_id is historical context, not a tenant grant.
CREATE FUNCTION app.is_support_agent() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
 SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id = app.current_user_id()
 AND u.is_platform_admin AND u.status = 'active' AND u.platform_admin_status = 'ACTIVE' AND u.deleted_at IS NULL);
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.is_support_agent() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.is_support_agent() TO taskin_app;
--> statement-breakpoint
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE support_tickets FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY support_ticket_private ON support_tickets
USING (user_id = (SELECT app.current_user_id()) OR (SELECT app.is_support_agent()))
WITH CHECK (user_id = (SELECT app.current_user_id()) OR (SELECT app.is_support_agent()));
--> statement-breakpoint
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE support_messages FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY support_message_private ON support_messages
USING ((SELECT app.is_support_agent()) OR (NOT is_internal AND EXISTS
 (SELECT 1 FROM support_tickets t WHERE t.id = support_messages.ticket_id AND t.user_id = (SELECT app.current_user_id()))))
WITH CHECK ((SELECT app.is_support_agent()) OR
 (sender_id = (SELECT app.current_user_id()) AND sender_type = 'USER' AND NOT is_internal AND EXISTS
 (SELECT 1 FROM support_tickets t WHERE t.id = support_messages.ticket_id AND t.user_id = (SELECT app.current_user_id()))));
--> statement-breakpoint
ALTER TABLE support_uploads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE support_uploads FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY support_upload_private ON support_uploads
USING ((SELECT app.is_support_agent()) OR
 (message_id IS NULL AND uploader_id = (SELECT app.current_user_id()) AND sender_type = 'USER') OR
 EXISTS (SELECT 1 FROM support_messages m JOIN support_tickets t ON t.id=m.ticket_id
  WHERE m.id=support_uploads.message_id AND t.user_id=(SELECT app.current_user_id()) AND NOT m.is_internal))
WITH CHECK (((SELECT app.is_support_agent()) OR (uploader_id=(SELECT app.current_user_id()) AND sender_type='USER')) AND
 (ticket_id IS NULL OR EXISTS (SELECT 1 FROM support_tickets t WHERE t.id=support_uploads.ticket_id)));
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON support_tickets, support_messages, support_uploads FROM taskin_app;
--> statement-breakpoint
REVOKE UPDATE ON support_messages FROM taskin_app;
--> statement-breakpoint
-- Marking read deliberately does not touch updated_at or the public ticket version.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='taskin_platform_admin') THEN
  GRANT SELECT ON support_tickets, support_messages, support_uploads TO taskin_platform_admin;
 END IF;
END $$;
