CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"channel" text NOT NULL,
	"created_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_hash_uq" UNIQUE("token_hash"),
	CONSTRAINT "password_reset_tokens_channel" CHECK ("password_reset_tokens"."channel" in ('sms', 'email', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "platform_audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "platform_audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"admin_id" uuid NOT NULL,
	"target_user_id" uuid,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"ip" "inet",
	"user_agent" text,
	"request_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "client_name" text;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "os_name" text;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "device_type" text;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "last_ip" "inet";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_platform_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_reset_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id") WHERE "password_reset_tokens"."used_at" is null;--> statement-breakpoint
CREATE INDEX "platform_audit_logs_target_idx" ON "platform_audit_logs" USING btree ("target_user_id","created_at" DESC NULLS LAST) WHERE "platform_audit_logs"."target_user_id" is not null;--> statement-breakpoint
CREATE INDEX "platform_audit_logs_admin_idx" ON "platform_audit_logs" USING btree ("admin_id","created_at" DESC NULLS LAST);