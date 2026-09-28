-- ============================================
-- 051: Legacy import RPC (atomic per-order import)
-- ============================================
-- The legacy import CLI calls this once per order. Doing the whole per-order
-- write in one PL/pgSQL block gives us:
--   * atomicity  — order + items + payment + channel identity + refunds +
--                  audit rows either all land or none do (PostgREST cannot
--                  do multi-table transactions)
--   * idempotency — the UNIQUE(channel, external_order_id) anchor on
--                  channel_orders is checked first; re-runs skip imported
--                  orders instead of duplicating them
--   * audit       — every source row (order + items + refund record) is
--                  preserved raw in legacy_import_records
--
-- Invoked with the service-role key (RLS service_role ALL policies exist on
-- every table touched here). Payload shape comes from
-- scripts/import-legacy-pos/lib/build.mjs.

CREATE OR REPLACE FUNCTION import_legacy_order(payload JSONB)
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
  v_channel_order_id UUID;
  v_order_number TEXT;
  v_external_order_id TEXT;
  v_channel_name TEXT;
  v_refund JSONB;
  v_refund_id UUID;
  v_refund_ids UUID[] := '{}';
  v_item JSONB;
  v_raw_order JSONB;
  v_raw_items JSONB;
  v_legacy JSONB;
  v_refunds JSONB;
  v_batch_id UUID;
BEGIN
  v_order := payload -> 'order';
  v_items := payload -> 'items';
  v_payment := payload -> 'payment';
  v_channel_order := payload -> 'channelOrder';
  v_refunds := COALESCE(payload -> 'refunds', '[]'::jsonb);
  v_raw_order := payload -> 'rawOrder';
  v_raw_items := payload -> 'rawItems';
  v_legacy := payload -> 'legacy';
  v_batch_id := NULLIF(payload ->> 'batchId', '')::uuid;

  v_order_number := v_order ->> 'order_number';
  v_external_order_id := v_channel_order ->> 'external_order_id';
  v_channel_name := v_channel_order ->> 'channel';

  IF v_external_order_id IS NULL OR v_external_order_id = '' THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'missing external_order_id');
  END IF;

  -- Idempotency anchor: skip if this external order was already imported.
  SELECT id INTO v_channel_order_id
  FROM channel_orders
  WHERE channel = v_channel_name::TEXT
    AND external_order_id = v_external_order_id;
  IF v_channel_order_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'channel_order_id', v_channel_order_id,
      'order_id', (SELECT order_id FROM channel_orders WHERE id = v_channel_order_id)
    );
  END IF;

  -- 1. Canonical order.
  INSERT INTO orders (
    order_number, display_code, status, source,
    delivery_type, fulfillment_type,
    subtotal_cents, discount_cents, delivery_fee_cents, total_cents,
    customer_id, customer_name, notes, include_cutlery,
    created_at, updated_at
  ) VALUES (
    v_order_number,
    v_order ->> 'display_code',
    COALESCE(v_order ->> 'status', 'delivered'),
    COALESCE(v_order ->> 'source', 'counter'),
    COALESCE(v_order ->> 'delivery_type', 'self_pickup'),
    COALESCE(v_order ->> 'fulfillment_type', 'asap'),
    (v_order ->> 'subtotal_cents')::integer,
    COALESCE((v_order ->> 'discount_cents')::integer, 0),
    COALESCE((v_order ->> 'delivery_fee_cents')::integer, 0),
    (v_order ->> 'total_cents')::integer,
    NULL,
    v_order ->> 'customer_name',
    v_order ->> 'notes',
    COALESCE((v_order ->> 'include_cutlery')::boolean, true),
    COALESCE((v_order ->> 'created_at')::timestamptz, NOW()),
    COALESCE((v_order ->> 'updated_at')::timestamptz, NOW())
  )
  RETURNING id INTO v_order_id;

  -- 2. Order items (catalog snapshots).
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

  -- 3. Payment (one per legacy order; external_ref = legacy System ID).
  INSERT INTO payments (
    order_id, method, amount_cents, status, external_ref, paid_at, raw
  ) VALUES (
    v_order_id,
    COALESCE(v_payment ->> 'method', 'other'),
    (v_payment ->> 'amount_cents')::integer,
    'succeeded',
    v_payment ->> 'external_ref',
    (v_payment ->> 'paid_at')::timestamptz,
    v_raw_order
  )
  RETURNING id INTO v_payment_id;

  -- 4. Channel identity (the idempotency anchor row).
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
    jsonb_build_object('order', v_raw_order, 'items', v_raw_items)
  )
  RETURNING id INTO v_channel_order_id;

  -- 5. Refunds linked to this order.
  FOR v_refund IN SELECT * FROM jsonb_array_elements(v_refunds) LOOP
    INSERT INTO refunds (
      order_id, payment_id, amount_cents, reason, external_ref, refunded_at, raw
    ) VALUES (
      v_order_id,
      v_payment_id,
      (v_refund ->> 'amount_cents')::integer,
      v_refund ->> 'reason',
      v_refund ->> 'external_ref',
      (v_refund ->> 'refunded_at')::timestamptz,
      v_refund -> 'raw'
    )
    RETURNING id INTO v_refund_id;
    v_refund_ids := array_append(v_refund_ids, v_refund_id);
  END LOOP;

  -- 6. Order audit event.
  INSERT INTO order_events (order_id, event_type, new_value)
  VALUES (
    v_order_id,
    'legacy_imported',
    jsonb_build_object(
      'legacy_invoice', v_legacy ->> 'invoice',
      'legacy_system_id', v_legacy ->> 'systemId',
      'legacy_order_group', v_legacy ->> 'orderGroup',
      'legacy_outlet', v_legacy ->> 'outlet'
    )
  );

  -- 7. Import audit records (raw order + raw items + refund records).
  INSERT INTO legacy_import_records (
    batch_id, legacy_order_group, legacy_system_id, legacy_invoice_no,
    record_type, raw, mapped_order_id, import_status
  )
  SELECT
    v_batch_id,
    v_legacy ->> 'orderGroup',
    v_legacy ->> 'systemId',
    v_legacy ->> 'invoice',
    'ORDER',
    v_raw_order,
    v_order_id,
    'imported';

  INSERT INTO legacy_import_records (
    batch_id, legacy_order_group, legacy_system_id, legacy_invoice_no,
    record_type, raw, mapped_order_id, import_status
  )
  SELECT
    v_batch_id,
    v_legacy ->> 'orderGroup',
    v_legacy ->> 'systemId',
    v_legacy ->> 'invoice',
    'ITEM',
    item_raw,
    v_order_id,
    'imported'
  FROM jsonb_array_elements(v_raw_items) AS item_raw;

  FOR v_refund IN SELECT * FROM jsonb_array_elements(v_refunds) LOOP
    INSERT INTO legacy_import_records (
      batch_id, legacy_order_group, legacy_system_id, legacy_invoice_no,
      record_type, raw, mapped_order_id, import_status
    ) VALUES (
      v_batch_id,
      v_legacy ->> 'orderGroup',
      v_refund ->> 'systemId',
      v_refund ->> 'invoice',
      'ORDER_REFUND',
      v_refund -> 'raw',
      v_order_id,
      'imported'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'imported',
    'order_id', v_order_id,
    'payment_id', v_payment_id,
    'channel_order_id', v_channel_order_id,
    'refund_ids', to_jsonb(v_refund_ids)
  );
END;
$$;

COMMENT ON FUNCTION import_legacy_order(JSONB) IS
  'Atomically imports one legacy POS order (order, items, payment, channel identity, refunds, audit). Idempotent via channel_orders(channel, external_order_id).';
