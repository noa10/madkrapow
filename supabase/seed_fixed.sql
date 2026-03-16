-- Mad Krapow Seed Data (Fixed UUIDs)
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

-- 3. Modifier Groups (using proper UUIDs)
INSERT INTO modifier_groups (id, name, description, min_selections, max_selections, sort_order) VALUES
('11111111-1111-1111-1111-111111111101', 'Spice Level', 'Choose your preferred spice level', 1, 1, 1),
('11111111-1111-1111-1111-111111111102', 'Protein', 'Select your protein', 1, 1, 2),
('11111111-1111-1111-1111-111111111103', 'Add-ons', 'Extra toppings and sides', 0, 5, 3),
('11111111-1111-1111-1111-111111111104', 'Rice Type', 'Choose your rice preference', 0, 1, 4),
('11111111-1111-1111-1111-111111111105', 'Noodle Type', 'Select your noodle type', 1, 1, 5),
('11111111-1111-1111-1111-111111111106', 'Drink Sweetness', 'Adjust sweetness level', 0, 1, 6);

-- 4. Modifiers (using proper UUIDs)
-- Spice Level
INSERT INTO modifiers (id, modifier_group_id, name, price_delta_cents, is_default, sort_order) VALUES
('21111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111101', 'No Spice', 0, false, 1),
('21111111-1111-1111-1111-111111111102', '11111111-1111-1111-1111-111111111101', 'Mild', 0, false, 2),
('21111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111101', 'Medium', 0, true, 3),
('21111111-1111-1111-1111-111111111104', '11111111-1111-1111-1111-111111111101', 'Spicy', 0, false, 4),
('21111111-1111-1111-1111-111111111105', '11111111-1111-1111-1111-111111111101', 'Extra Spicy', 0, false, 5);

-- Protein
INSERT INTO modifiers (id, modifier_group_id, name, price_delta_cents, is_default, sort_order) VALUES
('21111111-1111-1111-1111-111111111110', '11111111-1111-1111-1111-111111111102', 'Chicken', 0, true, 1),
('21111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111102', 'Pork', 0, false, 2),
('21111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111102', 'Beef', 200, false, 3),
('21111111-1111-1111-1111-111111111113', '11111111-1111-1111-1111-111111111102', 'Shrimp', 300, false, 4),
('21111111-1111-1111-1111-111111111114', '11111111-1111-1111-1111-111111111102', 'Tofu', 0, false, 5);

-- Add-ons
INSERT INTO modifiers (id, modifier_group_id, name, price_delta_cents, is_default, sort_order) VALUES
('21111111-1111-1111-1111-111111111120', '11111111-1111-1111-1111-111111111103', 'Extra Fried Egg', 200, false, 1),
('21111111-1111-1111-1111-111111111121', '11111111-1111-1111-1111-111111111103', 'Extra Chili', 0, false, 2),
('21111111-1111-1111-1111-111111111122', '11111111-1111-1111-1111-111111111103', 'Extra Basil', 100, false, 3),
('21111111-1111-1111-1111-111111111123', '11111111-1111-1111-1111-111111111103', 'Crispy Pork', 400, false, 4),
('21111111-1111-1111-1111-111111111124', '11111111-1111-1111-1111-111111111103', 'Sticky Rice', 200, false, 5),
('21111111-1111-1111-1111-111111111125', '11111111-1111-1111-1111-111111111103', 'Som Tum (Papaya Salad)', 500, false, 6);

-- Rice Type
INSERT INTO modifiers (id, modifier_group_id, name, price_delta_cents, is_default, sort_order) VALUES
('21111111-1111-1111-1111-111111111130', '11111111-1111-1111-1111-111111111104', 'Steamed Rice', 0, true, 1),
('21111111-1111-1111-1111-111111111131', '11111111-1111-1111-1111-111111111104', 'Egg Fried Rice', 300, false, 2),
('21111111-1111-1111-1111-111111111132', '11111111-1111-1111-1111-111111111104', 'Brown Rice', 200, false, 3);

-- Noodle Type
INSERT INTO modifiers (id, modifier_group_id, name, price_delta_cents, is_default, sort_order) VALUES
('21111111-1111-1111-1111-111111111140', '11111111-1111-1111-1111-111111111105', 'Rice Noodles', 0, true, 1),
('21111111-1111-1111-1111-111111111141', '11111111-1111-1111-1111-111111111105', 'Egg Noodles', 0, false, 2),
('21111111-1111-1111-1111-111111111142', '11111111-1111-1111-1111-111111111105', 'Glass Noodles', 0, false, 3),
('21111111-1111-1111-1111-111111111143', '11111111-1111-1111-1111-111111111105', 'Instant Noodles', -100, false, 4);

