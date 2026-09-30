CREATE TYPE "public"."scheduled_message_status" AS ENUM('pending', 'sent', 'cancelled', 'failed');--> statement-breakpoint
CREATE TABLE "auto_reply_log" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"replied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auto_reply_log_pk" PRIMARY KEY("workspace_id","user_id","sender_id")
);
--> statement-breakpoint
CREATE TABLE "member_working_hours" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"auto_reply_enabled" boolean DEFAULT false NOT NULL,
	"days" text[] NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_working_hours_pk" PRIMARY KEY("workspace_id","user_id"),
	CONSTRAINT "member_working_hours_days" CHECK ("member_working_hours"."days" <@ array['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday']::text[]),
	CONSTRAINT "member_working_hours_start" CHECK ("member_working_hours"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "member_working_hours_end" CHECK ("member_working_hours"."end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "member_working_hours_window" CHECK ("member_working_hours"."start_time" <> "member_working_hours"."end_time"),
	CONSTRAINT "member_working_hours_message_len" CHECK (char_length("member_working_hours"."message") between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "scheduled_messages" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"kind" "message_kind" NOT NULL,
	"body_text" text,
	"body_meta" jsonb,
	"attachment_id" uuid,
	"reply_to_id" uuid,
	"client_msg_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "scheduled_message_status" DEFAULT 'pending' NOT NULL,
	"claimed_at" timestamp with time zone,
	"message_id" uuid,
	"failure_code" text,
	"sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_messages_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "scheduled_messages_kind" CHECK ("scheduled_messages"."kind" <> 'system'),
	CONSTRAINT "scheduled_messages_body_len" CHECK (char_length("scheduled_messages"."body_text") <= 8000),
	CONSTRAINT "scheduled_messages_sent" CHECK (("scheduled_messages"."status" = 'sent') = ("scheduled_messages"."sent_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "auto_reply_log" ADD CONSTRAINT "auto_reply_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_reply_log" ADD CONSTRAINT "auto_reply_log_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_reply_log" ADD CONSTRAINT "auto_reply_log_sender_fk" FOREIGN KEY ("workspace_id","sender_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_working_hours" ADD CONSTRAINT "member_working_hours_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_working_hours" ADD CONSTRAINT "member_working_hours_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_conversation_fk" FOREIGN KEY ("workspace_id","conversation_id") REFERENCES "public"."conversations"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_author_fk" FOREIGN KEY ("workspace_id","author_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_attachment_fk" FOREIGN KEY ("workspace_id","attachment_id") REFERENCES "public"."attachments"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_working_hours_enabled_idx" ON "member_working_hours" USING btree ("workspace_id") WHERE "member_working_hours"."auto_reply_enabled";--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_messages_client_msg_uq" ON "scheduled_messages" USING btree ("conversation_id","author_id","client_msg_id");--> statement-breakpoint
CREATE INDEX "scheduled_messages_author_idx" ON "scheduled_messages" USING btree ("workspace_id","author_id","conversation_id","scheduled_at") WHERE "scheduled_messages"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "scheduled_messages_due_idx" ON "scheduled_messages" USING btree ("scheduled_at") WHERE "scheduled_messages"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "scheduled_messages_attachment_idx" ON "scheduled_messages" USING btree ("attachment_id") WHERE "scheduled_messages"."attachment_id" is not null and "scheduled_messages"."status" = 'pending';