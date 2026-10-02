ALTER TABLE "workspaces" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "limit_overrides" jsonb;--> statement-breakpoint
ALTER TABLE "platform_audit_logs" ADD COLUMN "target_workspace_id" uuid;--> statement-breakpoint
CREATE INDEX "platform_audit_logs_workspace_idx" ON "platform_audit_logs" USING btree ("target_workspace_id","id" DESC NULLS LAST) WHERE "platform_audit_logs"."target_workspace_id" is not null;