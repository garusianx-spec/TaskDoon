CREATE TYPE "public"."conversation_kind" AS ENUM('direct', 'group', 'channel');--> statement-breakpoint
CREATE TYPE "public"."conversation_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."membership_mode" AS ENUM('manual', 'project_synced');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('text', 'voice', 'file', 'system');--> statement-breakpoint
CREATE TYPE "public"."notification_level" AS ENUM('all', 'mentions', 'none');--> statement-breakpoint
CREATE TYPE "public"."post_policy" AS ENUM('everyone', 'admins');--> statement-breakpoint
CREATE TABLE "conversation_members" (
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "conversation_role" DEFAULT 'member' NOT NULL,
	"last_read_seq" bigint DEFAULT 0 NOT NULL,
	"last_delivered_seq" bigint DEFAULT 0 NOT NULL,
	"pinned_at" timestamp with time zone,
	"muted_until" timestamp with time zone,
	"notification_level" "notification_level" DEFAULT 'all' NOT NULL,
	"hidden_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "conversation_members_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "conversation_kind" NOT NULL,
	"title" text,
	"topic" text DEFAULT '' NOT NULL,
	"tone" "avatar_tone" DEFAULT 'brand' NOT NULL,
	"direct_key" text,
	"is_private" boolean DEFAULT true NOT NULL,
	"post_policy" "post_policy" DEFAULT 'everyone' NOT NULL,
	"project_id" uuid,
	"membership_mode" "membership_mode" DEFAULT 'manual' NOT NULL,
	"last_seq" bigint DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "conversations_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "conversations_title" CHECK ("conversations"."kind" = 'direct' or char_length("conversations"."title") between 1 and 80),
	CONSTRAINT "conversations_topic_len" CHECK (char_length("conversations"."topic") <= 250),
	CONSTRAINT "conversations_direct_key" CHECK (("conversations"."kind" = 'direct') = ("conversations"."direct_key" is not null)),
	CONSTRAINT "conversations_direct_shape" CHECK ("conversations"."kind" <> 'direct' or ("conversations"."is_private" and "conversations"."post_policy" = 'everyone'))
);
--> statement-breakpoint
CREATE TABLE "message_mentions" (
	"workspace_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "message_mentions_pk" PRIMARY KEY("message_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"workspace_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_reactions_pk" PRIMARY KEY("message_id","user_id","emoji"),
	CONSTRAINT "message_reactions_emoji_len" CHECK (octet_length("message_reactions"."emoji") between 1 and 32)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"author_id" uuid,
	"kind" "message_kind" NOT NULL,
	"body_text" text,
	"body_meta" jsonb,
	"attachment_id" uuid,
	"reply_to_id" uuid,
	"client_msg_id" uuid,
	"source_event_id" bigint,
	"search_text" text,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "messages_conversation_seq_uq" UNIQUE("conversation_id","seq"),
	CONSTRAINT "messages_seq_positive" CHECK ("messages"."seq" > 0),
	CONSTRAINT "messages_body_len" CHECK (char_length("messages"."body_text") <= 8000),
	CONSTRAINT "messages_author" CHECK (("messages"."kind" = 'system') = ("messages"."author_id" is null))
);
--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_fk" FOREIGN KEY ("workspace_id","conversation_id") REFERENCES "public"."conversations"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_mentions" ADD CONSTRAINT "message_mentions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_mentions" ADD CONSTRAINT "message_mentions_message_fk" FOREIGN KEY ("workspace_id","message_id") REFERENCES "public"."messages"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_mentions" ADD CONSTRAINT "message_mentions_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_fk" FOREIGN KEY ("workspace_id","message_id") REFERENCES "public"."messages"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_fk" FOREIGN KEY ("workspace_id","conversation_id") REFERENCES "public"."conversations"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_fk" FOREIGN KEY ("workspace_id","author_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_attachment_fk" FOREIGN KEY ("workspace_id","attachment_id") REFERENCES "public"."attachments"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_members_user_idx" ON "conversation_members" USING btree ("workspace_id","user_id") WHERE "conversation_members"."left_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_direct_uq" ON "conversations" USING btree ("workspace_id","direct_key") WHERE "conversations"."kind" = 'direct';--> statement-breakpoint
CREATE INDEX "conversations_project_idx" ON "conversations" USING btree ("workspace_id","project_id") WHERE "conversations"."project_id" is not null;--> statement-breakpoint
CREATE INDEX "conversations_public_idx" ON "conversations" USING btree ("workspace_id","created_at") WHERE "conversations"."kind" = 'channel' and not "conversations"."is_private" and "conversations"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "message_mentions_user_idx" ON "message_mentions" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_client_msg_uq" ON "messages" USING btree ("conversation_id","author_id","client_msg_id") WHERE "messages"."client_msg_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_source_event_uq" ON "messages" USING btree ("conversation_id","source_event_id") WHERE "messages"."source_event_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_attachment_idx" ON "messages" USING btree ("conversation_id","seq") WHERE "messages"."attachment_id" is not null and "messages"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "messages_links_idx" ON "messages" USING btree ("conversation_id","seq") WHERE "messages"."body_text" ~* 'https?://' and "messages"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "messages_attachment_ref_idx" ON "messages" USING btree ("attachment_id") WHERE "messages"."attachment_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_search_idx" ON "messages" USING gin ("workspace_id","search_text" gin_trgm_ops) WHERE "messages"."deleted_at" is null;