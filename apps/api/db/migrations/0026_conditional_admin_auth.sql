CREATE TABLE "auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"security_version" integer NOT NULL,
	"email" "citext",
	"parent_hash" "bytea",
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_challenges_token_hash_uq" UNIQUE("token_hash"),
	CONSTRAINT "auth_challenges_purpose" CHECK ("auth_challenges"."purpose" in ('admin_login', 'admin_recovery', 'email_verify'))
);
--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_challenges_user_idx" ON "auth_challenges" USING btree ("user_id");