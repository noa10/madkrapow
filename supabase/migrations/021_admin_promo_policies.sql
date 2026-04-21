-- Admin CRUD on promo_codes (currently only anon SELECT exists)
CREATE POLICY "admin_insert_promo_codes" ON promo_codes FOR INSERT WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);
CREATE POLICY "admin_update_promo_codes" ON promo_codes FOR UPDATE USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);
CREATE POLICY "admin_delete_promo_codes" ON promo_codes FOR DELETE USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);
