-- Mad Krapow Real Menu Data
-- Restaurant: Mad Krapow TTDI Jaya
-- Updated: 2026-03-17

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
)
ON CONFLICT (id) DO UPDATE SET
    store_name = EXCLUDED.store_name,
    address = EXCLUDED.address,
    phone = EXCLUDED.phone,
    operating_hours = EXCLUDED.operating_hours,
    lalamove_market = EXCLUDED.lalamove_market,
    min_order_amount = EXCLUDED.min_order_amount,
    delivery_fee = EXCLUDED.delivery_fee;

-- 2. Categories
INSERT INTO categories (id, name, description, sort_order, is_active) VALUES
('cat00001-0000-0000-0000-000000000001', 'Set Krapow', 'Complete meal sets with rice, protein, and drink', 1, true),
('cat00001-0000-0000-0000-000000000002', 'Lauk Sahaja', 'Individual dishes and sides', 2, true),
('cat00001-0000-0000-0000-000000000003', 'Minuman', 'Refreshing beverages', 3, true),
('cat00001-0000-0000-0000-000000000004', 'Bazar Ramadan TTDI Jaya', 'Special Ramadan bazaar offerings', 4, true)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;

-- 3. Modifier Groups
INSERT INTO modifier_groups (id, name, description, min_selections, max_selections, sort_order) VALUES
('m0000001-0000-0000-0000-000000000001', 'Spice Level', 'Choose your preferred spice level', 0, 1, 1),
('m0000001-0000-0000-0000-000000000002', 'Drink Type', 'Select your drink preference', 0, 1, 2)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    min_selections = EXCLUDED.min_selections,
    max_selections = EXCLUDED.max_selections,
    sort_order = EXCLUDED.sort_order;

-- 4. Modifiers
-- Spice Level
INSERT INTO modifiers (id, modifier_group_id, name, price_delta_cents, is_default, sort_order) VALUES
('mod00001-0000-0000-0000-000000000001', 'm0000001-0000-0000-0000-000000000001', 'No Spice', 0, false, 1),
('mod00001-0000-0000-0000-000000000002', 'm0000001-0000-0000-0000-000000000001', 'Medium Spice', 0, true, 2),
('mod00001-0000-0000-0000-000000000003', 'm0000001-0000-0000-0000-000000000001', 'Extra Spicy', 0, false, 3)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    price_delta_cents = EXCLUDED.price_delta_cents,
    is_default = EXCLUDED.is_default,
    sort_order = EXCLUDED.sort_order;

