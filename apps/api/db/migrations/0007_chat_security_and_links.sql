-- M3: row-level security and the foreign keys the TypeScript schema cannot express for chat, the
-- deferred tasks.source_message_id reference, and file garbage collection that respects messages.

-- ---------------------------------------------------------------- composite SET NULL (see 0005)
ALTER TABLE conversations ADD CONSTRAINT conversations_project_fk
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects (workspace_id, id)
  ON DELETE SET NULL (project_id);--> statement-breakpoint
ALTER TABLE messages ADD CONSTRAINT messages_reply_to_fk
  FOREIGN KEY (workspace_id, reply_to_id) REFERENCES messages (workspace_id, id)
  ON DELETE SET NULL (reply_to_id);--> statement-breakpoint
-- M2 kept the column; the messages table exists now.
ALTER TABLE tasks ADD CONSTRAINT tasks_source_message_fk
  FOREIGN KEY (workspace_id, source_message_id) REFERENCES messages (workspace_id, id)
  ON DELETE SET NULL (source_message_id);--> statement-breakpoint

-- ---------------------------------------------------------------- tenant tables
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY conversations_tenant ON conversations
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE conversation_members FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY conversation_members_tenant ON conversation_members
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE messages FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY messages_tenant ON messages
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE message_reactions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY message_reactions_tenant ON message_reactions
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

ALTER TABLE message_mentions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE message_mentions FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY message_mentions_tenant ON message_mentions
  USING (workspace_id = (SELECT app.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));--> statement-breakpoint

-- Settings changes only: a new message bumps last_seq on every send and is not an "update".
CREATE TRIGGER conversations_touch BEFORE UPDATE OF title, topic, tone, is_private, post_policy, project_id, archived_at
  ON conversations FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint

