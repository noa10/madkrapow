-- Migration: Update menu data with real Mad Krapow menu items
-- This migration replaces placeholder data with actual Mad Krapow TTDI Jaya menu

-- Step 1: Truncate existing menu-related data (preserve store_settings)
TRUNCATE TABLE menu_item_modifier_groups CASCADE;
TRUNCATE TABLE menu_items CASCADE;
TRUNCATE TABLE modifiers CASCADE;
TRUNCATE TABLE modifier_groups CASCADE;
TRUNCATE TABLE categories CASCADE;

-- Step 2: Insert new categories (using proper UUID format)
INSERT INTO categories (id, name, description, sort_order, is_active) VALUES
('00000001-0000-0000-0000-000000000001', 'Set Krapow', 'Complete meal sets with rice, protein, and drink', 1, true),
('00000001-0000-0000-0000-000000000002', 'Lauk Sahaja', 'Individual dishes and sides', 2, true),
('00000001-0000-0000-0000-000000000003', 'Minuman', 'Refreshing beverages', 3, true),
('00000001-0000-0000-0000-000000000004', 'Bazar Ramadan TTDI Jaya', 'Special Ramadan bazaar offerings', 4, true);

-- Step 3: Insert modifier groups
INSERT INTO modifier_groups (id, name, description, min_selections, max_selections, sort_order) VALUES
('00000002-0000-0000-0000-000000000001', 'Spice Level', 'Choose your preferred spice level', 0, 1, 1);

-- Step 4: Insert modifiers (spice level only - simpler for now)
INSERT INTO modifiers (id, modifier_group_id, name, price_delta_cents, is_default, sort_order) VALUES
('00000003-0000-0000-0000-000000000001', '00000002-0000-0000-0000-000000000001', 'No Spice', 0, false, 1),
('00000003-0000-0000-0000-000000000002', '00000002-0000-0000-0000-000000000001', 'Medium Spice', 0, true, 2),
('00000003-0000-0000-0000-000000000003', '00000002-0000-0000-0000-000000000001', 'Extra Spicy', 0, false, 3);

-- Step 5: Insert menu items
-- Set Krapow (00000001-0000-0000-0000-000000000001)
INSERT INTO menu_items (id, category_id, name, description, price_cents, image_url, is_available, sort_order) VALUES
('00000004-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000001', 'Set Krapow Daging dengan Minuman', 'Beef krapow set with rice and drink', 1450, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730001.jpg?1721145902', true, 1),
('00000004-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', 'Set Krapow Ayam dengan Minuman', 'Chicken krapow set with rice and drink', 1450, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730002.jpg?1721145936', true, 2),
('00000004-0000-0000-0000-000000000003', '00000001-0000-0000-0000-000000000001', 'Set Krapow Daging', 'Beef krapow set with rice', 1250, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730003.jpg?1721145955', true, 3),
('00000004-0000-0000-0000-000000000004', '00000001-0000-0000-0000-000000000001', 'Set Krapow Ayam', 'Chicken krapow set with rice', 1250, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730004.jpg?1721145974', true, 4);

-- Lauk Sahaja (00000001-0000-0000-0000-000000000002)
INSERT INTO menu_items (id, category_id, name, description, price_cents, image_url, is_available, sort_order) VALUES
('00000004-0000-0000-0000-000000000005', '00000001-0000-0000-0000-000000000002', 'Krapow Daging Sahaja', 'Beef krapow without rice', 850, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730005.jpg?1721145989', true, 1),
('00000004-0000-0000-0000-000000000006', '00000001-0000-0000-0000-000000000002', 'Krapow Ayam Sahaja', 'Chicken krapow without rice', 850, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730006.jpg?1721146004', true, 2),
('00000004-0000-0000-0000-000000000007', '00000001-0000-0000-0000-000000000002', 'Nasi Putih Siam', 'Steamed jasmine rice', 200, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730007.jpg?1721146021', true, 3),
('00000004-0000-0000-0000-000000000008', '00000001-0000-0000-0000-000000000002', 'Telur Goreng', 'Fried egg', 200, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730008.jpg?1721146048', true, 4);

-- Minuman (00000001-0000-0000-0000-000000000003)
INSERT INTO menu_items (id, category_id, name, description, price_cents, image_url, is_available, sort_order) VALUES
('00000004-0000-0000-0000-000000000009', '00000001-0000-0000-0000-000000000003', 'Kickapoo (320ml)', 'Sparkling juice drink', 250, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730010.jpg?1721147513', true, 1),
('00000004-0000-0000-0000-000000000018', '00000001-0000-0000-0000-000000000003', 'Soya (300ml)', 'Soy milk', 220, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730018.jpg?1721147602', true, 2),
('00000004-0000-0000-0000-000000000019', '00000001-0000-0000-0000-000000000003', 'Ice Lemon Tea (300ml)', 'Iced lemon tea', 220, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730019.jpg?1721147625', true, 3),
('00000004-0000-0000-0000-000000000023', '00000001-0000-0000-0000-000000000003', 'Yeos Yeogurt Asli (250ml)', 'Plain yogurt drink', 200, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730023.jpg?1753693772', true, 4);

-- Bazar Ramadan TTDI Jaya (00000001-0000-0000-0000-000000000004)
INSERT INTO menu_items (id, category_id, name, description, price_cents, image_url, is_available, sort_order) VALUES
('00000004-0000-0000-0000-000000000027', '00000001-0000-0000-0000-000000000004', 'Krapow Kentang Daging', 'Beef krapow with potato', 500, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730027.jpg?1771952841', true, 1),
('00000004-0000-0000-0000-000000000028', '00000001-0000-0000-0000-000000000004', 'Krapow Kentang Ayam', 'Chicken krapow with potato', 500, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730028.jpg?1771952804', true, 2),
('00000004-0000-0000-0000-000000000029', '00000001-0000-0000-0000-000000000004', 'Set Krapow Daging', 'Beef krapow set (bazaar price)', 1000, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730029.jpg?1771952535', true, 3),
('00000004-0000-0000-0000-000000000030', '00000001-0000-0000-0000-000000000004', 'Popiah Krapow Ayam', 'Chicken krapow in popiah wrapper', 400, 'https://d282v6zd99utr7.cloudfront.net/public/merchant/3173/31730030.jpg?1771952988', true, 4);

-- Step 6: Insert menu item modifier groups (optional modifiers for Lauk Sahaja and Bazar items)
INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES
('00000004-0000-0000-0000-000000000005', '00000002-0000-0000-0000-000000000001', false),
('00000004-0000-0000-0000-000000000006', '00000002-0000-0000-0000-000000000001', false),
('00000004-0000-0000-0000-000000000027', '00000002-0000-0000-0000-000000000001', false),
('00000004-0000-0000-0000-000000000028', '00000002-0000-0000-0000-000000000001', false),
('00000004-0000-0000-0000-000000000029', '00000002-0000-0000-0000-000000000001', false),
('00000004-0000-0000-0000-000000000030', '00000002-0000-0000-0000-000000000001', false);

-- Update store settings for Mad Krapow TTDI Jaya
UPDATE store_settings SET
    store_name = 'Mad Krapow TTDI Jaya',
    address = 'No. 5, Jalan TTDI Jaya 1, Taman TTDI Jaya, 81200 Johor Bahru, Johor',
    phone = '+60 7-123 4567',
    min_order_amount = 2000
WHERE id = '11111111-1111-1111-1111-111111111111';
