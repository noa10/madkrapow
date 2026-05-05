-- RLS policies for promo_items (table was RLS-enabled in 028 but had zero policies)
-- Mirrors the promo_codes policy pattern

-- Public read access for promo_items (needed by web API routes that join promo_items)
DROP POLICY IF EXISTS "anon_select_promo_items" ON promo_items;
CREATE POLICY "anon_select_promo_items"
  ON promo_items FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "admin_or_manager_all_promo_items" ON promo_items;
CREATE POLICY "admin_or_manager_all_promo_items"
  ON promo_items FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'manager')
    OR (auth.jwt() ->> 'role') = 'service_role'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'manager')
    OR (auth.jwt() ->> 'role') = 'service_role'
  );

DROP POLICY IF EXISTS "service_role_all_promo_items" ON promo_items;
CREATE POLICY "service_role_all_promo_items"
  ON promo_items FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
