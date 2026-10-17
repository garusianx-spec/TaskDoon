-- Platform editorial content: separate from tenant-private attachments and billing entitlements.
CREATE TABLE site_documents (
 id uuid PRIMARY KEY DEFAULT app.uuidv7(), kind text NOT NULL CHECK (kind IN ('page','feature','article','help','faq','pricing','job','settings','navigation','reusable')),
 slug text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
 draft jsonb NOT NULL, published jsonb, published_slug text, version integer NOT NULL DEFAULT 1 CHECK (version > 0), published_version integer,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL, updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz, published_updated_at timestamptz,
 CONSTRAINT site_documents_public_snapshot_check CHECK ((published IS NULL) = (published_slug IS NULL)), CONSTRAINT site_documents_published_check CHECK (status <> 'published' OR published IS NOT NULL)
);--> statement-breakpoint
CREATE UNIQUE INDEX site_documents_kind_slug_uq ON site_documents(kind, slug);--> statement-breakpoint
CREATE UNIQUE INDEX site_documents_public_slug_uq ON site_documents(kind, published_slug);--> statement-breakpoint
CREATE INDEX site_documents_status_kind_idx ON site_documents(status, kind);--> statement-breakpoint
CREATE TABLE site_revisions (
 id uuid PRIMARY KEY DEFAULT app.uuidv7(), document_id uuid NOT NULL REFERENCES site_documents(id) ON DELETE RESTRICT,
 content jsonb NOT NULL, slug text NOT NULL, version integer NOT NULL, actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX site_revisions_document_idx ON site_revisions(document_id, created_at DESC);--> statement-breakpoint
CREATE TABLE site_submissions (
 id uuid PRIMARY KEY DEFAULT app.uuidv7(), kind text NOT NULL CHECK (kind IN ('contact','collaboration','demo','application')), payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in-progress','closed','archived')), notes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX site_submissions_inbox_idx ON site_submissions(kind, status, created_at DESC);--> statement-breakpoint
CREATE TABLE site_redirects (id uuid PRIMARY KEY DEFAULT app.uuidv7(), from_path text NOT NULL, to_path text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), CHECK (from_path <> to_path));--> statement-breakpoint
CREATE UNIQUE INDEX site_redirects_path_uq ON site_redirects(from_path);--> statement-breakpoint
CREATE TABLE site_audit_log (id uuid PRIMARY KEY DEFAULT app.uuidv7(), actor_id uuid REFERENCES users(id) ON DELETE SET NULL, action text NOT NULL, document_id uuid REFERENCES site_documents(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now());--> statement-breakpoint
CREATE INDEX site_audit_created_idx ON site_audit_log(created_at DESC);--> statement-breakpoint
CREATE TABLE site_media (id uuid PRIMARY KEY DEFAULT app.uuidv7(), storage_key text NOT NULL, filename text NOT NULL, content_type text NOT NULL, size integer NOT NULL CHECK (size > 0 AND size <= 10485760), alt text NOT NULL, created_by uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, archived_at timestamptz);--> statement-breakpoint
CREATE FUNCTION app.is_site_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT EXISTS (SELECT 1 FROM public.users WHERE id = app.current_user_id() AND is_platform_admin AND status = 'active' AND deleted_at IS NULL)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.is_site_admin() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.is_site_admin() TO taskin_app;--> statement-breakpoint
ALTER TABLE site_documents ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY site_documents_read ON site_documents FOR SELECT TO taskin_app USING (app.is_site_admin());--> statement-breakpoint
CREATE POLICY site_documents_write ON site_documents FOR ALL TO taskin_app USING (app.is_site_admin()) WITH CHECK (app.is_site_admin());--> statement-breakpoint
ALTER TABLE site_revisions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY site_revisions_read ON site_revisions FOR SELECT TO taskin_app USING (app.is_site_admin());--> statement-breakpoint
CREATE POLICY site_revisions_insert ON site_revisions FOR INSERT TO taskin_app WITH CHECK (app.is_site_admin());--> statement-breakpoint
ALTER TABLE site_submissions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY site_submissions_admin ON site_submissions FOR ALL TO taskin_app USING (app.is_site_admin()) WITH CHECK (app.is_site_admin());--> statement-breakpoint
CREATE POLICY site_submissions_public_insert ON site_submissions FOR INSERT TO taskin_app WITH CHECK (payload->>'consent' = 'true' AND status = 'new' AND notes = '');--> statement-breakpoint
ALTER TABLE site_redirects ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY site_redirects_read ON site_redirects FOR SELECT TO taskin_app USING (true);--> statement-breakpoint
CREATE POLICY site_redirects_write ON site_redirects FOR ALL TO taskin_app USING (app.is_site_admin()) WITH CHECK (app.is_site_admin());--> statement-breakpoint
ALTER TABLE site_audit_log ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY site_audit_admin ON site_audit_log FOR SELECT TO taskin_app USING (app.is_site_admin());--> statement-breakpoint
CREATE POLICY site_audit_insert ON site_audit_log FOR INSERT TO taskin_app WITH CHECK (app.is_site_admin() AND actor_id = app.current_user_id());--> statement-breakpoint
ALTER TABLE site_media ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY site_media_read ON site_media FOR SELECT TO taskin_app USING ((completed_at IS NOT NULL AND archived_at IS NULL) OR app.is_site_admin());--> statement-breakpoint
CREATE POLICY site_media_write ON site_media FOR ALL TO taskin_app USING (app.is_site_admin()) WITH CHECK (app.is_site_admin());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON site_documents, site_submissions, site_media TO taskin_app;--> statement-breakpoint
GRANT SELECT, INSERT ON site_revisions, site_audit_log TO taskin_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON site_redirects TO taskin_app;--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON site_documents, site_submissions, site_media FROM taskin_app;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON site_revisions, site_audit_log FROM taskin_app;

--> statement-breakpoint
-- Public readers receive only publication snapshots through a narrow SQL interface. Even a
-- raw anonymous application-role query cannot select the draft of a published document.
CREATE FUNCTION app.published_site_documents(p_kind text DEFAULT NULL, p_slug text DEFAULT NULL)
RETURNS TABLE (id uuid, kind text, slug text, content jsonb, published_at timestamptz, updated_at timestamptz, version integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT d.id, d.kind, d.published_slug, d.published, d.published_at, d.published_updated_at, d.published_version
 FROM public.site_documents d WHERE d.status = 'published' AND d.published IS NOT NULL
 AND (p_kind IS NULL OR d.kind = p_kind) AND (p_slug IS NULL OR d.published_slug = p_slug)
 ORDER BY d.created_at LIMIT 500
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.published_site_documents(text,text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.published_site_documents(text,text) TO taskin_app;
