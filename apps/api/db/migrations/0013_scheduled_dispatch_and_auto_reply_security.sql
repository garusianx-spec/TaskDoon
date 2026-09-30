-- Phase 3.2: scheduled messages and the out-of-office auto-reply.
--
-- A scheduled message is private to its author until it is sent (like a note), so its policy
-- narrows the tenant to `app.user_id`. Working hours are read across the workspace (a direct
-- message looks up the recipient's), but each member writes only their own. The auto-reply log is
-- tenant data like any other.

-- ---------------------------------------------------------------- composite SET NULL (see 0007)
ALTER TABLE scheduled_messages ADD CONSTRAINT scheduled_messages_reply_to_fk
  FOREIGN KEY (workspace_id, reply_to_id) REFERENCES messages (workspace_id, id)
  ON DELETE SET NULL (reply_to_id);--> statement-breakpoint
ALTER TABLE scheduled_messages ADD CONSTRAINT scheduled_messages_message_fk
  FOREIGN KEY (workspace_id, message_id) REFERENCES messages (workspace_id, id)
  ON DELETE SET NULL (message_id);--> statement-breakpoint

-- ---------------------------------------------------------------- row-level security
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE scheduled_messages FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY scheduled_messages_author ON scheduled_messages
  USING (workspace_id = (SELECT app.current_workspace_id()) AND author_id = (SELECT app.current_user_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()) AND author_id = (SELECT app.current_user_id()));--> statement-breakpoint

ALTER TABLE member_working_hours ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE member_working_hours FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY member_working_hours_tenant ON member_working_hours FOR SELECT
  USING (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint
CREATE POLICY member_working_hours_own ON member_working_hours
  USING (workspace_id = (SELECT app.current_workspace_id()) AND user_id = (SELECT app.current_user_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()) AND user_id = (SELECT app.current_user_id()));--> statement-breakpoint

ALTER TABLE auto_reply_log ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE auto_reply_log FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY auto_reply_log_tenant ON auto_reply_log
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

CREATE TRIGGER scheduled_messages_touch BEFORE UPDATE ON scheduled_messages FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER member_working_hours_touch BEFORE UPDATE ON member_working_hours FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint

-- ---------------------------------------------------------------- the worker's sweep
-- The delayed job of each schedule sends it on time; this finds whatever is due and was missed
-- (a lost job, a dispatcher that died holding its claim). It looks across tenants, so it runs as
-- its owner, like the purge finders; each one is then sent inside its own tenant and author.
CREATE OR REPLACE FUNCTION app.scheduled_messages_due(p_limit integer)
RETURNS TABLE (workspace_id uuid, scheduled_id uuid, author_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.workspace_id, s.id, s.author_id FROM public.scheduled_messages s
  WHERE s.status = 'pending' AND s.scheduled_at <= now()
    AND (s.claimed_at IS NULL OR s.claimed_at < now() - interval '2 minutes')
  ORDER BY s.scheduled_at
  LIMIT p_limit
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.scheduled_messages_due(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.scheduled_messages_due(integer) TO taskin_app;--> statement-breakpoint

-- ---------------------------------------------------------------- file garbage collection
-- As 0007, and a file that a pending scheduled message will send is still in use.
CREATE OR REPLACE FUNCTION app.attachments_due_for_gc(p_limit integer)
RETURNS TABLE (workspace_id uuid, attachment_id uuid, reason text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  (SELECT a.workspace_id, a.id, 'stale_upload' FROM public.attachments a
   WHERE a.status = 'pending' AND a.created_at < now() - interval '24 hours'
   ORDER BY a.created_at LIMIT p_limit)
  UNION ALL
  (SELECT a.workspace_id, a.id, 'unlinked' FROM public.attachments a
   WHERE a.status IN ('scanning', 'ready', 'rejected') AND a.deleted_at IS NULL
     AND a.created_at < now() - interval '24 hours'
     AND NOT EXISTS (SELECT 1 FROM public.task_attachments ta WHERE ta.attachment_id = a.id)
     AND NOT EXISTS (SELECT 1 FROM public.messages m WHERE m.attachment_id = a.id)
     AND NOT EXISTS (SELECT 1 FROM public.scheduled_messages s WHERE s.attachment_id = a.id AND s.status = 'pending')
   ORDER BY a.created_at LIMIT p_limit)
$$;
