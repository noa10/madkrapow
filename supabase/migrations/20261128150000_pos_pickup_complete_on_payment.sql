-- Complete paid counter pickups in the same transaction as their payment.
-- Dine-in and non-counter orders retain their existing behavior.
BEGIN;

-- Nullable on purpose: only newly completed POS counter pickups enter this
-- separate queue. Existing orders and every other flow keep NULL; there is no
-- backfill. A kitchen ticket's customer-facing status is already 'delivered'.
ALTER TABLE public.orders
  ADD COLUMN kitchen_status TEXT DEFAULT NULL
  CONSTRAINT orders_kitchen_status_check
  CHECK (kitchen_status IN ('paid', 'preparing', 'ready'));

COMMENT ON COLUMN public.orders.kitchen_status IS
  'Separate kitchen queue state for automatically completed counter self-pickup orders; NULL for all other and legacy orders.';

-- Kitchen needs the ready row visible so Realtime can deliver its UPDATE as a
-- removal signal. The active queue is a query concern (paid/preparing). This
-- does not widen kitchen access to other channels, dine-in, or legacy rows.
DROP POLICY IF EXISTS "staff_select_orders_kitchen" ON orders;
CREATE POLICY "staff_select_orders_kitchen" ON orders FOR SELECT USING (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'kitchen'
  AND (
    status IN ('paid', 'accepted', 'preparing', 'ready')
    OR (status = 'pending' AND (delivery_type = 'dine_in' OR source = 'counter'))
    OR (
      source = 'counter'
      AND delivery_type = 'self_pickup'
      AND status = 'delivered'
      AND kitchen_status IS NOT NULL
    )
  )
);

