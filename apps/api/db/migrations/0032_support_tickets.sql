CREATE TYPE "public"."support_sender_type" AS ENUM('USER', 'AGENT');--> statement-breakpoint
CREATE TYPE "public"."support_upload_status" AS ENUM('pending', 'ready', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."ticket_department" AS ENUM('TECHNICAL', 'BILLING', 'GENERAL');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('OPEN', 'IN_PROGRESS', 'ANSWERED', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"sender_type" "support_sender_type" NOT NULL,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"public_seq" integer,
	"command_id" uuid NOT NULL,
	"command_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_message_parent_uq" UNIQUE("ticket_id","id"),
	CONSTRAINT "support_message_command_uq" UNIQUE("ticket_id","sender_id","command_id"),
	CONSTRAINT "support_message_public_seq_uq" UNIQUE("ticket_id","public_seq"),
	CONSTRAINT "support_message_body_ck" CHECK (char_length(btrim("support_messages"."body")) between 1 and 8000),
	CONSTRAINT "support_message_visibility_ck" CHECK (("support_messages"."is_internal" and "support_messages"."sender_type" = 'AGENT' and "support_messages"."public_seq" is null) or (not "support_messages"."is_internal" and "support_messages"."public_seq" is not null and "support_messages"."public_seq" > 0))
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"reference_number" bigint GENERATED ALWAYS AS IDENTITY (sequence name "support_tickets_reference_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9007199254740991 START WITH 1000 CACHE 1),
	"user_id" uuid NOT NULL,
	"related_workspace_id" uuid,
	"workspace_name" text NOT NULL,
	"subject" text NOT NULL,
	"department" "ticket_department" NOT NULL,
	"priority" "ticket_priority" NOT NULL,
	"status" "ticket_status" DEFAULT 'OPEN' NOT NULL,
	"assigned_admin_id" uuid,
	"command_id" uuid NOT NULL,
	"command_hash" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"last_public_seq" integer DEFAULT 1 NOT NULL,
	"user_read_seq" integer DEFAULT 1 NOT NULL,
	"agent_read_seq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_referenceNumber_unique" UNIQUE("reference_number"),
	CONSTRAINT "support_ticket_command_uq" UNIQUE("user_id","command_id"),
	CONSTRAINT "support_ticket_subject_ck" CHECK (char_length(btrim("support_tickets"."subject")) between 3 and 160),
	CONSTRAINT "support_ticket_sequence_ck" CHECK ("support_tickets"."version" > 0 and "support_tickets"."last_public_seq" > 0 and "support_tickets"."user_read_seq" between 0 and "support_tickets"."last_public_seq" and "support_tickets"."agent_read_seq" between 0 and "support_tickets"."last_public_seq")
);
--> statement-breakpoint
CREATE TABLE "support_uploads" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"uploader_id" uuid NOT NULL,
	"related_workspace_id" uuid,
	"ticket_id" uuid,
	"message_id" uuid,
	"sender_type" "support_sender_type" NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"status" "support_upload_status" DEFAULT 'pending' NOT NULL,
	"command_id" uuid NOT NULL,
	"command_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "support_upload_command_uq" UNIQUE("uploader_id","command_id"),
	CONSTRAINT "support_upload_parent_ck" CHECK ("support_uploads"."message_id" is null or "support_uploads"."ticket_id" is not null),
	CONSTRAINT "support_upload_size_ck" CHECK ("support_uploads"."size_bytes" between 1 and 10485760),
	CONSTRAINT "support_upload_name_ck" CHECK (char_length("support_uploads"."file_name") between 1 and 255)
);
--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_related_workspace_id_workspaces_id_fk" FOREIGN KEY ("related_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_admin_id_users_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_uploads" ADD CONSTRAINT "support_uploads_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_uploads" ADD CONSTRAINT "support_uploads_related_workspace_id_workspaces_id_fk" FOREIGN KEY ("related_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_uploads" ADD CONSTRAINT "support_uploads_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_uploads" ADD CONSTRAINT "support_uploads_ticket_id_message_id_support_messages_ticket_id_id_fk" FOREIGN KEY ("ticket_id","message_id") REFERENCES "public"."support_messages"("ticket_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_message_thread_idx" ON "support_messages" USING btree ("ticket_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "support_ticket_owner_idx" ON "support_tickets" USING btree ("user_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "support_ticket_rate_idx" ON "support_tickets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "support_ticket_queue_idx" ON "support_tickets" USING btree ("status","priority","department","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "support_ticket_assignee_idx" ON "support_tickets" USING btree ("assigned_admin_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "support_upload_message_idx" ON "support_uploads" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "support_upload_ticket_idx" ON "support_uploads" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "support_upload_rate_idx" ON "support_uploads" USING btree ("uploader_id","created_at");