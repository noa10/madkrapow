-- Test Environment Seed Data
-- This file is used for E2E testing with test data

-- Insert test user
INSERT INTO customers (id, email, phone, name, created_at)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'test@example.com', '+60123456789', 'Test User', NOW())
ON CONFLICT (id) DO NOTHING;

-- Insert test order
INSERT INTO orders (id, customer_id, status, total_cents, delivery_address, delivery_fee_cents, created_at)
VALUES 
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'pending', 3000, '123 Test Street, Test City, 80000', 0, NOW())
ON CONFLICT (id) DO NOTHING;

-- Insert test order items
INSERT INTO order_items (id, order_id, menu_item_id, quantity, unit_price_cents, modifiers, special_instructions, created_at)
VALUES 
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'menu0001-0000-0000-0000-000000000001', 2, 1450, '{"spice_level": "Medium", "protein": "Chicken"}', 'No chili please', NOW())
ON CONFLICT (id) DO NOTHING;
