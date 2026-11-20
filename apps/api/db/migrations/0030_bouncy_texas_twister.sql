ALTER TABLE "invitations" ADD COLUMN "sms_attempts" jsonb;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "sms_link_sealed" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_sms_attempts_array" CHECK ("invitations"."sms_attempts" IS NULL OR jsonb_typeof("invitations"."sms_attempts") = 'array');