CREATE TYPE "public"."broadcast_level" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TABLE "system_broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"message" text NOT NULL,
	"level" "broadcast_level" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "system_broadcasts_message_length" CHECK (char_length(btrim("system_broadcasts"."message")) between 1 and 500),
	CONSTRAINT "system_broadcasts_time_window" CHECK ("system_broadcasts"."expires_at" is null or "system_broadcasts"."expires_at" > "system_broadcasts"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "system_broadcasts" ADD CONSTRAINT "system_broadcasts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_broadcasts" ADD CONSTRAINT "system_broadcasts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "system_broadcasts_active_starts_idx" ON "system_broadcasts" USING btree ("starts_at") WHERE "system_broadcasts"."archived_at" is null and "system_broadcasts"."is_active" = true;--> statement-breakpoint
CREATE INDEX "system_broadcasts_created_idx" ON "system_broadcasts" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "system_broadcasts_created_by_idx" ON "system_broadcasts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "system_broadcasts_updated_by_idx" ON "system_broadcasts" USING btree ("updated_by");