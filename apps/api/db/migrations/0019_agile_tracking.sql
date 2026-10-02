CREATE TYPE "public"."issue_severity" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."issue_type" AS ENUM('task', 'bug', 'feature');--> statement-breakpoint
CREATE TYPE "public"."task_dependency_type" AS ENUM('blocks', 'blocked_by', 'relates_to');--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"source_task_id" uuid NOT NULL,
	"target_task_id" uuid NOT NULL,
	"type" "task_dependency_type" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_dependencies_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_dependencies_not_self" CHECK ("task_dependencies"."source_task_id" <> "task_dependencies"."target_task_id")
);
--> statement-breakpoint
CREATE TABLE "task_worklogs" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"duration_minutes" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_worklogs_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_worklogs_duration" CHECK ("task_worklogs"."duration_minutes" between 1 and 1440),
	CONSTRAINT "task_worklogs_description_len" CHECK (char_length("task_worklogs"."description") <= 500)
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "type" "issue_type" DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "severity" "issue_severity";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "estimated_minutes" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "is_backlog" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_source_fk" FOREIGN KEY ("workspace_id","source_task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_target_fk" FOREIGN KEY ("workspace_id","target_task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_created_by_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_worklogs" ADD CONSTRAINT "task_worklogs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_worklogs" ADD CONSTRAINT "task_worklogs_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_worklogs" ADD CONSTRAINT "task_worklogs_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_dependencies_pair_uq" ON "task_dependencies" USING btree (least("source_task_id", "target_task_id"),greatest("source_task_id", "target_task_id"));--> statement-breakpoint
CREATE INDEX "task_dependencies_source_idx" ON "task_dependencies" USING btree ("source_task_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_target_idx" ON "task_dependencies" USING btree ("target_task_id");--> statement-breakpoint
CREATE INDEX "task_worklogs_task_idx" ON "task_worklogs" USING btree ("task_id","logged_at");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_severity_bug_only" CHECK ("tasks"."severity" is null or "tasks"."type" = 'bug');--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_estimate_range" CHECK ("tasks"."estimated_minutes" is null or "tasks"."estimated_minutes" between 1 and 60000);