-- Migration 028: Marketing Manager System (Phase 1 + Phase 2 schema)
-- Adds promo scope, application_type, rules engine, and campaigns table

-- ──────────────────────────────────────────────────────
-- 1. Extend promo_codes table (Phase 1 + Phase 2 ready)
-- ──────────────────────────────────────────────────────

ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'order'
  CHECK (scope IN ('order', 'delivery', 'item', 'free_item', 'bundle'));

ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS application_type TEXT NOT NULL DEFAULT 'code'
  CHECK (application_type IN ('auto', 'code'));

-- rules JSONB stores promo-type-specific configuration
-- Phase 1: can store conditions like { min_items: 2, applicable_item_ids: [...] }
-- Phase 2: will store bundle components, BOGO triggers, etc.
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS rules JSONB DEFAULT '{}';

ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS max_discount_cents INTEGER;

-- Case-insensitive unique constraint on promo codes
DROP INDEX IF EXISTS promo_codes_code_unique_ci;
CREATE UNIQUE INDEX promo_codes_code_unique_ci ON promo_codes (LOWER(code));

-- ──────────────────────────────────────────────────────
-- 2. Create campaigns table (groups promos for management)
-- ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Link promo_codes to campaigns (optional — a promo can exist without a campaign)
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS campaign_id UUID
  REFERENCES campaigns(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────
-- 3. Create promo_items table (Phase 2: item-level promos, BOGO, bundles)
-- ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS promo_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'target'
      CHECK (role IN ('target', 'free', 'bundle_component')),
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Prevent duplicate promo+item+role combinations
    UNIQUE (promo_id, menu_item_id, role)
);

-- Phase 2 only — enable RLS now so the table is secure from the start
ALTER TABLE promo_items ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────
-- 4. Link orders to promos
-- ──────────────────────────────────────────────────────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code_id UUID
  REFERENCES promo_codes(id) ON DELETE SET NULL;

-- Track individual promo applications per order (for stacking analytics)
CREATE TABLE IF NOT EXISTS order_promo_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    promo_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE RESTRICT,
    scope TEXT NOT NULL CHECK (scope IN ('order', 'delivery', 'item', 'free_item', 'bundle')),
    discount_cents INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE order_promo_applications ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────
-- 5. Update RLS policies for promo_codes (include manager)
-- ──────────────────────────────────────────────────────

-- Drop the old admin-only policies
DROP POLICY IF EXISTS "admin_insert_promo_codes" ON promo_codes;
DROP POLICY IF EXISTS "admin_update_promo_codes" ON promo_codes;
DROP POLICY IF EXISTS "admin_delete_promo_codes" ON promo_codes;
DROP POLICY IF EXISTS "admin_all_promo_codes" ON promo_codes;

-- Admin + manager can manage promos
CREATE POLICY "admin_or_manager_all_promo_codes" ON promo_codes
    FOR ALL USING (
        auth.jwt()->'app_metadata'->>'role' IN ('admin', 'manager')
        OR auth.jwt()->>'role' = 'service_role'
    );

-- ──────────────────────────────────────────────────────
-- 7. RLS policies for campaigns
-- ──────────────────────────────────────────────────────

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_or_manager_all_campaigns" ON campaigns
    FOR ALL USING (
        auth.jwt()->'app_metadata'->>'role' IN ('admin', 'manager')
        OR auth.jwt()->>'role' = 'service_role'
    );

-- ──────────────────────────────────────────────────────
-- 8. RLS policies for order_promo_applications
-- ──────────────────────────────────────────────────────

-- Staff can read; service_role can write (via API)
CREATE POLICY "staff_select_order_promo_applications" ON order_promo_applications
    FOR SELECT USING (
        auth.jwt()->'app_metadata'->>'role' IN ('admin', 'manager', 'cashier', 'kitchen')
        OR auth.jwt()->>'role' = 'service_role'
    );

CREATE POLICY "service_role_insert_order_promo_applications" ON order_promo_applications
    FOR INSERT WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- ──────────────────────────────────────────────────────
-- 9. RPC: atomically increment promo usage
-- ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_promo_code_usage(
    p_promo_id UUID,
    p_increment INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
    v_max_uses INTEGER;
    v_current_uses INTEGER;
BEGIN
    SELECT max_uses, current_uses INTO v_max_uses, v_current_uses
    FROM promo_codes
    WHERE id = p_promo_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_max_uses IS NOT NULL AND v_current_uses + p_increment > v_max_uses THEN
        RETURN FALSE;
    END IF;

    UPDATE promo_codes
    SET current_uses = current_uses + p_increment
    WHERE id = p_promo_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
