-- This API-specific view preserves the old shared views' date semantics.
-- Replaces the earlier draft signature without the dropped view.
DROP FUNCTION IF EXISTS public.analytics_top_items(date, date);
CREATE OR REPLACE VIEW public.analytics_daily_business_summary
WITH (security_invoker = true) AS
SELECT
  (created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS order_date,
  COUNT(*) AS order_count,
  SUM(total_cents) AS revenue_cents,
  AVG(total_cents) AS avg_order_cents,
  SUM(subtotal_cents) AS subtotal_cents,
  SUM(delivery_fee_cents) AS delivery_fees_cents,
  SUM(discount_cents) AS discounts_cents,
  COUNT(CASE WHEN delivery_type = 'delivery' THEN 1 END) AS delivery_count,
  COUNT(CASE WHEN delivery_type = 'self_pickup' THEN 1 END) AS pickup_count,
  COUNT(CASE WHEN delivery_type = 'dine_in' THEN 1 END) AS dine_in_count
FROM public.orders
WHERE status IN ('paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered')
GROUP BY (created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
REVOKE ALL ON public.analytics_daily_business_summary FROM PUBLIC, anon;
GRANT SELECT ON public.analytics_daily_business_summary TO authenticated, service_role;

-- Aggregate before returning data so PostgREST row limits cannot truncate sales.
-- The invoker's table privileges and RLS remain in force.
CREATE OR REPLACE FUNCTION public.analytics_top_items(p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH item_totals AS (
    SELECT COALESCE(MAX(mi.name), MIN(oi.menu_item_name)) AS menu_item_name,
      oi.menu_item_id, SUM(oi.quantity) AS total_quantity,
      SUM(oi.line_total_cents) AS total_revenue_cents
    FROM public.order_items AS oi
    JOIN public.orders AS o ON o.id = oi.order_id
    LEFT JOIN public.menu_items AS mi ON mi.id = oi.menu_item_id
    WHERE o.status IN ('paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered')
      AND o.created_at >= (p_from::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
      AND o.created_at < ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
    GROUP BY oi.menu_item_id, CASE WHEN oi.menu_item_id IS NULL THEN oi.menu_item_name END
  ), top_items AS (
    SELECT item_totals.*, ROW_NUMBER() OVER (
      ORDER BY total_revenue_cents DESC, menu_item_name, menu_item_id
    ) AS rank
    FROM item_totals
  ), ranked_items AS (
    SELECT menu_item_name, menu_item_id, total_quantity, total_revenue_cents, rank FROM top_items
    WHERE rank <= 10 ORDER BY rank
  )
  SELECT jsonb_build_object(
    'items_sold', COALESCE((SELECT SUM(total_quantity) FROM item_totals), 0),
    'top_items', COALESCE((SELECT jsonb_agg(to_jsonb(ranked_items) - 'rank' ORDER BY rank) FROM ranked_items), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.analytics_top_items(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_top_items(date, date) TO authenticated, service_role;

-- Order counts per sales channel for the selected range. Aggregated in the
-- database so the browser never pages through raw orders.
DROP FUNCTION IF EXISTS public.analytics_order_sources(date, date);
CREATE OR REPLACE FUNCTION public.analytics_order_sources(p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH totals AS (
    SELECT COALESCE(o.source, 'web') AS source, COUNT(*) AS order_count
    FROM public.orders AS o
    WHERE o.status IN ('paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered')
      AND o.created_at >= (p_from::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
      AND o.created_at < ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')
    GROUP BY COALESCE(o.source, 'web')
  )
  SELECT COALESCE(
    (SELECT jsonb_agg(to_jsonb(totals) ORDER BY order_count DESC, source) FROM totals),
    '[]'::jsonb
  );
$$;
REVOKE ALL ON FUNCTION public.analytics_order_sources(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_order_sources(date, date) TO authenticated, service_role;