-- ---------------------------------------------------------------- file garbage collection
-- As in 0005, plus: a file a message still carries is linked, not garbage.
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
   ORDER BY a.created_at LIMIT p_limit)
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------- presence fan-out
-- When someone connects or goes offline, the gateway tells each workspace they belong to. Under
-- row-level security that would take one query per user; this returns only the (user, workspace)
-- pairs of active memberships, for the ids the gateway already holds.
CREATE OR REPLACE FUNCTION app.active_workspaces_of(p_users uuid[])
RETURNS TABLE (user_id uuid, workspace_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT m.user_id, m.workspace_id
  FROM public.workspace_members m
  JOIN public.workspaces w ON w.id = m.workspace_id
  WHERE m.user_id = ANY (p_users) AND m.status = 'active' AND w.deleted_at IS NULL
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.active_workspaces_of(uuid[]) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.active_workspaces_of(uuid[]) TO taskin_app;
--> statement-breakpoint
-- Read and delivery receipts from sockets arrive by the hundred every second; each WebSocket node
-- writes them in one batch a second instead of one transaction per receipt. A batch spans
-- workspaces, so it cannot run under one tenant setting: every row is matched on its own
-- workspace, only members who have not left move, cursors only move forwards, never past the
-- conversation's last message. A row that a message send holds right now is skipped rather than
-- waited for (a batch must never queue behind sends, nor sends behind it) and comes back marked
-- `skipped`, for the next batch; the rows that moved come back to be announced.
CREATE OR REPLACE FUNCTION app.advance_cursors(p_workspaces uuid[], p_conversations uuid[], p_users uuid[], p_read bigint[], p_delivered bigint[])
RETURNS TABLE (workspace_id uuid, conversation_id uuid, user_id uuid, last_read_seq bigint, last_delivered_seq bigint, skipped boolean)
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH v AS MATERIALIZED (
    SELECT * FROM unnest(p_workspaces, p_conversations, p_users, p_read, p_delivered) AS v(workspace_id, conversation_id, user_id, read, delivered)
  ),
  mine AS MATERIALIZED (
    SELECT cm.conversation_id, cm.user_id
    FROM public.conversation_members cm
    JOIN v ON cm.workspace_id = v.workspace_id AND cm.conversation_id = v.conversation_id AND cm.user_id = v.user_id
    WHERE cm.left_at IS NULL
    FOR UPDATE OF cm SKIP LOCKED
  ),
  moved AS (
    UPDATE public.conversation_members cm SET
      last_read_seq = GREATEST(cm.last_read_seq, LEAST(v.read, c.last_seq)),
      last_delivered_seq = GREATEST(cm.last_delivered_seq, LEAST(GREATEST(v.delivered, v.read), c.last_seq))
    FROM mine
    JOIN v ON v.conversation_id = mine.conversation_id AND v.user_id = mine.user_id
    JOIN public.conversations c ON c.workspace_id = v.workspace_id AND c.id = v.conversation_id
    WHERE cm.conversation_id = mine.conversation_id AND cm.user_id = mine.user_id
      AND (cm.last_read_seq < LEAST(v.read, c.last_seq) OR cm.last_delivered_seq < LEAST(GREATEST(v.delivered, v.read), c.last_seq))
    RETURNING cm.workspace_id, cm.conversation_id, cm.user_id, cm.last_read_seq, cm.last_delivered_seq
  )
  SELECT moved.workspace_id, moved.conversation_id, moved.user_id, moved.last_read_seq, moved.last_delivered_seq, false FROM moved
  UNION ALL
  SELECT v.workspace_id, v.conversation_id, v.user_id, v.read, v.delivered, true
  FROM v
  WHERE NOT EXISTS (SELECT 1 FROM mine WHERE mine.conversation_id = v.conversation_id AND mine.user_id = v.user_id)
    AND EXISTS (SELECT 1 FROM public.conversation_members cm
                WHERE cm.workspace_id = v.workspace_id AND cm.conversation_id = v.conversation_id AND cm.user_id = v.user_id AND cm.left_at IS NULL)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.advance_cursors(uuid[], uuid[], uuid[], bigint[], bigint[]) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.advance_cursors(uuid[], uuid[], uuid[], bigint[], bigint[]) TO taskin_app;
--> statement-breakpoint
-- The chat hot path in one round trip (RFC §0.3). A plain message is this one call, outside any
-- transaction block: it sets the tenant itself (row-level security stays in force, as this runs as
-- the caller), then one statement checks that the sender may post, bumps the conversation's `seq`
-- under its row lock, inserts the message, records mentions and moves the sender's cursors; a
-- retry with the same client id returns the stored message instead. PL/pgSQL keeps the statement's
-- plan per connection, so a send is not planned again each time. Messages with side effects
-- (mention and reply notifications, the REST audit row) call it inside a transaction instead.
CREATE OR REPLACE FUNCTION app.send_message(
  p_workspace uuid, p_user uuid, p_request_id text, p_conversation uuid, p_client_msg_id uuid, p_kind message_kind,
  p_text text, p_meta jsonb, p_attachment uuid, p_reply_to uuid, p_search text, p_mentions uuid[])
RETURNS TABLE (r_inserted json, r_prior json, r_me json, r_mention_ids uuid[])
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
BEGIN
  PERFORM set_config('app.workspace_id', p_workspace::text, true), set_config('app.user_id', p_user::text, true),
          set_config('app.request_id', coalesce(p_request_id, ''), true);
  RETURN QUERY
  WITH me AS (
    SELECT cm.role, c.post_policy, c.archived_at IS NOT NULL AS archived
    FROM conversation_members cm
    JOIN conversations c ON c.workspace_id = cm.workspace_id AND c.id = cm.conversation_id
    WHERE cm.workspace_id = p_workspace AND cm.conversation_id = p_conversation AND cm.user_id = p_user AND cm.left_at IS NULL
  ),
  prior AS (
    SELECT m.id, m.seq, m.created_at FROM messages m
    WHERE m.conversation_id = p_conversation AND m.author_id = p_user AND m.client_msg_id = p_client_msg_id
  ),
  bump AS (
    UPDATE conversations c SET last_seq = c.last_seq + 1, last_message_at = now()
    FROM me
    WHERE c.workspace_id = p_workspace AND c.id = p_conversation AND c.archived_at IS NULL
      AND (me.post_policy = 'everyone' OR me.role IN ('owner', 'admin'))
      AND NOT EXISTS (SELECT 1 FROM prior)
    RETURNING c.last_seq, c.last_message_at
  ),
  inserted AS (
    INSERT INTO messages (workspace_id, conversation_id, seq, author_id, kind, body_text, body_meta, attachment_id, reply_to_id,
                          client_msg_id, search_text, created_at)
    SELECT p_workspace, p_conversation, bump.last_seq, p_user, p_kind, p_text, p_meta, p_attachment, p_reply_to,
           p_client_msg_id, p_search, bump.last_message_at
    FROM bump
    RETURNING id, seq, created_at
  ),
  mentioned AS (
    INSERT INTO message_mentions (workspace_id, message_id, user_id)
    SELECT p_workspace, inserted.id, cm.user_id
    FROM inserted
    JOIN conversation_members cm ON cm.workspace_id = p_workspace AND cm.conversation_id = p_conversation AND cm.left_at IS NULL
                                AND cm.user_id = ANY (p_mentions)
    RETURNING user_id
  ),
  cursors AS (
    -- The sender has read their own message; a hidden chat reappears for everyone in it.
    UPDATE conversation_members cm SET
      hidden_at = NULL,
      last_read_seq = CASE WHEN cm.user_id = p_user THEN greatest(cm.last_read_seq, inserted.seq) ELSE cm.last_read_seq END,
      last_delivered_seq = CASE WHEN cm.user_id = p_user THEN greatest(cm.last_delivered_seq, inserted.seq) ELSE cm.last_delivered_seq END
    FROM inserted
    WHERE cm.workspace_id = p_workspace AND cm.conversation_id = p_conversation AND (cm.user_id = p_user OR cm.hidden_at IS NOT NULL)
  )
  SELECT (SELECT row_to_json(inserted) FROM inserted), (SELECT row_to_json(prior) FROM prior), (SELECT row_to_json(me) FROM me),
         coalesce((SELECT array_agg(mentioned.user_id) FROM mentioned), '{}');
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.send_message(uuid, uuid, text, uuid, uuid, message_kind, text, jsonb, uuid, uuid, text, uuid[]) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.send_message(uuid, uuid, text, uuid, uuid, message_kind, text, jsonb, uuid, uuid, text, uuid[]) TO taskin_app;
