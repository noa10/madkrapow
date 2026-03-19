-- RLS policies for authenticated users to manage admin tables
-- The frontend useAdminGuard already restricts admin access,
-- these policies allow the browser client (with user JWT) to modify data.

-- modifier_groups
CREATE POLICY "auth_insert_modifier_groups" ON modifier_groups FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_modifier_groups" ON modifier_groups FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_modifier_groups" ON modifier_groups FOR DELETE USING (auth.uid() IS NOT NULL);

-- modifiers
CREATE POLICY "auth_insert_modifiers" ON modifiers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_modifiers" ON modifiers FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_modifiers" ON modifiers FOR DELETE USING (auth.uid() IS NOT NULL);

-- menu_items
CREATE POLICY "auth_insert_menu_items" ON menu_items FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_menu_items" ON menu_items FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_menu_items" ON menu_items FOR DELETE USING (auth.uid() IS NOT NULL);

-- categories
CREATE POLICY "auth_insert_categories" ON categories FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_categories" ON categories FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_categories" ON categories FOR DELETE USING (auth.uid() IS NOT NULL);

-- menu_item_modifier_groups
CREATE POLICY "auth_insert_menu_item_modifier_groups" ON menu_item_modifier_groups FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_menu_item_modifier_groups" ON menu_item_modifier_groups FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_menu_item_modifier_groups" ON menu_item_modifier_groups FOR DELETE USING (auth.uid() IS NOT NULL);

-- store_settings
CREATE POLICY "auth_update_store_settings" ON store_settings FOR UPDATE USING (auth.uid() IS NOT NULL);
