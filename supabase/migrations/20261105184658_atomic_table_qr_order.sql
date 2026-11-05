-- Atomically create a table-QR order and its completion event. The public
-- route validates the table capability and modifier selections before calling
-- this service-role-only function. Prices and names are re-read and locked here,
-- so a price change or sell-out between the route's read and this transaction
-- cannot be written. The event is inserted last, so the merchant notification
-- trigger sees a complete order at transaction commit.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_table_qr_order(
  p_order JSONB,
  p_lines JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_table_id UUID := NULLIF(p_order->>'table_id', '')::UUID;
  v_key TEXT := NULLIF(p_order->>'idempotency_key', '');
  v_pax INTEGER := NULLIF(p_order->>'pax', '')::INTEGER;
  v_table_label TEXT;
  v_existing public.orders%ROWTYPE;
  v_order_id UUID;
  v_order_number TEXT;
  v_display_code TEXT;
  v_line JSONB;
  v_modifiers JSONB;
  v_modifier JSONB;
  v_menu_item_id UUID;
  v_modifier_id UUID;
  v_item_id UUID;
  v_quantity INTEGER;
  v_base_price INTEGER;
  v_modifier_total BIGINT;
  v_line_total BIGINT;
  v_subtotal BIGINT := 0;
  v_menu_item RECORD;
  v_modifier_row RECORD;
BEGIN
  IF v_table_id IS NULL OR v_pax IS NULL OR v_pax < 1 OR v_pax > 50 THEN
    RAISE EXCEPTION 'invalid_table_order';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'invalid_table_order_lines';
  END IF;
  IF jsonb_array_length(p_lines) < 1 OR jsonb_array_length(p_lines) > 50 THEN
    RAISE EXCEPTION 'invalid_table_order_lines';
  END IF;
  IF NULLIF(btrim(p_order->>'order_number'), '') IS NULL THEN
    RAISE EXCEPTION 'invalid_table_order_number';
  END IF;

  -- Serialize retries of the same key before the table rate-limit trigger runs.
  -- A concurrent retry at the 4-order cap must return the original order.
  IF v_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_key, 7821));
    SELECT * INTO v_existing FROM public.orders WHERE idempotency_key = v_key;
    IF FOUND THEN
      IF v_existing.table_id IS DISTINCT FROM v_table_id THEN
        RAISE EXCEPTION 'idempotency_key_conflict';
      END IF;
      RETURN jsonb_build_object(
        'order_id', v_existing.id,
        'order_number', v_existing.order_number,
        'display_code', v_existing.display_code,
        'total_cents', v_existing.total_cents,
        'table_label', v_existing.table_label,
        'pax', v_existing.pax,
        'status', v_existing.status,
        'payment_method', v_existing.payment_method,
        'duplicate', true
      );
    END IF;
  END IF;

  -- The row lock prevents a table deactivation from racing this order.
  SELECT label INTO v_table_label
  FROM public.restaurant_tables
  WHERE id = v_table_id AND is_active
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'table_inactive';
  END IF;

  INSERT INTO public.orders (
    order_number, customer_id, customer_name, status, source, delivery_type,
    table_id, table_label, pax, fulfillment_type, order_kind, dispatch_status,
    subtotal_cents, delivery_fee_cents, discount_cents, total_cents, notes,
    include_cutlery, idempotency_key
  ) VALUES (
    p_order->>'order_number', NULL, NULLIF(p_order->>'customer_name', ''),
    'pending', 'web', 'dine_in', v_table_id, v_table_label, v_pax, 'asap',
    'standard', 'not_ready', 0, 0, 0, 0, NULLIF(p_order->>'notes', ''),
    false, v_key
  ) RETURNING id, order_number, display_code
    INTO v_order_id, v_order_number, v_display_code;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_quantity := NULLIF(v_line->>'quantity', '')::INTEGER;
    v_menu_item_id := NULLIF(v_line->>'menu_item_id', '')::UUID;
    v_modifiers := COALESCE(v_line->'modifiers', '[]'::JSONB);
    IF v_quantity IS NULL OR v_quantity < 1 OR v_quantity > 99
       OR v_menu_item_id IS NULL THEN
      RAISE EXCEPTION 'invalid_table_order_line';
    END IF;
    IF jsonb_typeof(v_modifiers) <> 'array' THEN
      RAISE EXCEPTION 'invalid_table_order_modifiers';
    END IF;
    IF jsonb_array_length(v_modifiers) > 20 THEN
      RAISE EXCEPTION 'invalid_table_order_modifiers';
    END IF;

    -- Hold the menu rows until commit so the validated price and availability
    -- cannot change while the snapshots are written.
    SELECT mi.id, mi.name, mi.price_cents INTO v_menu_item
      FROM public.menu_items mi
     WHERE mi.id = v_menu_item_id AND mi.is_available
     FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'table_order_item_unavailable';
    END IF;
    v_base_price := v_menu_item.price_cents;

    v_modifier_total := 0;
    FOR v_modifier IN SELECT value FROM jsonb_array_elements(v_modifiers) LOOP
      v_modifier_id := NULLIF(v_modifier->>'modifier_id', '')::UUID;
      IF v_modifier_id IS NULL THEN
        RAISE EXCEPTION 'invalid_table_order_modifiers';
      END IF;
      -- A modifier must be available and attached to this particular item.
      SELECT m.id, m.name, m.price_delta_cents INTO v_modifier_row
        FROM public.modifiers m
        JOIN public.menu_item_modifier_groups j
          ON j.modifier_group_id = m.modifier_group_id
       WHERE m.id = v_modifier_id AND m.is_available
         AND j.menu_item_id = v_menu_item_id
       FOR SHARE OF m, j;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'table_order_invalid_modifier';
      END IF;
      v_modifier_total := v_modifier_total + v_modifier_row.price_delta_cents;
    END LOOP;

    v_line_total := GREATEST(v_base_price::BIGINT + v_modifier_total, 0) * v_quantity;
    v_subtotal := v_subtotal + v_line_total;
    IF v_line_total > 2147483647 OR v_subtotal > 2147483647 THEN
      RAISE EXCEPTION 'table_order_total_too_large';
    END IF;

    INSERT INTO public.order_items (
      order_id, menu_item_id, menu_item_name, menu_item_price_cents,
      quantity, line_total_cents, notes
    ) VALUES (
      v_order_id, v_menu_item.id, v_menu_item.name,
      v_base_price, v_quantity, v_line_total::INTEGER, NULLIF(v_line->>'notes', '')
    ) RETURNING id INTO v_item_id;

    FOR v_modifier IN SELECT value FROM jsonb_array_elements(v_modifiers) LOOP
      SELECT m.id, m.name, m.price_delta_cents INTO v_modifier_row
        FROM public.modifiers m
       WHERE m.id = (v_modifier->>'modifier_id')::UUID;
      INSERT INTO public.order_item_modifiers (
        order_item_id, modifier_id, modifier_name, modifier_price_delta_cents
      ) VALUES (
        v_item_id, v_modifier_row.id, v_modifier_row.name,
        v_modifier_row.price_delta_cents
      );
    END LOOP;
  END LOOP;

  -- Detect a mismatch between the route's validated pricing and this write
  -- before either the order or the notification can commit.
  IF NULLIF(p_order->>'subtotal_cents', '')::BIGINT IS DISTINCT FROM v_subtotal THEN
    RAISE EXCEPTION 'table_order_total_mismatch';
  END IF;

  UPDATE public.orders
  SET subtotal_cents = v_subtotal::INTEGER, total_cents = v_subtotal::INTEGER
  WHERE id = v_order_id;

  INSERT INTO public.order_events (order_id, event_type, actor_id, new_value)
  VALUES (
    v_order_id, 'table_order_placed', NULL,
    jsonb_build_object(
      'table_id', v_table_id,
      'table_label', v_table_label,
      'pax', v_pax,
      'source_channel', 'table_qr',
      'total_cents', v_subtotal
    )
  );

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'display_code', v_display_code,
    'total_cents', v_subtotal,
    'table_label', v_table_label,
    'pax', v_pax,
    'status', 'pending',
    'duplicate', false
  );
END;
$$;

COMMENT ON FUNCTION public.create_table_qr_order(JSONB, JSONB) IS
  'Atomically creates a validated table-QR order, its lines, modifiers and completion event.';

REVOKE ALL ON FUNCTION public.create_table_qr_order(JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_table_qr_order(JSONB, JSONB) TO service_role;

COMMIT;
