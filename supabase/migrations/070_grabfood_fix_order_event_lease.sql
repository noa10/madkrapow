-- Fix the ambiguous payload reference in the event-lease query.
-- Preserve the existing function signature and all other behavior.

CREATE OR REPLACE FUNCTION apply_channel_order(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_order JSONB;
  v_items JSONB;
  v_payment JSONB;
  v_channel_order JSONB;
  v_is_edit BOOLEAN;
  v_source_event_id UUID;
  v_order_id UUID;
  v_channel_order_id UUID;
  v_order_number TEXT;
  v_existing_order_number TEXT;
  v_external_order_id TEXT;
  v_channel_name TEXT;
  v_item JSONB;
  v_constraint TEXT;
BEGIN
  v_order := payload -> 'order';
  v_items := payload -> 'items';
  v_payment := payload -> 'payment';
  v_channel_order := payload -> 'channelOrder';
  v_is_edit := COALESCE((payload ->> 'isEdit')::boolean, false);
  v_source_event_id := NULLIF(payload ->> 'sourceEventId', '')::uuid;
  v_external_order_id := v_channel_order ->> 'external_order_id';
  v_channel_name := v_channel_order ->> 'channel';
  v_order_number := v_order ->> 'order_number';

  IF v_external_order_id IS NULL OR v_external_order_id = '' THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'missing external_order_id');
  END IF;
  IF v_channel_name IS NULL OR v_channel_name = '' THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'missing channel');
  END IF;

  -- Fence an expired/reclaimed worker before any canonical order changes.
  IF v_source_event_id IS NOT NULL THEN
    PERFORM 1 FROM integration_events
    WHERE id = v_source_event_id
      AND status = 'received'
      AND attempts = (apply_channel_order.payload ->> 'sourceEventAttempts')::integer
      AND locked_until > clock_timestamp()
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'error', 'reason', 'event lease lost');
    END IF;
  END IF;

  -- Grab's documented payload currently has no verified edit revision. Even an
  -- edit arriving first cannot safely be treated as the initial snapshot.
  IF v_is_edit THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'edit requires authoritative reconciliation');
  END IF;

  -- Serialize concurrent initial deliveries, including the no-row case.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_channel_name || ':' || v_external_order_id, 0));

  SELECT co.id, co.order_id, o.order_number
    INTO v_channel_order_id, v_order_id, v_existing_order_number
  FROM channel_orders co
  JOIN orders o ON o.id = co.order_id
  WHERE co.channel = v_channel_name
    AND co.external_order_id = v_external_order_id
  FOR UPDATE;

  IF v_channel_order_id IS NOT NULL THEN
    v_order_number := v_existing_order_number;
  END IF;

  -- ---------- create ----------
  IF v_channel_order_id IS NULL THEN
    BEGIN
      INSERT INTO orders (
        order_number, status, source,
        delivery_type, fulfillment_type, scheduled_for,
        subtotal_cents, discount_cents, delivery_fee_cents, total_cents,
        customer_id, customer_name, notes, include_cutlery
      ) VALUES (
        v_order_number,
        COALESCE(v_order ->> 'status', 'paid'),
        v_order ->> 'source',
        COALESCE(v_order ->> 'delivery_type', 'delivery'),
        COALESCE(v_order ->> 'fulfillment_type', 'asap'),
        NULLIF(v_order ->> 'scheduled_for', '')::timestamptz,
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
        COALESCE(v_payment ->> 'status', 'succeeded'),
        v_payment ->> 'external_ref',
        CASE WHEN COALESCE(v_payment ->> 'status', 'succeeded') = 'succeeded' THEN NOW() ELSE NULL END,
        v_payment -> 'raw'
      );

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
        jsonb_build_object('channel', v_channel_name, 'external_order_id', v_external_order_id)
      );

      IF v_source_event_id IS NOT NULL THEN
        UPDATE integration_events
        SET status = 'processed', processed_at = NOW(), locked_until = NULL
        WHERE id = v_source_event_id;
      END IF;

      RETURN jsonb_build_object('status', 'created', 'order_id', v_order_id, 'order_number', v_order_number);
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'channel_orders_channel_external_unique' THEN
        UPDATE integration_events
        SET status = 'skipped', error = 'duplicate channel order', processed_at = NOW(), locked_until = NULL
        WHERE id = v_source_event_id;
        RETURN jsonb_build_object('status', 'duplicate');
      END IF;
      RETURN jsonb_build_object('status', 'error', 'reason', 'unique_violation: ' || COALESCE(v_constraint, 'unknown'));
    END;
  END IF;

  -- ---------- replay without an edit flag ----------
  IF NOT v_is_edit THEN
    IF v_source_event_id IS NOT NULL THEN
      UPDATE integration_events
      SET status = 'skipped', error = 'order already imported', processed_at = NOW(), locked_until = NULL
      WHERE id = v_source_event_id;
    END IF;
    RETURN jsonb_build_object('status', 'skipped', 'order_id', v_order_id, 'order_number', v_order_number);
  END IF;

  -- ---------- edit: update the same canonical order ----------
  UPDATE orders
  SET subtotal_cents = (v_order ->> 'subtotal_cents')::integer,
      discount_cents = COALESCE((v_order ->> 'discount_cents')::integer, 0),
      delivery_fee_cents = COALESCE((v_order ->> 'delivery_fee_cents')::integer, 0),
      total_cents = (v_order ->> 'total_cents')::integer,
      customer_name = v_order ->> 'customer_name',
      notes = v_order ->> 'notes',
      include_cutlery = COALESCE((v_order ->> 'include_cutlery')::boolean, true),
      updated_at = NOW()
  WHERE id = v_order_id;

  DELETE FROM order_items WHERE order_id = v_order_id;

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

  UPDATE payments
  SET method = COALESCE(v_payment ->> 'method', method),
      amount_cents = (v_payment ->> 'amount_cents')::integer,
      status = COALESCE(v_payment ->> 'status', status),
      raw = v_payment -> 'raw',
      updated_at = NOW()
  WHERE order_id = v_order_id;

  IF NOT FOUND THEN
    INSERT INTO payments (
      order_id, method, amount_cents, status, external_ref, paid_at, raw
    ) VALUES (
      v_order_id,
      COALESCE(v_payment ->> 'method', 'other'),
      (v_payment ->> 'amount_cents')::integer,
      COALESCE(v_payment ->> 'status', 'succeeded'),
      v_payment ->> 'external_ref',
      CASE WHEN COALESCE(v_payment ->> 'status', 'succeeded') = 'succeeded' THEN NOW() ELSE NULL END,
      v_payment -> 'raw'
    );
  END IF;

  UPDATE channel_orders
  SET external_order_number = v_channel_order ->> 'external_order_number',
      external_store_id = v_channel_order ->> 'external_store_id',
      external_status = v_channel_order ->> 'external_status',
      raw_payload = v_channel_order -> 'raw_payload',
      updated_at = NOW()
  WHERE id = v_channel_order_id;

  INSERT INTO order_events (order_id, event_type, new_value)
  VALUES (
    v_order_id,
    COALESCE(payload ->> 'eventType', 'channel_order_updated'),
    jsonb_build_object('channel', v_channel_name, 'external_order_id', v_external_order_id)
  );

  IF v_source_event_id IS NOT NULL THEN
    UPDATE integration_events
    SET status = 'processed', processed_at = NOW(), locked_until = NULL
    WHERE id = v_source_event_id;
  END IF;

  RETURN jsonb_build_object('status', 'updated', 'order_id', v_order_id, 'order_number', v_order_number);
END;
$$;
