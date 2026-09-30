CREATE TYPE "public"."activity_kind" AS ENUM('task-assigned', 'task-completed', 'task-commented', 'message-mention', 'file-shared', 'member-joined');--> statement-breakpoint
CREATE TYPE "public"."attachment_kind" AS ENUM('image', 'video', 'document', 'sheet', 'archive', 'audio');--> statement-breakpoint
CREATE TYPE "public"."attachment_status" AS ENUM('pending', 'scanning', 'ready', 'rejected', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."attendee_response" AS ENUM('pending', 'accepted', 'declined', 'tentative');--> statement-breakpoint
CREATE TYPE "public"."event_kind" AS ENUM('meeting', 'reminder', 'milestone');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('task-assigned', 'status-changed', 'comment', 'mention', 'reply', 'invitation', 'event-reminder', 'member-joined');--> statement-breakpoint
CREATE TYPE "public"."project_role" AS ENUM('lead', 'contributor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."project_visibility" AS ENUM('workspace', 'private');--> statement-breakpoint
CREATE TYPE "public"."tag_tone" AS ENUM('gray', 'blue', 'teal', 'green', 'amber', 'red', 'pink', 'violet');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('urgent', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in-progress', 'review', 'done');--> statement-breakpoint
CREATE TABLE "board_columns" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "task_status" NOT NULL,
	"tone" "tag_tone",
	"is_builtin" boolean DEFAULT false NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "board_columns_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "board_columns_title_len" CHECK (char_length("board_columns"."title") between 1 and 32)
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tone" "tag_tone" DEFAULT 'gray' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "labels_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "labels_name_len" CHECK (char_length("labels"."name") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "project_role" NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "project_stars" (
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_stars_pk" PRIMARY KEY("user_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"department_id" uuid,
	"color" "avatar_tone" DEFAULT 'brand' NOT NULL,
	"parent_id" uuid,
	"visibility" "project_visibility" DEFAULT 'workspace' NOT NULL,
	"workflow_id" uuid NOT NULL,
	"task_seq" bigint DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projects_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "projects_key_format" CHECK ("projects"."key" ~ '^[A-Z][A-Z0-9]{1,5}$'),
	CONSTRAINT "projects_name_len" CHECK (char_length("projects"."name") between 1 and 80),
	CONSTRAINT "projects_description_len" CHECK (char_length("projects"."description") <= 2000),
	CONSTRAINT "projects_not_own_parent" CHECK ("projects"."parent_id" is distinct from "projects"."id")
);
--> statement-breakpoint
CREATE TABLE "subtasks" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"assignee_id" uuid,
	"position" text COLLATE "C" NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subtasks_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "subtasks_title_len" CHECK (char_length("subtasks"."title") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "task_assignees" (
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_assignees_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"reply_to_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "task_comments_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_comments_body_len" CHECK (char_length("task_comments"."body") between 1 and 4000)
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_labels" (
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	CONSTRAINT "task_labels_pk" PRIMARY KEY("task_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "task_stars" (
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_stars_pk" PRIMARY KEY("user_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"number" bigint NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"column_id" uuid NOT NULL,
	"status" "task_status" NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"reviewer_id" uuid,
	"start_date" date NOT NULL,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"reopen_column_id" uuid,
	"source_message_id" uuid,
	"source_note_id" uuid,
	"created_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"search_text" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tasks_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "tasks_project_number_uq" UNIQUE("project_id","number"),
	CONSTRAINT "tasks_title_len" CHECK (char_length("tasks"."title") between 1 and 200),
	CONSTRAINT "tasks_description_len" CHECK (char_length("tasks"."description") <= 20000),
	CONSTRAINT "tasks_dates" CHECK ("tasks"."due_date" is null or "tasks"."due_date" >= "tasks"."start_date")
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflows_ws_id_uq" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid,
	"kind" "activity_kind" NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"target_title" text NOT NULL,
	"context" text DEFAULT '' NOT NULL,
	"project_id" uuid,
	"source_event_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"uploader_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"kind" "attachment_kind" NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" "bytea",
	"status" "attachment_status" DEFAULT 'pending' NOT NULL,
	"multipart_upload_id" text,
	"meta" jsonb,
	"thumbnail_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "attachments_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "attachments_object_key_uq" UNIQUE("object_key"),
	CONSTRAINT "attachments_size" CHECK ("attachments"."size_bytes" > 0),
	CONSTRAINT "attachments_name_len" CHECK (char_length("attachments"."file_name") between 1 and 255)
);
--> statement-breakpoint
CREATE TABLE "calendar_event_attendees" (
	"workspace_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"response" "attendee_response" DEFAULT 'pending' NOT NULL,
	CONSTRAINT "calendar_event_attendees_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "event_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"project_id" uuid,
	"all_day" boolean NOT NULL,
	"start_date" date,
	"end_date" date,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"time_zone" text NOT NULL,
	"recurrence_rule" text,
	"created_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "calendar_events_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "calendar_events_title_len" CHECK (char_length("calendar_events"."title") between 1 and 120),
	CONSTRAINT "calendar_events_timing" CHECK (("calendar_events"."all_day" and "calendar_events"."start_date" is not null and "calendar_events"."starts_at" is null and ("calendar_events"."end_date" is null or "calendar_events"."end_date" >= "calendar_events"."start_date"))
       or (not "calendar_events"."all_day" and "calendar_events"."starts_at" is not null and ("calendar_events"."ends_at" is null or "calendar_events"."ends_at" > "calendar_events"."starts_at")))
);
--> statement-breakpoint
CREATE TABLE "note_categories" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"key" text,
	"label" text NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_categories_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "note_categories_label_len" CHECK (char_length("note_categories"."label") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"colors" "tag_tone"[] DEFAULT '{}' NOT NULL,
	"pinned_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"search_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "notes_title_len" CHECK (char_length("notes"."title") <= 200),
	CONSTRAINT "notes_body_len" CHECK (char_length("notes"."body") <= 100000)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"actor_id" uuid,
	"kind" "notification_kind" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"subject" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_target_type" CHECK ("notifications"."target_type" in ('task', 'conversation', 'message', 'event', 'workspace'))
);
--> statement-breakpoint
CREATE TABLE "task_attachments" (
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_attachments_pk" PRIMARY KEY("task_id","attachment_id")
);
--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_workflow_fk" FOREIGN KEY ("workspace_id","workflow_id") REFERENCES "public"."workflows"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stars" ADD CONSTRAINT "project_stars_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stars" ADD CONSTRAINT "project_stars_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stars" ADD CONSTRAINT "project_stars_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_parent_fk" FOREIGN KEY ("workspace_id","parent_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workflow_fk" FOREIGN KEY ("workspace_id","workflow_id") REFERENCES "public"."workflows"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_assignee_fk" FOREIGN KEY ("workspace_id","assignee_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_reply_fk" FOREIGN KEY ("workspace_id","reply_to_id") REFERENCES "public"."task_comments"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_fk" FOREIGN KEY ("workspace_id","author_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_label_fk" FOREIGN KEY ("workspace_id","label_id") REFERENCES "public"."labels"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_stars" ADD CONSTRAINT "task_stars_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_stars" ADD CONSTRAINT "task_stars_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_stars" ADD CONSTRAINT "task_stars_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_column_fk" FOREIGN KEY ("workspace_id","column_id") REFERENCES "public"."board_columns"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reopen_column_fk" FOREIGN KEY ("workspace_id","reopen_column_id") REFERENCES "public"."board_columns"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewer_fk" FOREIGN KEY ("workspace_id","reviewer_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploader_fk" FOREIGN KEY ("workspace_id","uploader_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_attendees" ADD CONSTRAINT "calendar_event_attendees_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_attendees" ADD CONSTRAINT "calendar_event_attendees_event_fk" FOREIGN KEY ("workspace_id","event_id") REFERENCES "public"."calendar_events"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_attendees" ADD CONSTRAINT "calendar_event_attendees_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_categories" ADD CONSTRAINT "note_categories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_categories" ADD CONSTRAINT "note_categories_owner_fk" FOREIGN KEY ("workspace_id","owner_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_fk" FOREIGN KEY ("workspace_id","owner_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_category_fk" FOREIGN KEY ("workspace_id","category_id") REFERENCES "public"."note_categories"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_attachment_fk" FOREIGN KEY ("workspace_id","attachment_id") REFERENCES "public"."attachments"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "board_columns_title_uq" ON "board_columns" USING btree ("workflow_id",lower("title")) WHERE "board_columns"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "board_columns_position_idx" ON "board_columns" USING btree ("workflow_id","position") WHERE "board_columns"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "labels_ws_name_uq" ON "labels" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_ws_key_uq" ON "projects" USING btree ("workspace_id","key") WHERE "projects"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "projects_ws_parent_idx" ON "projects" USING btree ("workspace_id","parent_id");--> statement-breakpoint
CREATE INDEX "subtasks_task_position_idx" ON "subtasks" USING btree ("task_id","position");--> statement-breakpoint
CREATE INDEX "task_assignees_user_idx" ON "task_assignees" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "task_comments_task_idx" ON "task_comments" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_events_task_idx" ON "task_events" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_labels_label_idx" ON "task_labels" USING btree ("label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_source_message_uq" ON "tasks" USING btree ("source_message_id") WHERE "tasks"."source_message_id" is not null and "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_source_note_uq" ON "tasks" USING btree ("source_note_id") WHERE "tasks"."source_note_id" is not null and "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_column_position_idx" ON "tasks" USING btree ("workspace_id","column_id","position") WHERE "tasks"."deleted_at" is null and "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_project_status_idx" ON "tasks" USING btree ("workspace_id","project_id","status") WHERE "tasks"."deleted_at" is null and "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("workspace_id","due_date") WHERE "tasks"."deleted_at" is null and "tasks"."archived_at" is null and "tasks"."status" <> 'done';--> statement-breakpoint
CREATE INDEX "tasks_created_idx" ON "tasks" USING btree ("workspace_id","created_at","id") WHERE "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_search_idx" ON "tasks" USING gin ("workspace_id","search_text" gin_trgm_ops) WHERE "tasks"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_default_uq" ON "workflows" USING btree ("workspace_id") WHERE "workflows"."is_default";--> statement-breakpoint
CREATE INDEX "activity_events_ws_idx" ON "activity_events" USING btree ("workspace_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "activity_events_source_uq" ON "activity_events" USING btree ("source_event_id") WHERE "activity_events"."source_event_id" is not null;--> statement-breakpoint
CREATE INDEX "attachments_status_idx" ON "attachments" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE INDEX "calendar_event_attendees_user_idx" ON "calendar_event_attendees" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "calendar_events_starts_idx" ON "calendar_events" USING btree ("workspace_id","starts_at") WHERE "calendar_events"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "calendar_events_start_date_idx" ON "calendar_events" USING btree ("workspace_id","start_date") WHERE "calendar_events"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "note_categories_label_uq" ON "note_categories" USING btree ("workspace_id","owner_id",lower("label"));--> statement-breakpoint
CREATE UNIQUE INDEX "note_categories_key_uq" ON "note_categories" USING btree ("workspace_id","owner_id","key") WHERE "note_categories"."key" is not null;--> statement-breakpoint
CREATE INDEX "notes_owner_category_idx" ON "notes" USING btree ("workspace_id","owner_id","category_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notes_search_idx" ON "notes" USING gin ("workspace_id","search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_id","workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("recipient_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("recipient_id","dedupe_key") WHERE "notifications"."dedupe_key" is not null and "notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX "task_attachments_attachment_idx" ON "task_attachments" USING btree ("attachment_id");