-- Drink Sweetness
INSERT INTO modifiers (id, modifier_group_id, name, price_delta_cents, is_default, sort_order) VALUES
('21111111-1111-1111-1111-111111111150', '11111111-1111-1111-1111-111111111106', '100% Sweet', 0, false, 1),
('21111111-1111-1111-1111-111111111151', '11111111-1111-1111-1111-111111111106', '70% Sweet', 0, true, 2),
('21111111-1111-1111-1111-111111111152', '11111111-1111-1111-1111-111111111106', '50% Sweet', 0, false, 3),
('21111111-1111-1111-1111-111111111153', '11111111-1111-1111-1111-111111111106', '30% Sweet', 0, false, 4),
('21111111-1111-1111-1111-111111111154', '11111111-1111-1111-1111-111111111106', 'No Sugar', 0, false, 5);

-- 5. Menu Items (using proper UUIDs)
-- Rice Dishes (Category c0000001-0000-0000-0000-000000000001)
INSERT INTO menu_items (id, category_id, name, description, price_cents, sort_order) VALUES
('31111111-1111-1111-1111-111111111101', 'c0000001-0000-0000-0000-000000000001', 'Pad Kra Pao', 'Stir-fried holy basil with chili, garlic, and your choice of protein served with steamed rice', 1450, 1),
('31111111-1111-1111-1111-111111111102', 'c0000001-0000-0000-0000-000000000001', 'Pad Thai', 'Classic Thai stir-fried rice noodles with tamarind sauce, peanuts, and bean sprouts', 1550, 2),
('31111111-1111-1111-1111-111111111103', 'c0000001-0000-0000-0000-000000000001', 'Khao Pad', 'Thai fried rice with egg, tomato, and your choice of protein', 1350, 3),
('31111111-1111-1111-1111-111111111104', 'c0000001-0000-0000-0000-000000000001', 'Khao Man Gai', 'Thai chicken rice with tender chicken and flavorful broth', 1450, 4),
('31111111-1111-1111-1111-111111111105', 'c0000001-0000-0000-0000-000000000001', 'Khao Soi', 'Northern Thai curry noodles with coconut milk, crispy noodles on top', 1650, 5);

-- Noodles (Category c0000001-0000-0000-0000-000000000002)
INSERT INTO menu_items (id, category_id, name, description, price_cents, sort_order) VALUES
('31111111-1111-1111-1111-111111111110', 'c0000001-0000-0000-0000-000000000002', 'Pad See Ew', 'Wide rice noodles stir-fried with soy sauce, egg, and vegetables', 1450, 1),
('31111111-1111-1111-1111-111111111111', 'c0000001-0000-0000-0000-000000000002', 'Pad Kee Mao', 'Drunken noodles - spicy stir-fried noodles with holy basil', 1450, 2),
('31111111-1111-1111-1111-111111111112', 'c0000001-0000-0000-0000-000000000002', 'Guay Tiew Reua', 'Boat noodles - rich beef broth with rice noodles', 1350, 3),
('31111111-1111-1111-1111-111111111113', 'c0000001-0000-0000-0000-000000000002', 'Tom Yum Noodles', 'Hot and sour soup with noodles', 1400, 4),
('31111111-1111-1111-1111-111111111114', 'c0000001-0000-0000-0000-000000000002', 'Glass Noodle Salad', 'Cold glass noodle salad with spicy lime dressing', 1200, 5);

-- Soups (Category c0000001-0000-0000-0000-000000000003)
INSERT INTO menu_items (id, category_id, name, description, price_cents, sort_order) VALUES
('31111111-1111-1111-1111-111111111120', 'c0000001-0000-0000-0000-000000000003', 'Tom Yum', 'Hot and sour soup with lemongrass, galangal, mushrooms, and shrimp', 1200, 1),
('31111111-1111-1111-1111-111111111121', 'c0000001-0000-0000-0000-000000000003', 'Tom Kha', 'Coconut milk soup with galangal, lemongrass, and mushrooms', 1200, 2),
('31111111-1111-1111-1111-111111111122', 'c0000001-0000-0000-0000-000000000003', 'Gaeng Jued Woonsen', 'Clear soup with glass noodles and ground pork', 1000, 3);

-- Appetizers (Category c0000001-0000-0000-0000-000000000004)
INSERT INTO menu_items (id, category_id, name, description, price_cents, sort_order) VALUES
('31111111-1111-1111-1111-111111111130', 'c0000001-0000-0000-0000-000000000004', 'Som Tum', 'Green papaya salad with tomatoes, beans, peanuts, and dried shrimp', 1000, 1),
('31111111-1111-1111-1111-111111111131', 'c0000001-0000-0000-0000-000000000004', 'Gai Yang', 'Grilled Thai chicken with spicy dipping sauce', 1500, 2),
('31111111-1111-1111-1111-111111111132', 'c0000001-0000-0000-0000-000000000004', 'Moo Ping', 'Grilled pork skewers with Thai herbs', 1200, 3),
('31111111-1111-1111-1111-111111111133', 'c0000001-0000-0000-0000-000000000004', 'Tod Man Pla', 'Thai fish cakes with cucumber sauce', 1100, 4),
('31111111-1111-1111-1111-111111111134', 'c0000001-0000-0000-0000-000000000004', 'Kung Pao', 'Fried shrimp cakes with sweet chili sauce', 1300, 5);

