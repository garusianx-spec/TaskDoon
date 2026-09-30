CREATE TYPE "public"."avatar_tone" AS ENUM('brand', 'teal', 'violet', 'amber', 'rose', 'slate');--> statement-breakpoint
CREATE TYPE "public"."invitation_channel" AS ENUM('email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('active', 'suspended', 'left');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('login', 'step_up', 'phone_change');--> statement-breakpoint
CREATE TYPE "public"."permission_action" AS ENUM('view', 'create', 'edit', 'delete', 'assign');--> statement-breakpoint
CREATE TYPE "public"."permission_module" AS ENUM('messages', 'boards', 'files', 'reports', 'members');--> statement-breakpoint
CREATE TYPE "public"."presence_status" AS ENUM('online', 'busy', 'away');--> statement-breakpoint
CREATE TYPE "public"."session_revoke_reason" AS ENUM('logout', 'user_revoked', 'reuse_detected', 'password_changed', 'admin_action', 'expired', 'workspace_removed');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_label" text,
	"user_agent" text,
	"ip" "inet",
	"geo_city" text,
	"amr" text[] NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"stepped_up_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoke_reason" "session_revoke_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"code_hash" "bytea" NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"ip" "inet",
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_challenges_attempts" CHECK ("otp_challenges"."attempts" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"session_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"replaced_by" uuid,
	CONSTRAINT "refresh_tokens_hash_uq" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"phone" text NOT NULL,
	"phone_verified_at" timestamp with time zone NOT NULL,
	"email" "citext",
	"email_verified_at" timestamp with time zone,
	"full_name" text NOT NULL,
	"avatar_key" text,
	"avatar_tone" "avatar_tone" DEFAULT 'brand' NOT NULL,
	"locale" text DEFAULT 'fa-IR' NOT NULL,
	"time_zone" text DEFAULT 'Asia/Tehran' NOT NULL,
	"password_hash" text,
	"password_changed_at" timestamp with time zone,
	"failed_password_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"security_version" integer DEFAULT 1 NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_full_name_len" CHECK (char_length("users"."full_name") between 2 and 80),
	CONSTRAINT "users_phone_e164" CHECK ("users"."phone" ~ '^\+[1-9][0-9]{7,14}$')
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "departments_name_len" CHECK (char_length("departments"."name") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel" "invitation_channel" NOT NULL,
	"address" text NOT NULL,
	"role_id" uuid NOT NULL,
	"department_id" uuid,
	"message" text DEFAULT '' NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_uq" UNIQUE("token_hash"),
	CONSTRAINT "invitations_message_len" CHECK (char_length("invitations"."message") <= 280)
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"limits" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"workspace_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"module" "permission_module" NOT NULL,
	"action" "permission_action" NOT NULL,
	CONSTRAINT "role_permissions_pk" PRIMARY KEY("role_id","module","action")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"rank" smallint NOT NULL,
	"is_system" boolean NOT NULL,
	"is_locked" boolean NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "roles_ws_key_uq" UNIQUE("workspace_id","key"),
	CONSTRAINT "roles_key_format" CHECK ("roles"."key" ~ '^[a-z][a-z0-9_-]{1,31}$')
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"department_id" uuid,
	"job_title" text DEFAULT '' NOT NULL,
	"status" "member_status" DEFAULT 'active' NOT NULL,
	"presence_status" "presence_status" DEFAULT 'online' NOT NULL,
	"status_message" text DEFAULT '' NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_pk" PRIMARY KEY("workspace_id","user_id"),
	CONSTRAINT "workspace_members_status_message_len" CHECK (char_length("workspace_members"."status_message") <= 80),
	CONSTRAINT "workspace_members_job_title_len" CHECK (char_length("workspace_members"."job_title") <= 80)
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"slug" "citext" NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"initials" text NOT NULL,
	"tone" "avatar_tone" NOT NULL,
	"icon_key" text,
	"owner_user_id" uuid NOT NULL,
	"plan_id" text DEFAULT 'free' NOT NULL,
	"settings" jsonb DEFAULT '{"timeZone":"Asia/Tehran","weekStart":"saturday","weekend":["friday"],"systemMessageOnConvert":true,"allowedEmailDomains":[]}'::jsonb NOT NULL,
	"member_count" integer DEFAULT 1 NOT NULL,
	"storage_used_bytes" bigint DEFAULT 0 NOT NULL,
	"storage_reserved_bytes" bigint DEFAULT 0 NOT NULL,
	"rbac_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	CONSTRAINT "workspaces_slug_uq" UNIQUE("slug"),
	CONSTRAINT "workspaces_name_len" CHECK (char_length("workspaces"."name") between 1 and 40),
	CONSTRAINT "workspaces_description_len" CHECK (char_length("workspaces"."description") <= 160),
	CONSTRAINT "workspaces_member_count" CHECK ("workspaces"."member_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"state" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_pk" PRIMARY KEY("user_id","scope","key"),
	CONSTRAINT "idempotency_keys_key_len" CHECK (char_length("idempotency_keys"."key") between 8 and 64),
	CONSTRAINT "idempotency_keys_state" CHECK ("idempotency_keys"."state" in ('in_progress', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "outbox_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" uuid,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_fk" FOREIGN KEY ("workspace_id","role_id") REFERENCES "public"."roles"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_department_fk" FOREIGN KEY ("workspace_id","department_id") REFERENCES "public"."departments"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_fk" FOREIGN KEY ("workspace_id","role_id") REFERENCES "public"."roles"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_role_fk" FOREIGN KEY ("workspace_id","role_id") REFERENCES "public"."roles"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_department_fk" FOREIGN KEY ("workspace_id","department_id") REFERENCES "public"."departments"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_active_idx" ON "auth_sessions" USING btree ("user_id") WHERE "auth_sessions"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "otp_challenges_phone_idx" ON "otp_challenges" USING btree ("phone","purpose","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "otp_challenges_created_idx" ON "otp_challenges" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "refresh_tokens_session_idx" ON "refresh_tokens" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone") WHERE "users"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email") WHERE "users"."email" is not null and "users"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "departments_ws_name_uq" ON "departments" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_uq" ON "invitations" USING btree ("workspace_id","channel","address") WHERE "invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "invitations_ws_status_idx" ON "invitations" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE INDEX "workspace_members_user_active_idx" ON "workspace_members" USING btree ("user_id") WHERE "workspace_members"."status" = 'active';--> statement-breakpoint
CREATE INDEX "workspaces_purge_idx" ON "workspaces" USING btree ("purge_after") WHERE "workspaces"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "outbox_events_unpublished_idx" ON "outbox_events" USING btree ("id") WHERE "outbox_events"."published_at" is null;--> statement-breakpoint
CREATE INDEX "outbox_events_published_idx" ON "outbox_events" USING btree ("published_at") WHERE "outbox_events"."published_at" is not null;