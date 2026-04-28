-- Enable Row Level Security on customer_contacts
ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage their own customer_contacts
CREATE POLICY "auth_select_own_customer_contacts" ON customer_contacts FOR SELECT USING (
    auth.uid() IN (SELECT auth_user_id FROM customers WHERE id = customer_id)
);
CREATE POLICY "auth_insert_own_customer_contacts" ON customer_contacts FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT auth_user_id FROM customers WHERE id = customer_id)
);
CREATE POLICY "auth_update_own_customer_contacts" ON customer_contacts FOR UPDATE USING (
    auth.uid() IN (SELECT auth_user_id FROM customers WHERE id = customer_id)
);
CREATE POLICY "auth_delete_own_customer_contacts" ON customer_contacts FOR DELETE USING (
    auth.uid() IN (SELECT auth_user_id FROM customers WHERE id = customer_id)
);

-- Service role bypasses all RLS
CREATE POLICY "service_role_all_customer_contacts" ON customer_contacts FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