-- Drinks (Category c0000001-0000-0000-0000-000000000005)
INSERT INTO menu_items (id, category_id, name, description, price_cents, sort_order) VALUES
('31111111-1111-1111-1111-111111111140', 'c0000001-0000-0000-0000-000000000005', 'Thai Iced Tea', 'Sweet Thai tea with condensed milk', 650, 1),
('31111111-1111-1111-1111-111111111141', 'c0000001-0000-0000-0000-000000000005', 'Thai Iced Coffee', 'Sweet Thai coffee over ice', 650, 2),
('31111111-1111-1111-1111-111111111142', 'c0000001-0000-0000-0000-000000000005', 'Fresh Coconut Water', 'Fresh young coconut', 800, 3),
('31111111-1111-1111-1111-111111111143', 'c0000001-0000-0000-0000-000000000005', 'Lemongrass Tea', 'Refreshing lemongrass herbal tea', 500, 4);

-- Desserts (Category c0000001-0000-0000-0000-000000000006)
INSERT INTO menu_items (id, category_id, name, description, price_cents, sort_order) VALUES
('31111111-1111-1111-1111-111111111150', 'c0000001-0000-0000-0000-000000000006', 'Khao Niao Mamuang', 'Mango sticky rice', 1000, 1),
('31111111-1111-1111-1111-111111111151', 'c0000001-0000-0000-0000-000000000006', 'Khao Tom', 'Sweet rice soup with coconut milk', 600, 2),
('31111111-1111-1111-1111-111111111152', 'c0000001-0000-0000-0000-000000000006', 'Ice Cream', 'Thai coconut or mango ice cream', 500, 3);

-- 6. Menu Item Modifier Groups (Join Table) - using proper UUIDs
-- Rice Dishes have: Spice Level, Protein, Add-ons, Rice Type
INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES
('31111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111101', true),
('31111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111102', true),
('31111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111103', false),
('31111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111104', false),
('31111111-1111-1111-1111-111111111102', '11111111-1111-1111-1111-111111111101', true),
('31111111-1111-1111-1111-111111111102', '11111111-1111-1111-1111-111111111102', true),
('31111111-1111-1111-1111-111111111102', '11111111-1111-1111-1111-111111111103', false),
('31111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111101', true),
('31111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111102', true),
('31111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111103', false),
('31111111-1111-1111-1111-111111111104', '11111111-1111-1111-1111-111111111103', false),
('31111111-1111-1111-1111-111111111105', '11111111-1111-1111-1111-111111111101', true),
('31111111-1111-1111-1111-111111111105', '11111111-1111-1111-1111-111111111102', true);

-- Noodles have: Spice Level, Protein, Add-ons, Noodle Type
INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES
('31111111-1111-1111-1111-111111111110', '11111111-1111-1111-1111-111111111101', true),
('31111111-1111-1111-1111-111111111110', '11111111-1111-1111-1111-111111111102', true),
('31111111-1111-1111-1111-111111111110', '11111111-1111-1111-1111-111111111103', false),
('31111111-1111-1111-1111-111111111110', '11111111-1111-1111-1111-111111111105', true),
('31111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111101', true),
('31111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111102', true),
('31111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111103', false),
('31111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111105', true),
('31111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111103', false),
('31111111-1111-1111-1111-111111111113', '11111111-1111-1111-1111-111111111105', true),
('31111111-1111-1111-1111-111111111114', '11111111-1111-1111-1111-111111111101', true);

-- Soups have: Spice Level, Protein
INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES
('31111111-1111-1111-1111-111111111120', '11111111-1111-1111-1111-111111111101', true),
('31111111-1111-1111-1111-111111111121', '11111111-1111-1111-1111-111111111101', true),
('31111111-1111-1111-1111-111111111122', '11111111-1111-1111-1111-111111111103', false);

-- Appetizers have: Spice Level, Add-ons
INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES
('31111111-1111-1111-1111-111111111130', '11111111-1111-1111-1111-111111111101', true),
('31111111-1111-1111-1111-111111111131', '11111111-1111-1111-1111-111111111103', false),
('31111111-1111-1111-1111-111111111132', '11111111-1111-1111-1111-111111111103', false),
('31111111-1111-1111-1111-111111111133', '11111111-1111-1111-1111-111111111101', true),
('31111111-1111-1111-1111-111111111134', '11111111-1111-1111-1111-111111111101', true);

-- Drinks have: Sweetness
INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES
('31111111-1111-1111-1111-111111111140', '11111111-1111-1111-1111-111111111106', false),
('31111111-1111-1111-1111-111111111141', '11111111-1111-1111-1111-111111111106', false);

-- Desserts have no modifiers