CREATE OR REPLACE FUNCTION public.create_pos_order(
  p_actor_id UUID,
  p_order JSONB,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_type TEXT := p_order->>'order_type';
  v_payment_method TEXT := p_order->>'payment_method';
  v_order_number TEXT;
  v_customer_name TEXT;
  v_notes TEXT;
  v_table_id UUID;
  v_table_label TEXT;
  v_pax INT;

  v_item JSONB;
  v_menu_item_id UUID;
  v_quantity INT;
  v_modifier_ids UUID[];
  v_modifier_count INT;
  v_selected_count INT;

  v_menu_item RECORD;
  v_group RECORD;
  v_line_id UUID;
  v_line_total INT;
  v_subtotal INT := 0;

  v_order_id UUID;
  v_display_code TEXT;
BEGIN
  -- ------------------------------------------------------------
  -- Order-level shape and allowed values
  -- ------------------------------------------------------------
  IF v_order_type IS NULL OR v_order_type NOT IN ('dine_in', 'take_away') THEN
    RAISE EXCEPTION 'invalid_order';
  END IF;

  IF v_payment_method IS NULL OR v_payment_method NOT IN ('cash', 'qr_pay') THEN
    RAISE EXCEPTION 'invalid_payment_method';
  END IF;

  v_order_number := NULLIF(btrim(COALESCE(p_order->>'order_number', '')), '');
  IF v_order_number IS NULL THEN
    RAISE EXCEPTION 'invalid_order_number';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'invalid_items';
  END IF;

  v_notes := NULLIF(btrim(COALESCE(p_order->>'notes', '')), '');
  v_customer_name := NULLIF(btrim(COALESCE(p_order->>'customer_name', '')), '');

  IF v_order_type = 'dine_in' THEN
    v_table_id := NULLIF(p_order->>'table_id', '')::UUID;
    v_pax := NULLIF(p_order->>'pax', '')::INT;

    IF v_table_id IS NULL OR v_pax IS NULL OR v_pax < 1 OR v_pax > 50 THEN
      RAISE EXCEPTION 'invalid_order';
    END IF;

    -- Lock the table row so a concurrent deactivate_table() cannot commit
    -- between this check and the order insert. deactivate_restaurant_table()
    -- takes FOR UPDATE; this FOR SHARE makes it wait, then see the new open
    -- order and refuse.
    SELECT t.label
      INTO v_table_label
      FROM public.restaurant_tables t
     WHERE t.id = v_table_id
       AND t.is_active
       FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'table_inactive';
    END IF;
  ELSE
    -- A take-away order must not smuggle in a table reference.
    IF NULLIF(p_order->>'table_id', '') IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_order';
    END IF;
    v_table_id := NULL;
    v_pax := NULL;
  END IF;

  -- ------------------------------------------------------------
  -- Order header
  -- ------------------------------------------------------------
  INSERT INTO public.orders (
    order_number,
    customer_id,
    customer_name,
    status,
    source,
    delivery_type,
    table_id,
    table_label,
    pax,
    payment_method,
    fulfillment_type,
    order_kind,
    dispatch_status,
    subtotal_cents,
    discount_cents,
    delivery_fee_cents,
    total_cents,
    notes,
    include_cutlery
  )
  VALUES (
    v_order_number,
    NULL,
    CASE
      WHEN v_order_type = 'dine_in' THEN v_customer_name
      ELSE COALESCE(v_customer_name, 'Walk-in')
    END,
    'paid',
    'counter',
    CASE WHEN v_order_type = 'dine_in' THEN 'dine_in' ELSE 'self_pickup' END,
    v_table_id,
    v_table_label,
    v_pax,
    v_payment_method,
    'asap',
    'standard',
    'not_ready',
    0, -- subtotal is written after the lines are priced below
    0,
    0,
    0, -- total is written after the lines are priced below
    v_notes,
    v_order_type <> 'dine_in'
  )
  RETURNING id, display_code INTO v_order_id, v_display_code;

  -- ------------------------------------------------------------
  -- Lines and add-ons
  -- ------------------------------------------------------------
  FOR v_item IN
    SELECT value
      FROM jsonb_array_elements(p_items) AS elem(value)
  LOOP
    v_menu_item_id := NULLIF(v_item->>'menu_item_id', '')::UUID;
    v_quantity := NULLIF(v_item->>'quantity', '')::INT;

    IF v_menu_item_id IS NULL OR v_quantity IS NULL
       OR v_quantity < 1 OR v_quantity > 99 THEN
      RAISE EXCEPTION 'invalid_item';
    END IF;

    IF v_item ? 'modifier_ids'
       AND jsonb_typeof(v_item->'modifier_ids') <> 'array' THEN
      RAISE EXCEPTION 'invalid_modifier_payload';
    END IF;

    IF v_item ? 'modifier_ids' THEN
      v_modifier_ids := ARRAY(
        SELECT (elem.value)::UUID
          FROM jsonb_array_elements_text(v_item->'modifier_ids') AS elem(value)
      );
    ELSE
      v_modifier_ids := ARRAY[]::UUID[];
    END IF;

    IF cardinality(v_modifier_ids) > 20 THEN
      RAISE EXCEPTION 'invalid_modifier_payload';
    END IF;

    IF cardinality(v_modifier_ids) <> (
      SELECT count(DISTINCT sel.id)::INT
        FROM unnest(v_modifier_ids) AS sel(id)
    ) THEN
      RAISE EXCEPTION 'duplicate_modifier';
    END IF;

    SELECT mi.id, mi.name, mi.price_cents, mi.is_available
      INTO v_menu_item
      FROM public.menu_items mi
     WHERE mi.id = v_menu_item_id;

    IF NOT FOUND OR NOT v_menu_item.is_available THEN
      RAISE EXCEPTION 'item_unavailable';
    END IF;

    IF cardinality(v_modifier_ids) > 0 THEN
      SELECT count(*)::INT
        INTO v_modifier_count
        FROM public.modifiers m
       WHERE m.id = ANY(v_modifier_ids)
         AND m.is_available;

      IF v_modifier_count <> cardinality(v_modifier_ids) THEN
        RAISE EXCEPTION 'modifier_unavailable';
      END IF;

      -- Every selected modifier must belong to a group attached to this
      -- item. Without this a crafted payload could pull in another dish's
      -- options (or a group that was never attached).
      IF EXISTS (
        SELECT 1
          FROM unnest(v_modifier_ids) AS sel(id)
         WHERE NOT EXISTS (
           SELECT 1
             FROM public.modifiers m
             JOIN public.menu_item_modifier_groups j
               ON j.modifier_group_id = m.modifier_group_id
            WHERE m.id = sel.id
              AND j.menu_item_id = v_menu_item_id
         )
      ) THEN
        RAISE EXCEPTION 'invalid_modifier';
      END IF;
    END IF;

    -- Required/minimum and maximum rules per group. This mirrors
    -- validateModifierSelections() in the web app, so the database rejects a
    -- crafted call even if the route's validation is bypassed.
    FOR v_group IN
      SELECT g.id, g.name, g.min_selections, g.max_selections, j.is_required
        FROM public.menu_item_modifier_groups j
        JOIN public.modifier_groups g ON g.id = j.modifier_group_id
       WHERE j.menu_item_id = v_menu_item_id
    LOOP
      SELECT count(*)::INT
        INTO v_selected_count
        FROM public.modifiers m
       WHERE m.id = ANY(v_modifier_ids)
         AND m.modifier_group_id = v_group.id;

      IF v_selected_count > v_group.max_selections THEN
        RAISE EXCEPTION 'too_many_modifiers';
      END IF;

      IF (v_group.is_required OR v_group.min_selections > 0)
         AND v_selected_count < GREATEST(1, v_group.min_selections) THEN
        RAISE EXCEPTION 'required_modifier_missing';
      END IF;
    END LOOP;

    -- Prices come from the database, never from the payload. The item price
    -- is snapshotted on the line; add-on deltas are snapshotted below.
    SELECT (v_menu_item.price_cents + COALESCE(SUM(m.price_delta_cents), 0))
           * v_quantity
      INTO v_line_total
      FROM public.modifiers m
     WHERE m.id = ANY(v_modifier_ids);

    INSERT INTO public.order_items (
      order_id,
      menu_item_id,
      menu_item_name,
      menu_item_price_cents,
      quantity,
      line_total_cents,
      notes
    )
    VALUES (
      v_order_id,
      v_menu_item.id,
      v_menu_item.name,
      v_menu_item.price_cents,
      v_quantity,
      v_line_total,
      NULLIF(btrim(COALESCE(v_item->>'notes', '')), '')
    )
    RETURNING id INTO v_line_id;

    IF cardinality(v_modifier_ids) > 0 THEN
      INSERT INTO public.order_item_modifiers (
        order_item_id,
        modifier_id,
        modifier_name,
        modifier_price_delta_cents
      )
      SELECT v_line_id, m.id, m.name, m.price_delta_cents
        FROM unnest(v_modifier_ids) WITH ORDINALITY AS sel(id, ord)
        JOIN public.modifiers m ON m.id = sel.id
       ORDER BY sel.ord;
    END IF;

    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  -- The header was inserted with zero totals because the lines were not yet
  -- priced. Fill them once, inside the same transaction.
  UPDATE public.orders
     SET subtotal_cents = v_subtotal,
         total_cents = v_subtotal
   WHERE id = v_order_id;

  -- ------------------------------------------------------------
  -- Payment ledger and audit event
  -- ------------------------------------------------------------
  INSERT INTO public.payments (
    order_id,
    method,
    amount_cents,
    status,
    paid_at
  )
  VALUES (
    v_order_id,
    v_payment_method,
    v_subtotal,
    'succeeded',
    now()
  );

  -- Completion occurs only after the successful payment is persisted. Both
  -- writes and the audit events are part of this function's transaction.
  IF v_order_type = 'take_away' THEN
    UPDATE public.orders
       SET status = 'delivered', kitchen_status = 'paid', updated_at = now()
     WHERE id = v_order_id;

    INSERT INTO public.order_events (order_id, event_type, old_value, new_value, actor_id)
    VALUES (v_order_id, 'status_changed', jsonb_build_object('status', 'paid'),
      jsonb_build_object('status', 'delivered', 'reason', 'payment_collected'), p_actor_id);

    INSERT INTO public.order_events (order_id, event_type, old_value, new_value, actor_id)
    VALUES (v_order_id, 'kitchen_status_changed', jsonb_build_object('kitchen_status', NULL),
      jsonb_build_object('kitchen_status', 'paid'), p_actor_id);
  END IF;

  INSERT INTO public.order_events (
    order_id,
    event_type,
    actor_id,
    new_value
  )
  VALUES (
    v_order_id,
    'created',
    p_actor_id,
    jsonb_build_object(
      'source', 'counter',
      'order_type', v_order_type,
      'table_id', v_table_id,
      'table_label', v_table_label,
      'pax', v_pax,
      'payment_method', v_payment_method,
      'total_cents', v_subtotal
    )
  );

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'display_code', v_display_code,
    'total_cents', v_subtotal,
    'order_status', CASE WHEN v_order_type = 'take_away' THEN 'delivered' ELSE 'paid' END,
    'table_label', v_table_label,
    'pax', v_pax
  );
