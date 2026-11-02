-- ============================================
-- 066: GrabFood staging integration
-- ============================================
-- Adds the persistence the staging integration needs:
--   * integration_events lease/retry columns (crash recovery + replay cron)
--   * grabfood_integrations (self-serve activation, store mapping, sync state)
--   * grabfood_menu_snapshots (Push Grab Menu export for review)
--   * channel_products.snooze_restore_required (durable timed restore)
--   * apply_channel_order RPC (create or edit the same external order)
--
-- Rollback:
--   DROP FUNCTION IF EXISTS apply_channel_order(JSONB);
--   DROP TABLE IF EXISTS grabfood_menu_snapshots;
--   DROP TABLE IF EXISTS grabfood_integrations;
--   ALTER TABLE channel_products DROP COLUMN IF EXISTS snooze_restore_required;
--   ALTER TABLE integration_events DROP COLUMN IF EXISTS next_attempt_at,
--     DROP COLUMN IF EXISTS locked_until, DROP COLUMN IF EXISTS attempts;

BEGIN;

-- ========================================
-- PART A: integration event lease/retry
-- ========================================
ALTER TABLE integration_events
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_integration_events_replay
  ON integration_events (provider, status, next_attempt_at)
  WHERE status IN ('received', 'failed');

COMMENT ON COLUMN integration_events.attempts IS
  'Processing attempts; replay stops at the handler retry budget.';
COMMENT ON COLUMN integration_events.locked_until IS
  'Lease held by the worker processing this event; expired leases are replayable.';

-- ========================================
-- PART B: store integration / activation
-- ========================================
CREATE TABLE IF NOT EXISTS grabfood_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_merchant_id TEXT NOT NULL UNIQUE,
  grab_merchant_id TEXT,
  integration_status TEXT NOT NULL DEFAULT 'INACTIVE'
    CHECK (integration_status IN ('INACTIVE', 'SYNCING', 'ACTIVE', 'FAILED')),
  activation_url TEXT,
  last_menu_sync_status TEXT,
  last_menu_sync_at TIMESTAMPTZ,
  last_menu_sync_error TEXT,
  last_menu_sync_job_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grabfood_integrations_grab_merchant
  ON grabfood_integrations (grab_merchant_id)
  WHERE grab_merchant_id IS NOT NULL;

COMMENT ON TABLE grabfood_integrations IS
  'One row per POS outlet: Grab/POS store mapping, activation journey and last menu sync state.';

-- ========================================
-- PART C: Push Grab Menu snapshots
-- ========================================
CREATE TABLE IF NOT EXISTS grabfood_menu_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grab_merchant_id TEXT,
  partner_merchant_id TEXT,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grabfood_menu_snapshots_merchant
  ON grabfood_menu_snapshots (grab_merchant_id, received_at DESC);

COMMENT ON TABLE grabfood_menu_snapshots IS
  'Menus pushed by Grab during self-serve activation. Stored for review; never auto-activated.';

-- ========================================
-- PART D: durable snooze restore flag
-- ========================================
ALTER TABLE channel_products
  ADD COLUMN IF NOT EXISTS snooze_restore_required BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_channel_products_snooze_restore
  ON channel_products (snooze_till)
  WHERE snooze_restore_required = true;

COMMENT ON COLUMN channel_products.snooze_restore_required IS
  'True after a snooze is pushed as UNAVAILABLE; the menu-restore cron clears it after pushing the restored state.';

-- ========================================
-- PART E: create-or-edit RPC
-- ========================================
-- The old import_channel_order RPC treats every repeat as a duplicate. Grab
-- resends edited/recalculated orders with the same orderID and
-- featureFlags.isMexEditOrder=true; those must update the existing order.
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
      AND attempts = (payload ->> 'sourceEventAttempts')::integer
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

COMMENT ON FUNCTION apply_channel_order(JSONB) IS
  'Create or edit one sales-channel webhook order. Edits require payload.isEdit=true and update the same orderID in place.';

-- ========================================
-- PART F: RLS
-- ========================================
ALTER TABLE grabfood_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE grabfood_menu_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_grabfood_integrations" ON grabfood_integrations
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "admin_manager_select_grabfood_integrations" ON grabfood_integrations
  FOR SELECT USING (is_admin_or_manager());

CREATE POLICY "service_role_all_grabfood_menu_snapshots" ON grabfood_menu_snapshots
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "admin_manager_select_grabfood_menu_snapshots" ON grabfood_menu_snapshots
  FOR SELECT USING (is_admin_or_manager());

COMMIT;
