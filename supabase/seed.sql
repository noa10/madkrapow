-- Mad Krapow Seed Data
-- Restaurant: Mad Krapow TTDI Jaya

-- 1. Store Settings
INSERT INTO store_settings (id, store_name, address, phone, operating_hours, lalamove_market, min_order_amount, delivery_fee)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Mad Krapow TTDI Jaya',
    'No. 5, Jalan TTDI Jaya 1, Taman TTDI Jaya, 81200 Johor Bahru, Johor',
    '+60 7-123 4567',
    '{"mon": {"open": "11:00", "close": "22:00"}, "tue": {"open": "11:00", "close": "22:00"}, "wed": {"open": "11:00", "close": "22:00"}, "thu": {"open": "11:00", "close": "22:00"}, "fri": {"open": "11:00", "close": "23:00"}, "sat": {"open": "11:00", "close": "23:00"}, "sun": {"open": "11:00", "close": "22:00"}}'::jsonb,
    'MY',
    2000,
    0
);

-- 2. Categories
INSERT INTO categories (id, name, description, sort_order) VALUES
('c0000001-0000-0000-0000-000000000001', 'Rice Dishes', 'Thai rice-based dishes with authentic flavors', 1),
('c0000001-0000-0000-0000-000000000002', 'Noodles', 'Traditional Thai noodle dishes', 2),
('c0000001-0000-0000-0000-000000000003', 'Soups', 'Hot and flavorful Thai soups', 3),
('c0000001-0000-0000-0000-000000000004', 'Appetizers', 'Start your meal right', 4),
('c0000001-0000-0000-0000-000000000005', 'Drinks', 'Refreshing Thai beverages', 5),
('c0000001-0000-0000-0000-000000000006', 'Desserts', 'Sweet endings', 6);

-- 3. Modifier Groups
INSERT INTO modifier_groups (id, name, description, min_selections, max_selections, sort_order) VALUES
('m0000001-0000-0000-0000-000000000001', 'Spice Level', 'Choose your preferred spice level', 1, 1, 1),
('m0000001-0000-0000-0000-000000000002', 'Protein', 'Select your protein', 1, 1, 2),
('m0000001-0000-0000-0000-000000000003', 'Add-ons', 'Extra toppings and sides', 0, 5, 3),
('m0000001-0000-0000-0000-000000000004', 'Rice Type', 'Choose your rice preference', 0, 1, 4),
('m0000001-0000-0000-0000-000000000005', 'Noodle Type', 'Select your noodle type', 1, 1, 5),
('m0000001-0000-0000-0000-000000000006', 'Drink Sweetness', 'Adjust sweetness level', 0, 1, 6);

-- 4. Modifiers
-- Spice Level
INSERT INTO modifiers (id, modifier_group_id, name, price_delta_cents, is_default, sort_order) VALUES
('mod00001-0000-0000-0000-000000000001', 'm0000001-0000-0000-0000-000000000001', 'No Spice', 0, false, 1),
('mod00001-0000-0000-0000-000000000002', 'm0000001-0000-0000-0000-000000000001', 'Mild', 0, false, 2),
('mod00001-0000-0000-0000-000000000003', 'm0000001-0000-0000-0000-000000000001', 'Medium', 0, true, 3),
('mod00001-0000-0000-0000-000000000004', 'm0000001-0000-0000-0000-000000000001', 'Spicy', 0, false, 4),
('mod00001-0000-0000-0000-000000000005', 'm0000001-0000-0000-0000-000000000001', 'Extra Spicy', 0, false, 5);

-- Protein
INSERT INTO modifiers (id, modifier_group_id, name, price_delta_cents, is_default, sort_order) VALUES
('mod00001-0000-0000-0000-000000000010', 'm0000001-0000-0000-0000-000000000002', 'Chicken', 0, true, 1),
('mod00001-0000-0000-0000-000000000011', 'm0000001-0000-0000-0000-000000000002', 'Pork', 0, false, 2),
('mod00001-0000-0000-0000-000000000012', 'm0000001-0000-0000-0000-000000000002', 'Beef', 200, false, 3),
('mod00001-0000-0000-0000-000000000013', 'm0000001-0000-0000-0000-000000000002', 'Shrimp', 300, false, 4),
('mod00001-0000-0000-0000-000000000014', 'm0000001-0000-0000-0000-000000000002', 'Tofu', 0, false, 5);