-- 5. Menu Items
-- Set Krapow (cat00001-0000-0000-0000-000000000001)
INSERT INTO menu_items (id, category_id, name, description, price_cents, image_url, is_available, sort_order) VALUES
('item0001-0000-0000-0000-000000000001', 'cat00001-0000-0000-0000-000000000001', 'Set Krapow Daging dengan Minuman', 'Beef krapow set with rice and drink', 1450, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730001.jpg?1721145902', true, 1),
('item0001-0000-0000-0000-000000000002', 'cat00001-0000-0000-0000-000000000001', 'Set Krapow Ayam dengan Minuman', 'Chicken krapow set with rice and drink', 1450, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730002.jpg?1721145936', true, 2),
('item0001-0000-0000-0000-000000000003', 'cat00001-0000-0000-0000-000000000001', 'Set Krapow Daging', 'Beef krapow set with rice', 1250, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730003.jpg?1721145955', true, 3),
('item0001-0000-0000-0000-000000000004', 'cat00001-0000-0000-0000-000000000001', 'Set Krapow Ayam', 'Chicken krapow set with rice', 1250, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730004.jpg?1721145974', true, 4)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_cents = EXCLUDED.price_cents,
    image_url = EXCLUDED.image_url,
    is_available = EXCLUDED.is_available,
    sort_order = EXCLUDED.sort_order;

-- Lauk Sahaja (cat00001-0000-0000-0000-000000000002)
INSERT INTO menu_items (id, category_id, name, description, price_cents, image_url, is_available, sort_order) VALUES
('item0002-0000-0000-0000-000000000005', 'cat00001-0000-0000-0000-000000000002', 'Krapow Daging Sahaja', 'Beef krapow without rice', 850, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730005.jpg?1721145989', true, 1),
('item0002-0000-0000-0000-000000000006', 'cat00001-0000-0000-0000-000000000002', 'Krapow Ayam Sahaja', 'Chicken krapow without rice', 850, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730006.jpg?1721146004', true, 2),
('item0002-0000-0000-0000-000000000007', 'cat00001-0000-0000-0000-000000000002', 'Nasi Putih Siam', 'Steamed jasmine rice', 200, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730007.jpg?1721146021', true, 3),
('item0002-0000-0000-0000-000000000008', 'cat00001-0000-0000-0000-000000000002', 'Telur Goreng', 'Fried egg', 200, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730008.jpg?1721146048', true, 4)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_cents = EXCLUDED.price_cents,
    image_url = EXCLUDED.image_url,
    is_available = EXCLUDED.is_available,
    sort_order = EXCLUDED.sort_order;

-- Minuman (cat00001-0000-0000-0000-000000000003)
INSERT INTO menu_items (id, category_id, name, description, price_cents, image_url, is_available, sort_order) VALUES
('item0003-0000-0000-0000-000000000009', 'cat00001-0000-0000-0000-000000000003', 'Kickapoo (320ml)', 'Sparkling juice drink', 250, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730010.jpg?1721147513', true, 1),
('item0003-0000-0000-0000-000000000018', 'cat00001-0000-0000-0000-000000000003', 'Soya (300ml)', 'Soy milk', 220, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730018.jpg?1721147602', true, 2),
('item0003-0000-0000-0000-000000000019', 'cat00001-0000-0000-0000-000000000003', 'Ice Lemon Tea (300ml)', 'Iced lemon tea', 220, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730019.jpg?1721147625', true, 3),
('item0003-0000-0000-0000-000000000023', 'cat00001-0000-0000-0000-000000000003', 'Yeos Yeogurt Asli (250ml)', 'Plain yogurt drink', 200, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730023.jpg?1753693772', true, 4)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_cents = EXCLUDED.price_cents,
    image_url = EXCLUDED.image_url,
    is_available = EXCLUDED.is_available,
    sort_order = EXCLUDED.sort_order;

-- Bazar Ramadan TTDI Jaya (cat00001-0000-0000-0000-000000000004)
INSERT INTO menu_items (id, category_id, name, description, price_cents, image_url, is_available, sort_order) VALUES
('item0004-0000-0000-0000-000000000027', 'cat00001-0000-0000-0000-000000000004', 'Krapow Kentang Daging', 'Beef krapow with potato', 500, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730027.jpg?1771952841', true, 1),
('item0004-0000-0000-0000-000000000028', 'cat00001-0000-0000-0000-000000000004', 'Krapow Kentang Ayam', 'Chicken krapow with potato', 500, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730028.jpg?1771952804', true, 2),
('item0004-0000-0000-0000-000000000029', 'cat00001-0000-0000-0000-000000000004', 'Set Krapow Daging', 'Beef krapow set (bazaar price)', 1000, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730029.jpg?1771952535', true, 3),
('item0004-0000-0000-0000-000000000030', 'cat00001-0000-0000-0000-000000000004', 'Popiah Krapow Ayam', 'Chicken krapow in popiah wrapper', 400, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730030.jpg?1771952988', true, 4)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_cents = EXCLUDED.price_cents,
    image_url = EXCLUDED.image_url,
    is_available = EXCLUDED.is_available,
    sort_order = EXCLUDED.sort_order;

-- 6. Menu Item Modifier Groups (Optional for Lauk Sahaja and Bazar items)
-- Lauk Sahaja items can have spice level
INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES
('item0002-0000-0000-0000-000000000005', 'm0000001-0000-0000-0000-000000000001', false),
('item0002-0000-0000-0000-000000000006', 'm0000001-0000-0000-0000-000000000001', false)
ON CONFLICT (menu_item_id, modifier_group_id) DO UPDATE SET
    is_required = EXCLUDED.is_required;

-- Bazar items can have spice level
INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES
('item0004-0000-0000-0000-000000000027', 'm0000001-0000-0000-0000-000000000001', false),
('item0004-0000-0000-0000-000000000028', 'm0000001-0000-0000-0000-000000000001', false),
('item0004-0000-0000-0000-000000000029', 'm0000001-0000-0000-0000-000000000001', false),
('item0004-0000-0000-0000-000000000030', 'm0000001-0000-0000-0000-000000000001', false)
ON CONFLICT (menu_item_id, modifier_group_id) DO UPDATE SET
    is_required = EXCLUDED.is_required;
