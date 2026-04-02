-- Add RLS policy for authenticated users to SELECT their own order_items
-- Previously only service_role could read order_items, causing the order tracking page
-- to show empty items for authenticated users.

CREATE POLICY "auth_select_own_order_items" ON order_items FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM orders o
        JOIN customers c ON o.customer_id = c.id
        WHERE o.id = order_items.order_id AND c.auth_user_id = auth.uid()
    )
);

-- Also add RLS for order_item_modifiers so users can see modifier details
CREATE POLICY "auth_select_own_order_item_modifiers" ON order_item_modifiers FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN customers c ON o.customer_id = c.id
        WHERE oi.id = order_item_modifiers.order_item_id AND c.auth_user_id = auth.uid()
    )
);
