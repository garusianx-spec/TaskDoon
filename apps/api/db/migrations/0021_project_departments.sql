CREATE TABLE "project_departments" (
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	CONSTRAINT "project_departments_pk" PRIMARY KEY("project_id","department_id")
);
--> statement-breakpoint
ALTER TABLE "project_departments" ADD CONSTRAINT "project_departments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_departments" ADD CONSTRAINT "project_departments_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_departments" ADD CONSTRAINT "project_departments_department_fk" FOREIGN KEY ("workspace_id","department_id") REFERENCES "public"."departments"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_departments_workspace_project_idx" ON "project_departments" USING btree ("workspace_id","project_id");--> statement-breakpoint
CREATE INDEX "project_departments_workspace_department_idx" ON "project_departments" USING btree ("workspace_id","department_id");
