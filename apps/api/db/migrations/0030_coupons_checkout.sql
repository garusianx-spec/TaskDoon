CREATE TYPE "public"."billing_period" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."checkout_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TYPE "public"."coupon_discount_type" AS ENUM('PERCENTAGE', 'FIXED_AMOUNT');--> statement-breakpoint
CREATE TABLE "checkout_orders" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"period" "billing_period" NOT NULL,
	"coupon_id" uuid,
	"coupon_code" text DEFAULT '' NOT NULL,
	"subtotal" bigint NOT NULL,
	"discount" bigint NOT NULL,
	"total" bigint NOT NULL,
	"status" "checkout_status" DEFAULT 'pending' NOT NULL,
	"reservation_expires_at" timestamp with time zone NOT NULL,
	"payment_reference" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_orders_paymentReference_unique" UNIQUE("payment_reference"),
	CONSTRAINT "checkout_orders_command_uq" UNIQUE("workspace_id","user_id","command_id"),
	CONSTRAINT "checkout_orders_amount_ck" CHECK ("checkout_orders"."subtotal" between 0 and 1000000000000 and "checkout_orders"."discount" between 0 and "checkout_orders"."subtotal" and "checkout_orders"."total" = "checkout_orders"."subtotal" - "checkout_orders"."discount"),
	CONSTRAINT "checkout_orders_payment_ck" CHECK (("checkout_orders"."status" = 'pending' and "checkout_orders"."payment_reference" is null and "checkout_orders"."paid_at" is null) or ("checkout_orders"."status" = 'paid' and "checkout_orders"."payment_reference" is not null and "checkout_orders"."paid_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "coupon_plans" (
	"coupon_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	CONSTRAINT "coupon_plans_coupon_id_plan_id_pk" PRIMARY KEY("coupon_id","plan_id")
);
--> statement-breakpoint
CREATE TABLE "coupon_reservations" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"coupon_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT app.uuidv7() NOT NULL,
	"code" text NOT NULL,
	"discount_type" "coupon_discount_type" NOT NULL,
	"discount_value" bigint NOT NULL,
	"max_discount_amount" bigint,
	"min_order_amount" bigint DEFAULT 0 NOT NULL,
	"usage_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code"),
	CONSTRAINT "coupons_code_ck" CHECK ("coupons"."code" ~ '^[A-Z0-9]{3,40}$'),
	CONSTRAINT "coupons_value_ck" CHECK ("coupons"."discount_value" between 1 and 1000000000000 and ("coupons"."discount_type" <> 'PERCENTAGE' or "coupons"."discount_value" <= 100)),
	CONSTRAINT "coupons_amount_ck" CHECK ("coupons"."min_order_amount" between 0 and 1000000000000 and ("coupons"."max_discount_amount" is null or ("coupons"."discount_type" = 'PERCENTAGE' and "coupons"."max_discount_amount" between 0 and 1000000000000))),
	CONSTRAINT "coupons_usage_ck" CHECK ("coupons"."used_count" >= 0 and ("coupons"."usage_limit" is null or ("coupons"."usage_limit" > 0 and "coupons"."used_count" <= "coupons"."usage_limit")))
);
--> statement-breakpoint
CREATE TABLE "plan_prices" (
	"plan_id" text NOT NULL,
	"period" "billing_period" NOT NULL,
	"amount_toman" bigint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_prices_plan_id_period_pk" PRIMARY KEY("plan_id","period"),
	CONSTRAINT "plan_prices_amount_ck" CHECK ("plan_prices"."amount_toman" between 0 and 1000000000000)
);
--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_plan_id_period_plan_prices_plan_id_period_fk" FOREIGN KEY ("plan_id","period") REFERENCES "public"."plan_prices"("plan_id","period") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_plans" ADD CONSTRAINT "coupon_plans_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_plans" ADD CONSTRAINT "coupon_plans_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_reservations" ADD CONSTRAINT "coupon_reservations_order_id_checkout_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."checkout_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_reservations" ADD CONSTRAINT "coupon_reservations_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkout_orders_reservations_idx" ON "checkout_orders" USING btree ("coupon_id","reservation_expires_at") WHERE "checkout_orders"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "checkout_orders_workspace_idx" ON "checkout_orders" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "coupon_reservations_available_idx" ON "coupon_reservations" USING btree ("coupon_id","expires_at") WHERE "coupon_reservations"."consumed_at" is null;--> statement-breakpoint
CREATE INDEX "coupons_created_idx" ON "coupons" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint