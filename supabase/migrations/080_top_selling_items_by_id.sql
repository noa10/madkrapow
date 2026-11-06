-- ============================================
-- 080: group top_selling_items by catalog item, not by line-name snapshot
-- ============================================
-- 048 grouped the view by (menu_item_name, menu_item_id). That was harmless
-- while every order line carried the catalog's current name, but the HubboPOS
-- import (PR #511) deliberately maps renamed POS items onto today's catalog
-- ids — Beef Krapow Set / Set Krapow Daging both point at
-- 00000004-…-0003 — while keeping the historical name on
-- order_items.menu_item_name as a truthful line snapshot.
--
-- The report therefore split one dish across two or three rows. On the
-- production data 44 rows covered only 26 distinct menu_item_ids, and the
-- beef set appeared as Set Krapow Daging (3,587 qty) + Beef Krapow Set
-- (1,876) + Set Krapow (10).
--
-- Group by the id alone and take the display name from the catalog, so the
-- report follows the canonical product name. If the catalog row is gone, fall
-- back to the historical line name rather than hiding the revenue.
--
-- The output columns are unchanged (name, id, quantity, revenue) so
-- /api/admin/analytics and the generated db types need no change.

BEGIN;

CREATE OR REPLACE VIEW top_selling_items AS
SELECT
    COALESCE(MAX(mi.name), MIN(oi.menu_item_name)) AS menu_item_name,
    oi.menu_item_id,
    SUM(oi.quantity) AS total_quantity,
    SUM(oi.line_total_cents) AS total_revenue_cents
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
WHERE o.status IN ('paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered')
GROUP BY oi.menu_item_id
ORDER BY total_revenue_cents DESC;

COMMIT;
