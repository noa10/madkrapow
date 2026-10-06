-- ============================================
-- 052: import_channel_order RPC (webhook ingestion)
-- ============================================
-- Atomic + idempotent creation of a canonical order from a sales-channel
-- webhook (GrabFood now, Foodpanda later). The whole per-order write runs in
-- ONE plpgsql block:
--
--   * idempotency anchor — channel_orders UNIQUE(channel, external_order_id);
--     a unique_violation anywhere in the block (including a parallel-race
--     insert) rolls the block back and reports 'duplicate', so a retried
--     webhook can never create a second order.
--   * atomicity — order + items + payment + channel identity + audit land
--     together or not at all.
--
-- Invoked with the service-role key (service_role ALL policies exist on all
-- touched tables). The integration_events row is marked processed on success.

CREATE OR REPLACE FUNCTION import_channel_order(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_order JSONB;
  v_items JSONB;
  v_payment JSONB;
  v_channel_order JSONB;
  v_order_id UUID;
  v_payment_id UUID;
  v_order_number TEXT;
  v_external_order_id TEXT;
  v_channel_name TEXT;
  v_source_event_id UUID;
  v_item JSONB;
BEGIN
  v_order := payload -> 'order';
  v_items := payload -> 'items';
  v_payment := payload -> 'payment';
  v_channel_order := payload -> 'channelOrder';
  v_order_number := v_order ->> 'order_number';
  v_external_order_id := v_channel_order ->> 'external_order_id';
  v_channel_name := v_channel_order ->> 'channel';
  v_source_event_id := NULLIF(payload ->> 'sourceEventId', '')::uuid;

  IF v_external_order_id IS NULL OR v_external_order_id = '' THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'missing external_order_id');
  END IF;

  -- Pre-check for a readable 'skipped' response; the unique constraint below
  -- remains the hard guarantee against parallel races.
  IF EXISTS (
    SELECT 1 FROM channel_orders
    WHERE channel = v_channel_name AND external_order_id = v_external_order_id
  ) THEN
    UPDATE integration_events
    SET status = 'skipped', error = 'order already imported', processed_at = NOW()
    WHERE id = v_source_event_id;
    RETURN jsonb_build_object('status', 'skipped');
  END IF;

  BEGIN
    INSERT INTO orders (
      order_number, status, source,
      delivery_type, fulfillment_type,
      subtotal_cents, discount_cents, delivery_fee_cents, total_cents,
      customer_id, customer_name, notes, include_cutlery
    ) VALUES (
      v_order_number,
      COALESCE(v_order ->> 'status', 'paid'),
      v_order ->> 'source',
      COALESCE(v_order ->> 'delivery_type', 'delivery'),
      COALESCE(v_order ->> 'fulfillment_type', 'asap'),
      (v_order ->> 'subtotal_cents')::integer,
      COALESCE((v_order ->> 'discount_cents')::integer, 0),
      COALESCE((v_order ->> 'delivery_fee_cents')::integer, 0),
      (v_order ->> 'total_cents')::integer,
      NULL,
      v_order ->> 'customer_name',
      v_order ->> 'notes',
      COALESCE((v_order ->> 'include_cutlery')::boolean, true)
    )
    RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
      INSERT INTO order_items (
        order_id, menu_item_id, menu_item_name, menu_item_price_cents,
        quantity, line_total_cents, notes
      ) VALUES (
        v_order_id,
        (v_item ->> 'menu_item_id')::uuid,
        v_item ->> 'menu_item_name',
        (v_item ->> 'menu_item_price_cents')::integer,
        COALESCE((v_item ->> 'quantity')::integer, 1),
        (v_item ->> 'line_total_cents')::integer,
        v_item ->> 'notes'
      );
    END LOOP;

    INSERT INTO payments (
      order_id, method, amount_cents, status, external_ref, paid_at, raw
    ) VALUES (
      v_order_id,
      COALESCE(v_payment ->> 'method', 'other'),
      (v_payment ->> 'amount_cents')::integer,
      'succeeded',
      v_payment ->> 'external_ref',
      COALESCE((v_payment ->> 'paid_at')::timestamptz, NOW()),
      v_payment -> 'raw'
    )
    RETURNING id INTO v_payment_id;

    INSERT INTO channel_orders (
      order_id, channel, external_order_id, external_order_number,
      external_store_id, external_status, raw_payload
    ) VALUES (
      v_order_id,
      v_channel_name,
      v_external_order_id,
      v_channel_order ->> 'external_order_number',
      v_channel_order ->> 'external_store_id',
      v_channel_order ->> 'external_status',
      v_channel_order -> 'raw_payload'
    );

    INSERT INTO order_events (order_id, event_type, new_value)
    VALUES (
      v_order_id,
      COALESCE(payload ->> 'eventType', 'channel_created'),
      jsonb_build_object(
        'channel', v_channel_name,
        'external_order_id', v_external_order_id
      )
    );

    IF v_source_event_id IS NOT NULL THEN
      UPDATE integration_events
      SET status = 'processed', processed_at = NOW()
      WHERE id = v_source_event_id;
    END IF;

    RETURN jsonb_build_object('status', 'created', 'order_id', v_order_id, 'order_number', v_order_number);

  EXCEPTION WHEN unique_violation THEN
    -- Lost a race (duplicate webhook or concurrent delivery): the implicit
    -- subtransaction rolled everything above back.
    UPDATE integration_events
    SET status = 'skipped', error = 'duplicate channel order', processed_at = NOW()
    WHERE id = v_source_event_id;
    RETURN jsonb_build_object('status', 'duplicate');
  END;
END;
$$;

COMMENT ON FUNCTION import_channel_order(JSONB) IS
  'Atomically imports one sales-channel webhook order (GrabFood/Foodpanda). Idempotent via channel_orders(channel, external_order_id); unique-violation races roll back and report duplicate.';