END;
$$;

COMMENT ON FUNCTION public.create_pos_order(UUID, JSONB, JSONB) IS
  'Atomically creates a paid counter POS order: header, lines, add-ons, payment and audit event in one transaction. Re-prices from menu_items/modifiers.';

REVOKE ALL ON FUNCTION public.create_pos_order(UUID, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pos_order(UUID, JSONB, JSONB)
  TO service_role;


CREATE OR REPLACE FUNCTION settle_dine_in_order(
  p_order_id UUID,
  p_method TEXT,
  p_actor_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_existing UUID;
  v_status TEXT;
BEGIN
  IF p_method NOT IN ('cash', 'qr_pay') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_method');
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  -- POS counter orders (dine-in or take-away) and table-QR dine-in orders are
  -- collectable here. Web delivery/pickup pending orders are not.
  IF v_order.source <> 'counter' AND v_order.delivery_type <> 'dine_in' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_settleable');
  END IF;

  SELECT id INTO v_existing
  FROM payments
  WHERE order_id = p_order_id AND status = 'succeeded'
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_paid');
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'not_pending', 'status', v_order.status
    );
  END IF;

  v_status := CASE WHEN v_order.source = 'counter' AND v_order.delivery_type = 'self_pickup'
    THEN 'delivered' ELSE 'paid' END;

  INSERT INTO payments (order_id, method, amount_cents, status, paid_at)
  VALUES (p_order_id, p_method, v_order.total_cents, 'succeeded', NOW());

  UPDATE orders
  SET status = v_status,
      kitchen_status = CASE WHEN v_status = 'delivered' THEN 'paid' ELSE kitchen_status END,
      payment_method = p_method,
      updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO order_events (order_id, event_type, old_value, new_value, actor_id)
  VALUES (
    p_order_id,
    'payment_collected',
    jsonb_build_object('status', 'pending'),
    jsonb_build_object(
      'status', v_status,
      'payment_method', p_method,
      'amount_cents', v_order.total_cents
    ),
    p_actor_id
  );

  -- The admin order timeline reads `status_changed`; emit it as well so the
  -- settlement is visible in history, not only in the payments table.
  INSERT INTO order_events (order_id, event_type, old_value, new_value, actor_id)
  VALUES (
    p_order_id,
    'status_changed',
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', v_status, 'reason', 'payment_collected'),
    p_actor_id
  );

  IF v_status = 'delivered' THEN
    INSERT INTO order_events (order_id, event_type, old_value, new_value, actor_id)
    VALUES (
      p_order_id,
      'kitchen_status_changed',
      jsonb_build_object('kitchen_status', NULL),
      jsonb_build_object('kitchen_status', 'paid'),
      p_actor_id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'status', v_status, 'amount_cents', v_order.total_cents
  );
END;
$$;

COMMENT ON FUNCTION settle_dine_in_order(UUID, TEXT, UUID) IS
  'Collect cash/QR Pay for a pending POS counter or table-QR order (atomic).';

-- Keep the RPC service-role only after replacing it.
REVOKE ALL ON FUNCTION settle_dine_in_order(UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_dine_in_order(UUID, TEXT, UUID) TO service_role;

-- Advance one kitchen ticket with a compare-and-set so concurrent kitchen
-- devices cannot overwrite each other. Service-role only: the authenticated
-- server route owns authorization and invokes this RPC.
CREATE OR REPLACE FUNCTION public.advance_counter_pickup_kitchen(
  p_order_id UUID,
  p_expected TEXT,
  p_next TEXT,
  p_actor_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current TEXT;
BEGIN
  IF NOT (
    (p_expected = 'paid' AND p_next = 'preparing')
    OR (p_expected = 'preparing' AND p_next = 'ready')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_transition');
  END IF;

  SELECT kitchen_status INTO v_current
    FROM orders
   WHERE id = p_order_id
     AND source = 'counter'
     AND delivery_type = 'self_pickup'
     AND status = 'delivered'
     AND kitchen_status IS NOT NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF v_current <> p_expected THEN
    RETURN jsonb_build_object('ok', false, 'code', 'conflict', 'kitchen_status', v_current);
  END IF;

  UPDATE orders
     SET kitchen_status = p_next, updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO order_events (order_id, event_type, old_value, new_value, actor_id)
  VALUES (p_order_id, 'kitchen_status_changed',
    jsonb_build_object('kitchen_status', v_current),
    jsonb_build_object('kitchen_status', p_next), p_actor_id);

  RETURN jsonb_build_object('ok', true, 'kitchen_status', p_next);
END;
$$;

COMMENT ON FUNCTION public.advance_counter_pickup_kitchen(UUID, TEXT, TEXT, UUID) IS
  'Compare-and-set kitchen state for a completed counter pickup, atomically auditing the transition.';

REVOKE ALL ON FUNCTION public.advance_counter_pickup_kitchen(UUID, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_counter_pickup_kitchen(UUID, TEXT, TEXT, UUID)
  TO service_role;

COMMIT;
