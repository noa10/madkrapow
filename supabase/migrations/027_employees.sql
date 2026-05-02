-- Migration: Employee management with role-based access control
-- Creates employees table, RLS policies, and updates validate_admin_write()

-- 1. Create employees table
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin','manager','cashier','kitchen')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- 3. Helper: is_admin_or_manager()
CREATE OR REPLACE FUNCTION is_admin_or_manager() RETURNS BOOLEAN AS $$
BEGIN
    RETURN auth.jwt()->'app_metadata'->>'role' IN ('admin', 'manager')
        OR auth.jwt()->>'role' = 'service_role';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RLS policies for employees
CREATE POLICY "employees_select_admin_or_manager" ON employees
    FOR SELECT USING (is_admin_or_manager());

CREATE POLICY "employees_insert_admin_or_manager" ON employees
    FOR INSERT WITH CHECK (is_admin_or_manager());

CREATE POLICY "employees_update_admin_or_manager" ON employees
    FOR UPDATE USING (is_admin_or_manager());

CREATE POLICY "employees_delete_admin_or_manager" ON employees
    FOR DELETE USING (is_admin_or_manager());

-- Service role bypass
CREATE POLICY "service_role_all_employees" ON employees
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- 5. updated_at trigger
CREATE TRIGGER set_employees_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. Update validate_admin_write() to accept admin OR manager
-- This keeps backward compatibility while allowing managers to manage menu data.
-- IMPORTANT: Uses SECURITY INVOKER (default) + auth.jwt() instead of SECURITY DEFINER + current_setting.
CREATE OR REPLACE FUNCTION validate_admin_write()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT (auth.jwt()->'app_metadata'->>'role' IN ('admin', 'manager'))
       AND auth.jwt()->>'role' != 'service_role' THEN
        RAISE EXCEPTION 'Admin or manager role required for write operations on %', TG_TABLE_NAME;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Update existing RLS policies on menu/order tables to support manager where appropriate

-- categories: admin + manager can write
CREATE POLICY "admin_or_manager_all_categories" ON categories
    FOR ALL USING (is_admin_or_manager());

-- menu_items: admin + manager can write
CREATE POLICY "admin_or_manager_all_menu_items" ON menu_items
    FOR ALL USING (is_admin_or_manager());

-- modifier_groups: admin + manager can write
CREATE POLICY "admin_or_manager_all_modifier_groups" ON modifier_groups
    FOR ALL USING (is_admin_or_manager());

-- modifiers: admin + manager can write
CREATE POLICY "admin_or_manager_all_modifiers" ON modifiers
    FOR ALL USING (is_admin_or_manager());

-- menu_item_modifier_groups: admin + manager can write
CREATE POLICY "admin_or_manager_all_menu_item_modifier_groups" ON menu_item_modifier_groups
    FOR ALL USING (is_admin_or_manager());

-- store_settings: admin only (sensitive config)
CREATE POLICY "admin_all_store_settings" ON store_settings
    FOR ALL USING (
        auth.jwt()->'app_metadata'->>'role' = 'admin'
        OR auth.jwt()->>'role' = 'service_role'
    );

-- orders: admin, manager, cashier, kitchen can read/update
CREATE POLICY "staff_all_orders" ON orders
    FOR ALL USING (
        auth.jwt()->'app_metadata'->>'role' IN ('admin', 'manager', 'cashier', 'kitchen')
        OR auth.jwt()->>'role' = 'service_role'
    );

-- order_items: staff can read/update
CREATE POLICY "staff_all_order_items" ON order_items
    FOR ALL USING (
        auth.jwt()->'app_metadata'->>'role' IN ('admin', 'manager', 'cashier', 'kitchen')
        OR auth.jwt()->>'role' = 'service_role'
    );

-- order_item_modifiers: staff can read/update
CREATE POLICY "staff_all_order_item_modifiers" ON order_item_modifiers
    FOR ALL USING (
        auth.jwt()->'app_metadata'->>'role' IN ('admin', 'manager', 'cashier', 'kitchen')
        OR auth.jwt()->>'role' = 'service_role'
    );

-- promo_codes: admin only
CREATE POLICY "admin_all_promo_codes" ON promo_codes
    FOR ALL USING (
        auth.jwt()->'app_metadata'->>'role' = 'admin'
        OR auth.jwt()->>'role' = 'service_role'
    );

-- customers: admin + manager can read; service role can all
CREATE POLICY "admin_or_manager_select_customers" ON customers
    FOR SELECT USING (is_admin_or_manager());

-- customer_addresses: admin + manager can read; service role can all
CREATE POLICY "admin_or_manager_select_customer_addresses" ON customer_addresses
    FOR SELECT USING (is_admin_or_manager());

-- order_events: staff can all
CREATE POLICY "staff_all_order_events" ON order_events
    FOR ALL USING (
        auth.jwt()->'app_metadata'->>'role' IN ('admin', 'manager', 'cashier', 'kitchen')
        OR auth.jwt()->>'role' = 'service_role'
    );
