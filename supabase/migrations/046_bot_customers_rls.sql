-- Add RLS policy to allow service_role to read bot customers by platform ID
-- This is needed because bot customers have auth_user_id = NULL and bypass Supabase auth

CREATE POLICY "service_role_can_read_bot_customers" ON public.customers
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "service_role_can_insert_bot_customers" ON public.customers
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service_role_can_update_bot_customers" ON public.customers
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);