-- Add-ons
INSERT INTO modifiers (id, modifier_group_id, name, price_delta_cents, is_default, sort_order) VALUES
('mod00001-0000-0000-0000-000000000020', 'm0000001-0000-0000-0000-000000000003', 'Extra Fried Egg', 200, false, 1),
('mod00001-0000-0000-0000-000000000021', 'm0000001-0000-0000-0000-000000000003', 'Extra Chili', 0, false, 2),
('mod00001-0000-0000-0000-000000000022', 'm0000001-0000-0000-0000-000000000003', 'Extra Basil', 100, false, 3),
('mod00001-0000-0000-0000-000000000023', 'm0000001-0000-0000-0000-000000000003', 'Crispy Pork', 400, false, 4),
('mod00001-0000-0000-0000-000000000024', 'm0000001-0000-0000-0000-000000000003', 'Sticky Rice', 200, false, 5),
('mod00001-0000-0000-0000-000000000025', 'm0000001-0000-0000-0000-000000000003', 'Som Tum (Papaya Salad)', 500, false, 6);

-- Rice Type
INSERT INTO modifiers (id, modifier_group_id, name, price_delta_cents, is_default, sort_order) VALUES
('mod00001-0000-0000-0000-000000000030', 'm0000001-0000-0000-0000-000000000004', 'Steamed Rice', 0, true, 1),
('mod00001-0000-0000-0000-000000000031', 'm0000001-0000-0000-0000-000000000004', 'Egg Fried Rice', 300, false, 2),
('mod00001-0000-0000-0000-000000000032', 'm0000001-0000-0000-0000-000000000004', 'Brown Rice', 200, false, 3);

-- Noodle Type
INSERT INTO modifiers (id, modifier_group_id, name, price_delta_cents, is_default, sort_order) VALUES
('mod00001-0000-0000-0000-000000000040', 'm0000001-0000-0000-0000-000000000005', 'Rice Noodles', 0, true, 1),
('mod00001-0000-0000-0000-000000000041', 'm0000001-0000-0000-0000-000000000005', 'Egg Noodles', 0, false, 2),
('mod00001-0000-0000-0000-000000000042', 'm0000001-0000-0000-0000-000000000005', 'Glass Noodles', 0, false, 3),
('mod00001-0000-0000-0000-000000000043', 'm0000001-0000-0000-0000-000000000005', 'Instant Noodles', -100, false, 4);

-- Drink Sweetness
INSERT INTO modifiers (id, modifier_group_id, name, price_delta_cents, is_default, sort_order) VALUES
('mod00001-0000-0000-0000-000000000050', 'm0000001-0000-0000-0000-000000000006', '100% Sweet', 0, false, 1),
('mod00001-0000-0000-0000-000000000051', 'm0000001-0000-0000-0000-000000000006', '70% Sweet', 0, true, 2),
('mod00001-0000-0000-0000-000000000052', 'm0000001-0000-0000-0000-000000000006', '50% Sweet', 0, false, 3),
('mod00001-0000-0000-0000-000000000053', 'm0000001-0000-0000-0000-000000000006', '30% Sweet', 0, false, 4),
('mod00001-0000-0000-0000-000000000054', 'm0000001-0000-0000-0000-000000000006', 'No Sugar', 0, false, 5);

-- 5. Menu Items
-- Rice Dishes (Category c0000001-0000-0000-0000-000000000001)
INSERT INTO menu_items (id, category_id, name, description, price_cents, sort_order) VALUES
('menu0001-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000001', 'Pad Kra Pao', 'Stir-fried holy basil with chili, garlic, and your choice of protein served with steamed rice', 1450, 1),
('menu0001-0000-0000-0000-000000000002', 'c0000001-0000-0000-0000-000000000001', 'Pad Thai', 'Classic Thai stir-fried rice noodles with tamarind sauce, peanuts, and bean sprouts', 1550, 2),
('menu0001-0000-0000-0000-000000000003', 'c0000001-0000-0000-0000-000000000001', 'Khao Pad', 'Thai fried rice with egg, tomato, and your choice of protein', 1350, 3),
('menu0001-0000-0000-0000-000000000004', 'c0000001-0000-0000-0000-000000000001', 'Khao Man Gai', 'Thai chicken rice with tender chicken and flavorful broth', 1450, 4),
('menu0001-0000-0000-0000-000000000005', 'c0000001-0000-0000-0000-000000000001', 'Khao Soi', 'Northern Thai curry noodles with coconut milk, crispy noodles on top', 1650, 5);

