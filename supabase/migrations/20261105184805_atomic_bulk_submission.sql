-- A bulk submission becomes visible to the merchant only once its header,
-- lines, modifiers and bulk_submitted event have all committed. The event's
-- notification trigger participates in the same transaction.
--
-- Bulk totals historically include base menu prices only: modifier deltas are
-- snapshots for manual review and are deliberately not added to the total.
-- The client supplies identifiers and quantities, never snapshot metadata.

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_bulk_order(
  p_auth_user_id UUID,
  p_customer_id UUID,
  p_order JSONB,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_order_id UUID;
  v_item_id UUID;
  v_menu_item_id UUID;
  v_quantity INTEGER;
  v_line_total BIGINT;
  v_subtotal BIGINT := 0;
  v_scheduled_for TIMESTAMPTZ;
  v_item JSONB;
  v_modifier JSONB;
  v_modifier_id UUID;
  v_modifier_ids JSONB;
  v_modifier_snapshots JSONB;
  v_modifier_names TEXT[];
  v_menu_item RECORD;
  v_modifier_row RECORD;
BEGIN
  -- Service-role callers are responsible for authentication. Still check the
  -- association here so a supplied customer id cannot be used for another user.
  PERFORM 1 FROM public.customers c
   WHERE c.id = p_customer_id AND c.auth_user_id = p_auth_user_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bulk_customer_mismatch';
  END IF;

  IF p_order->>'delivery_type' IS NULL
     OR p_order->>'delivery_type' NOT IN ('delivery', 'self_pickup')
     OR NULLIF(p_order->>'order_number', '') IS NULL
     OR NULLIF(p_order->>'company_name', '') IS NULL
     OR NULLIF(p_order->>'contact_phone', '') IS NULL
     OR NULLIF(p_order->>'scheduled_for', '') IS NULL
     OR NULLIF(p_order->>'requested_date', '') IS NULL THEN
    RAISE EXCEPTION 'bulk_invalid_order';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'bulk_invalid_items';
  END IF;

  v_scheduled_for := (p_order->>'scheduled_for')::TIMESTAMPTZ;

  INSERT INTO public.orders (
    order_number, customer_id, customer_name, customer_phone, status,
    subtotal_cents, delivery_fee_cents, total_cents, delivery_address_json,
    delivery_type, fulfillment_type, scheduled_for, order_kind,
    requires_manual_review, approval_status, bulk_company_name,
    bulk_requested_date, bulk_budget_cents, bulk_invoice_name,
    bulk_contact_phone, bulk_special_notes, bulk_dropoff_instructions,
    dispatch_status, kitchen_lead_minutes
  ) VALUES (
    p_order->>'order_number', p_customer_id, p_order->>'company_name',
    p_order->>'contact_phone', 'pending', 0, 0, 0,
    CASE WHEN p_order->>'delivery_type' = 'delivery'
      THEN p_order->'delivery_address' ELSE NULL END,
    p_order->>'delivery_type', 'scheduled', v_scheduled_for, 'bulk',
    true, 'pending_review', p_order->>'company_name', v_scheduled_for,
    (p_order->>'budget_cents')::INTEGER, NULLIF(p_order->>'invoice_name', ''),
    p_order->>'contact_phone', NULLIF(p_order->>'special_notes', ''),
    NULLIF(p_order->>'dropoff_instructions', ''), 'not_ready',
    (p_order->>'kitchen_lead_minutes')::INTEGER
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_menu_item_id := NULLIF(v_item->>'menu_item_id', '')::UUID;
    v_quantity := NULLIF(v_item->>'quantity', '')::INTEGER;
    IF v_menu_item_id IS NULL OR v_quantity IS NULL
       OR v_quantity < 1 OR v_quantity > 1000 THEN
      RAISE EXCEPTION 'bulk_invalid_item';
    END IF;

    -- Lock through commit so the validated price and availability cannot
    -- change before this snapshot is written.
    SELECT mi.id, mi.name, mi.price_cents, mi.image_url, mi.is_available
      INTO v_menu_item
      FROM public.menu_items mi
     WHERE mi.id = v_menu_item_id
     FOR SHARE;
    IF NOT FOUND OR NOT v_menu_item.is_available THEN
      RAISE EXCEPTION 'bulk_item_unavailable';
    END IF;

    v_modifier_ids := COALESCE(v_item->'modifier_ids', '[]'::JSONB);
    IF jsonb_typeof(v_modifier_ids) <> 'array'
       OR jsonb_array_length(v_modifier_ids) > 20 THEN
      RAISE EXCEPTION 'bulk_invalid_modifier';
    END IF;
    v_modifier_snapshots := '[]'::JSONB;
    v_modifier_names := ARRAY[]::TEXT[];

    FOR v_modifier IN SELECT value FROM jsonb_array_elements(v_modifier_ids) LOOP
      v_modifier_id := (v_modifier #>> '{}')::UUID;
      -- A modifier must be available and attached to this particular item.
      -- Lock both rows so names, deltas, availability and membership remain
      -- consistent until the event and its notification have committed.
      SELECT m.id, m.name, m.price_delta_cents INTO v_modifier_row
        FROM public.modifiers m
        JOIN public.menu_item_modifier_groups j
          ON j.modifier_group_id = m.modifier_group_id
       WHERE m.id = v_modifier_id AND m.is_available
         AND j.menu_item_id = v_menu_item_id
       FOR SHARE OF m, j;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'bulk_invalid_modifier';
      END IF;
      v_modifier_names := array_append(v_modifier_names, v_modifier_row.name);
      v_modifier_snapshots := v_modifier_snapshots || jsonb_build_array(jsonb_build_object(
        'id', v_modifier_row.id,
        'name', v_modifier_row.name,
        'price_delta_cents', v_modifier_row.price_delta_cents
      ));
    END LOOP;

    -- BIGINT arithmetic plus an explicit ceiling: a corrupted or extreme menu
    -- price must fail this transaction rather than overflow into a negative
    -- total or surface as an opaque items failure.
    v_line_total := v_menu_item.price_cents::BIGINT * v_quantity;
    v_subtotal := v_subtotal + v_line_total;
    IF v_line_total > 2147483647 OR v_subtotal > 2147483647 THEN
      RAISE EXCEPTION 'bulk_total_too_large';
    END IF;

    -- Retain the route's existing item-write failure response while letting
    -- the exception abort the whole submission (including earlier lines).
    BEGIN
      INSERT INTO public.order_items (
        order_id, menu_item_id, menu_item_name, menu_item_price_cents,
        quantity, line_total_cents, notes, image_url
      ) VALUES (
        v_order_id, v_menu_item.id, v_menu_item.name, v_menu_item.price_cents,
        v_quantity, v_line_total,
        CASE WHEN cardinality(v_modifier_names) > 0
          THEN array_to_string(v_modifier_names, ', ') ELSE NULL END,
        NULLIF(v_menu_item.image_url, '')
      ) RETURNING id INTO v_item_id;
    EXCEPTION
      WHEN serialization_failure OR deadlock_detected THEN RAISE;
      WHEN OTHERS THEN RAISE EXCEPTION 'bulk_items_failed' USING DETAIL = SQLERRM;
    END;

    FOR v_modifier IN SELECT value FROM jsonb_array_elements(v_modifier_snapshots) LOOP
      INSERT INTO public.order_item_modifiers (
        order_item_id, modifier_id, modifier_name, modifier_price_delta_cents
      ) VALUES (
        v_item_id, (v_modifier->>'id')::UUID, v_modifier->>'name',
        (v_modifier->>'price_delta_cents')::INTEGER
      );
    END LOOP;
  END LOOP;

  UPDATE public.orders
     SET subtotal_cents = v_subtotal, total_cents = v_subtotal
   WHERE id = v_order_id;

  -- Insert last: a transactional notification trigger sees the complete order.
  INSERT INTO public.order_events (order_id, event_type, new_value)
  VALUES (
    v_order_id, 'bulk_submitted', jsonb_build_object(
      'company_name', p_order->>'company_name',
      'requested_date', p_order->>'requested_date',
      'total_cents', v_subtotal
    )
  );

  RETURN jsonb_build_object('order_id', v_order_id);
END;
$$;

COMMENT ON FUNCTION public.submit_bulk_order(UUID, UUID, JSONB, JSONB) IS
  'Atomically submits a pending bulk order, its DB-priced lines, modifier snapshots and bulk_submitted event. No payment is created.';

REVOKE ALL ON FUNCTION public.submit_bulk_order(UUID, UUID, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_bulk_order(UUID, UUID, JSONB, JSONB)
  TO service_role;

COMMIT;
