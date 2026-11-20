-- Additive only; no existing records or policies changed.
ALTER TABLE checkout_orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE checkout_orders FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY checkout_orders_tenant ON checkout_orders
USING (workspace_id = (SELECT app.current_workspace_id()))
WITH CHECK (workspace_id = (SELECT app.current_workspace_id()));
--> statement-breakpoint
CREATE TRIGGER coupons_touch_updated_at BEFORE UPDATE ON coupons FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER plan_prices_touch_updated_at BEFORE UPDATE ON plan_prices FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
-- Coupon capacity is platform-wide. coupon_reservations deliberately has no tenant key.
REVOKE DELETE, TRUNCATE ON coupons, coupon_plans, coupon_reservations, plan_prices, checkout_orders FROM taskin_app;
--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'taskin_platform_admin') THEN
  GRANT SELECT ON coupons, coupon_plans, plan_prices TO taskin_platform_admin;
 END IF;
END $$;