-- Noodles (Category c0000001-0000-0000-0000-000000000002)
INSERT INTO menu_items (id, category_id, name, description, price_cents, sort_order) VALUES
('menu0001-0000-0000-0000-000000000010', 'c0000001-0000-0000-0000-000000000002', 'Pad See Ew', 'Wide rice noodles stir-fried with soy sauce, egg, and vegetables', 1450, 1),
('menu0001-0000-0000-0000-000000000011', 'c0000001-0000-0000-0000-000000000002', 'Pad Kee Mao', 'Drunken noodles - spicy stir-fried noodles with holy basil', 1450, 2),
('menu0001-0000-0000-0000-000000000012', 'c0000001-0000-0000-0000-000000000002', 'Guay Tiew Reua', 'Boat noodles - rich beef broth with rice noodles', 1350, 3),
('menu0001-0000-0000-0000-000000000013', 'c0000001-0000-0000-0000-000000000002', 'Tom Yum Noodles', 'Hot and sour soup with noodles', 1400, 4),
('menu0001-0000-0000-0000-000000000014', 'c0000001-0000-0000-0000-000000000002', 'Glass Noodle Salad', 'Cold glass noodle salad with spicy lime dressing', 1200, 5);

-- Soups (Category c0000001-0000-0000-0000-000000000003)
INSERT INTO menu_items (id, category_id, name, description, price_cents, sort_order) VALUES
('menu0001-0000-0000-0000-000000000020', 'c0000001-0000-0000-0000-000000000003', 'Tom Yum', 'Hot and sour soup with lemongrass, galangal, mushrooms, and shrimp', 1200, 1),
('menu0001-0000-0000-0000-000000000021', 'c0000001-0000-0000-0000-000000000003', 'Tom Kha', 'Coconut milk soup with galangal, lemongrass, and mushrooms', 1200, 2),
('menu0001-0000-0000-0000-000000000022', 'c0000001-0000-0000-0000-000000000003', 'Gaeng Jued Woonsen', 'Clear soup with glass noodles and ground pork', 1000, 3);

-- Appetizers (Category c0000001-0000-0000-0000-000000000004)
INSERT INTO menu_items (id, category_id, name, description, price_cents, sort_order) VALUES
('menu0001-0000-0000-0000-000000000030', 'c0000001-0000-0000-0000-000000000004', 'Som Tum', 'Green papaya salad with tomatoes, beans, peanuts, and dried shrimp', 1000, 1),
('menu0001-0000-0000-0000-000000000031', 'c0000001-0000-0000-0000-000000000004', 'Gai Yang', 'Grilled Thai chicken with spicy dipping sauce', 1500, 2),
('menu0001-0000-0000-0000-000000000032', 'c0000001-0000-0000-0000-000000000004', 'Moo Ping', 'Grilled pork skewers with Thai herbs', 1200, 3),
('menu0001-0000-0000-0000-000000000033', 'c0000001-0000-0000-0000-000000000004', 'Tod Man Pla', 'Thai fish cakes with cucumber sauce', 1100, 4),
('menu0001-0000-0000-0000-000000000034', 'c0000001-0000-0000-0000-000000000004', 'Kung Pao', 'Fried shrimp cakes with sweet chili sauce', 1300, 5);

-- Drinks (Category c0000001-0000-0000-0000-000000000005)
INSERT INTO menu_items (id, category_id, name, description, price_cents, sort_order) VALUES
('menu0001-0000-0000-0000-000000000040', 'c0000001-0000-0000-0000-000000000005', 'Thai Iced Tea', 'Sweet Thai tea with condensed milk', 650, 1),
('menu0001-0000-0000-0000-000000000041', 'c0000001-0000-0000-0000-000000000005', 'Thai Iced Coffee', 'Sweet Thai coffee over ice', 650, 2),
('menu0001-0000-0000-0000-000000000042', 'c0000001-0000-0000-0000-000000000005', 'Fresh Coconut Water', 'Fresh young coconut', 800, 3),
('menu0001-0000-0000-0000-000000000043', 'c0000001-0000-0000-0000-000000000005', 'Lemongrass Tea', 'Refreshing lemongrass herbal tea', 500, 4);

-- Desserts (Category c0000001-0000-0000-0000-000000000006)
INSERT INTO menu_items (id, category_id, name, description, price_cents, sort_order) VALUES
('menu0001-0000-0000-0000-000000000050', 'c0000001-0000-0000-0000-000000000006', 'Khao Niao Mamuang', 'Mango sticky rice', 1000, 1),
('menu0001-0000-0000-0000-000000000051', 'c0000001-0000-0000-0000-000000000006', 'Khao Tom', 'Sweet rice soup with coconut milk', 600, 2),
('menu0001-0000-0000-0000-000000000052', 'c0000001-0000-0000-0000-000000000006', 'Ice Cream', 'Thai coconut or mango ice cream', 500, 3);

