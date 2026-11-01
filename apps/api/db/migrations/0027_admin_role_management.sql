ALTER TABLE "auth_challenges" DROP CONSTRAINT "auth_challenges_purpose";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "phone_verified_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "admin_setup_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform_admin_role" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform_admin_status" text DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_purpose" CHECK ("auth_challenges"."purpose" in ('admin_login', 'admin_recovery', 'email_verify', 'admin_setup', 'admin_setup_email'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_platform_admin_role" CHECK ("users"."platform_admin_role" is null or "users"."platform_admin_role" in ('SUPER_ADMIN', 'ADMIN', 'OPERATOR'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_platform_admin_status" CHECK ("users"."platform_admin_status" in ('ACTIVE', 'PENDING_SETUP', 'SUSPENDED'));
--> statement-breakpoint
UPDATE users SET platform_admin_role = CASE WHEN phone = '+989901819085' THEN 'SUPER_ADMIN' ELSE 'ADMIN' END WHERE is_platform_admin AND deleted_at IS NULL;
--> statement-breakpoint
CREATE FUNCTION app.protect_primary_platform_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Application admins cannot mutate the root authority. Database operators retain recovery access.
  IF current_user = 'taskin_app' AND OLD.phone = '+989901819085' AND OLD.is_platform_admin THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'primary platform owner is protected' USING ERRCODE = '42501'; END IF;
    IF NOT NEW.is_platform_admin OR NEW.platform_admin_role IS DISTINCT FROM OLD.platform_admin_role
       OR NEW.platform_admin_status <> 'ACTIVE' OR NEW.status <> 'active' OR NEW.deleted_at IS NOT NULL
       OR NEW.phone <> OLD.phone OR NEW.admin_setup_required OR NEW.password_reset_required THEN
      RAISE EXCEPTION 'primary platform owner is protected' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER protect_primary_platform_owner BEFORE UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION app.protect_primary_platform_owner();
