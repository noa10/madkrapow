-- RLS policies for promo_items (table was RLS-enabled in 028 but had zero policies)
-- Mirrors the promo_codes policy pattern

-- Public read access for promo_items (needed by web API routes that join promo_items)
CREATE POLICY "anon_select_promo_items"
  ON promo_items FOR SELECT
  USING (true);

-- Admin and manager full access (merchant app CRUD)
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

-- Service role full access
CREATE POLICY "service_role_all_promo_items"
  ON promo_items FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
