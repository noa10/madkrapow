-- Authenticated users can manage their own customer profile row
CREATE POLICY "auth_select_own_customers" ON customers FOR SELECT USING (
    auth.uid() = auth_user_id
);

CREATE POLICY "auth_insert_own_customers" ON customers FOR INSERT WITH CHECK (
    auth.uid() = auth_user_id
);

CREATE POLICY "auth_update_own_customers" ON customers FOR UPDATE
USING (auth.uid() = auth_user_id)
WITH CHECK (auth.uid() = auth_user_id);