-- 6. Menu Item Modifier Groups (Join Table)
-- Rice Dishes have: Spice Level, Protein, Add-ons, Rice Type
INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES
('menu0001-0000-0000-0000-000000000001', 'm0000001-0000-0000-0000-000000000001', true),
('menu0001-0000-0000-0000-000000000001', 'm0000001-0000-0000-0000-000000000002', true),
('menu0001-0000-0000-0000-000000000001', 'm0000001-0000-0000-0000-000000000003', false),
('menu0001-0000-0000-0000-000000000001', 'm0000001-0000-0000-0000-000000000004', false),
('menu0001-0000-0000-0000-000000000002', 'm0000001-0000-0000-0000-000000000001', true),
('menu0001-0000-0000-0000-000000000002', 'm0000001-0000-0000-0000-000000000002', true),
('menu0001-0000-0000-0000-000000000002', 'm0000001-0000-0000-0000-000000000003', false),
('menu0001-0000-0000-0000-000000000003', 'm0000001-0000-0000-0000-000000000001', true),
('menu0001-0000-0000-0000-000000000003', 'm0000001-0000-0000-0000-000000000002', true),
('menu0001-0000-0000-0000-000000000003', 'm0000001-0000-0000-0000-000000000003', false),
('menu0001-0000-0000-0000-000000000004', 'm0000001-0000-0000-0000-000000000003', false),
('menu0001-0000-0000-0000-000000000005', 'm0000001-0000-0000-0000-000000000001', true),
('menu0001-0000-0000-0000-000000000005', 'm0000001-0000-0000-0000-000000000002', true);

-- Noodles have: Spice Level, Protein, Add-ons, Noodle Type
INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES
('menu0001-0000-0000-0000-000000000010', 'm0000001-0000-0000-0000-000000000001', true),
('menu0001-0000-0000-0000-000000000010', 'm0000001-0000-0000-0000-000000000002', true),
('menu0001-0000-0000-0000-000000000010', 'm0000001-0000-0000-0000-000000000003', false),
('menu0001-0000-0000-0000-000000000010', 'm0000001-0000-0000-0000-000000000005', true),
('menu0001-0000-0000-0000-000000000011', 'm0000001-0000-0000-0000-000000000001', true),
('menu0001-0000-0000-0000-000000000011', 'm0000001-0000-0000-0000-000000000002', true),
('menu0001-0000-0000-0000-000000000011', 'm0000001-0000-0000-0000-000000000003', false),
('menu0001-0000-0000-0000-000000000011', 'm0000001-0000-0000-0000-000000000005', true),
('menu0001-0000-0000-0000-000000000012', 'm0000001-0000-0000-0000-000000000003', false),
('menu0001-0000-0000-0000-000000000013', 'm0000001-0000-0000-0000-000000000005', true),
('menu0001-0000-0000-0000-000000000014', 'm0000001-0000-0000-0000-000000000001', true);

-- Soups have: Spice Level, Protein
INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES
('menu0001-0000-0000-0000-000000000020', 'm0000001-0000-0000-0000-000000000001', true),
('menu0001-0000-0000-0000-000000000021', 'm0000001-0000-0000-0000-000000000001', true),
('menu0001-0000-0000-0000-000000000022', 'm0000001-0000-0000-0000-000000000003', false);

-- Appetizers have: Spice Level, Add-ons
INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES
('menu0001-0000-0000-0000-000000000030', 'm0000001-0000-0000-0000-000000000001', true),
('menu0001-0000-0000-0000-000000000031', 'm0000001-0000-0000-0000-000000000003', false),
('menu0001-0000-0000-0000-000000000032', 'm0000001-0000-0000-0000-000000000003', false),
('menu0001-0000-0000-0000-000000000033', 'm0000001-0000-0000-0000-000000000001', true),
('menu0001-0000-0000-0000-000000000034', 'm0000001-0000-0000-0000-000000000001', true);

-- Drinks have: Sweetness
INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES
('menu0001-0000-0000-0000-000000000040', 'm0000001-0000-0000-0000-000000000006', false),
('menu0001-0000-0000-0000-000000000041', 'm0000001-0000-0000-0000-000000000006', false);

-- Desserts have no modifiers
