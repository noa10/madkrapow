-- Indexes for query optimization

-- Menu items indexes
CREATE INDEX idx_menu_items_category_id ON menu_items(category_id);
CREATE INDEX idx_menu_items_is_available ON menu_items(is_available);

-- Categories indexes
CREATE INDEX idx_categories_is_active ON categories(is_active);

-- Orders indexes
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- Customers indexes
CREATE INDEX idx_customers_auth_user_id ON customers(auth_user_id);

-- Store settings GIN index for JSONB operating_hours
CREATE INDEX idx_store_settings_operating_hours ON store_settings USING GIN(operating_hours);
