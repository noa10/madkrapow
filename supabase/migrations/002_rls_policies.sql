-- Enable Row Level Security on all tables
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

-- Anonymous users can SELECT on menu tables
CREATE POLICY "anon_select_store_settings" ON store_settings FOR SELECT USING (true);
CREATE POLICY "anon_select_categories" ON categories FOR SELECT USING (true);
CREATE POLICY "anon_select_menu_items" ON menu_items FOR SELECT USING (true);
CREATE POLICY "anon_select_modifier_groups" ON modifier_groups FOR SELECT USING (true);
CREATE POLICY "anon_select_modifiers" ON modifiers FOR SELECT USING (true);
CREATE POLICY "anon_select_menu_item_modifier_groups" ON menu_item_modifier_groups FOR SELECT USING (true);
CREATE POLICY "anon_select_promo_codes" ON promo_codes FOR SELECT USING (true);

-- Authenticated users can SELECT their own orders
CREATE POLICY "auth_select_own_orders" ON orders FOR SELECT USING (
    auth.uid() IN (SELECT auth_user_id FROM customers WHERE id = customer_id)
);

-- Authenticated users can INSERT orders
CREATE POLICY "auth_insert_orders" ON orders FOR INSERT WITH CHECK (true);

-- Authenticated users can manage their own customer_addresses
CREATE POLICY "auth_select_own_customer_addresses" ON customer_addresses FOR SELECT USING (
    auth.uid() IN (SELECT auth_user_id FROM customers WHERE id = customer_id)
);
CREATE POLICY "auth_insert_own_customer_addresses" ON customer_addresses FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT auth_user_id FROM customers WHERE id = customer_id)
);
CREATE POLICY "auth_update_own_customer_addresses" ON customer_addresses FOR UPDATE USING (
    auth.uid() IN (SELECT auth_user_id FROM customers WHERE id = customer_id)
);
CREATE POLICY "auth_delete_own_customer_addresses" ON customer_addresses FOR DELETE USING (
    auth.uid() IN (SELECT auth_user_id FROM customers WHERE id = customer_id)
);

-- Service role bypasses all RLS
CREATE POLICY "service_role_all_store_settings" ON store_settings FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_all_categories" ON categories FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_all_menu_items" ON menu_items FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_all_modifier_groups" ON modifier_groups FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_all_modifiers" ON modifiers FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_all_menu_item_modifier_groups" ON menu_item_modifier_groups FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_all_customers" ON customers FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_all_customer_addresses" ON customer_addresses FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_all_orders" ON orders FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_all_order_items" ON order_items FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_all_order_item_modifiers" ON order_item_modifiers FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_all_promo_codes" ON promo_codes FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
