-- ============================================
-- 20261126120000: atomic staff confirmation that Grab already has "ready"
-- ============================================
-- When a GrabFood order is already marked ready in the Grab merchant app, a
-- manager confirms it locally. The old route did this as three separate
-- statements (claim, order, audit). A crash between them could leave a claim
-- saying Grab was told, an order still preparing, or a Ready order with no
-- audit row.
--
-- This RPC owns the whole confirmation in one transaction:
--   * locks the order row first, then the claim row (the same order the
--     outbound markGrabOrderReady service uses);
--   * refuses non-GrabFood, unpaid/pending, and already-finished orders;
--   * never takes over a pending claim (the outbound request may be in flight);
--   * promotes failed/uncertain claims to sent, because the manager has just
--     asserted Grab already has the order;
--   * writes the order status and the status_changed audit row together, so a
--     failure to audit also rolls the status change back;
--   * is idempotent: a repeat confirmation changes nothing and reports
--     duplicate = true.
--
-- The route keeps the admin/manager authorization check; this function is
-- service_role only and is not a substitute for that check.

BEGIN;

CREATE OR REPLACE FUNCTION public.confirm_grabfood_order_ready(
  p_order_id UUID,
  p_actor_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_claim grabfood_ready_claims%ROWTYPE;
  v_new_token UUID := gen_random_uuid();
  v_claim_token UUID;
  v_previous_claim_state TEXT;
  v_inserted INTEGER := 0;
  v_was_sent BOOLEAN := false;
  v_changed BOOLEAN;
BEGIN
  -- The route has already authenticated the staff member. A null actor would
  -- make the audit row unattributable, so refuse it rather than writing one.
  IF p_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'actor_required');
  END IF;

  -- Lock the order first. The outbound service updates this row before it
  -- touches the claim, so taking the same row first gives both paths one
  -- serialization point and lets us verify the state we are about to change.
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF v_order.source <> 'grabfood' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_grabfood');
  END IF;

  -- Pending means no money has been recorded. Telling Grab the food is ready
  -- before payment would let a delivery leave against an unconfirmed order.
  IF v_order.status = 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'pending');
  END IF;

  IF v_order.status NOT IN ('paid', 'preparing', 'ready') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'not_eligible',
      'current_status', v_order.status
    );
  END IF;

  -- Insert first so a concurrent outbound claim cannot slip in between our
  -- read and our write. ON CONFLICT leaves an existing claim untouched; the
  -- SELECT ... FOR UPDATE then waits for any in-flight outbound transaction
  -- and gives us its final state.
  INSERT INTO grabfood_ready_claims (order_id, state, claim_token, updated_at)
  VALUES (p_order_id, 'sent', v_new_token, now())
  ON CONFLICT (order_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT * INTO v_claim
  FROM grabfood_ready_claims
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- The order row is locked, so the only way here is an inconsistent manual
    -- deletion. Abort rather than report a confirmation with no claim.
    RAISE EXCEPTION 'grabfood_ready_claims row missing for order %', p_order_id;
  END IF;

  v_previous_claim_state := CASE WHEN v_inserted = 0 THEN v_claim.state ELSE NULL END;

  -- A pending claim belongs to an outbound request that may still be talking
  -- to Grab. Never overwrite it; the operator can retry after it settles.
  IF v_claim.state = 'pending' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'in_progress',
      'claim_updated_at', v_claim.updated_at
    );
  END IF;

  IF v_claim.state = 'sent' THEN
    -- v_inserted = 1 means the sent claim is ours; = 0 means it predates this
    -- call, which is what makes the repeat confirmation a duplicate.
    v_was_sent := (v_inserted = 0);
    v_claim_token := v_claim.claim_token;
  ELSE
    -- failed / uncertain: the manager has checked Grab and says it is ready,
    -- so the durable claim becomes sent under a fresh token. The old token is
    -- no longer valid for an outbound compare-and-swap.
    UPDATE grabfood_ready_claims
    SET state = 'sent',
        claim_token = v_new_token,
        updated_at = now()
    WHERE order_id = p_order_id;

    v_claim_token := v_new_token;
  END IF;

  v_changed := v_order.status <> 'ready';

  IF v_changed THEN
    UPDATE orders
    SET status = 'ready',
        updated_at = now()
    WHERE id = p_order_id
      AND status = v_order.status
      AND source = 'grabfood';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'orders row changed while locked for order %', p_order_id;
    END IF;
  END IF;

  -- The audit row is part of the same transaction as the status change. If
  -- this insert fails, the order update and claim promotion roll back too.
  IF v_changed THEN
    INSERT INTO order_events (
      order_id,
      event_type,
      old_value,
      new_value,
      actor_id
    ) VALUES (
      p_order_id,
      'status_changed',
      jsonb_build_object('status', v_order.status),
      jsonb_build_object(
        'status', 'ready',
        'reason', 'already_marked_ready_in_grab',
        'claim_token', v_claim_token,
        'previous_claim_state', v_previous_claim_state
      ),
      p_actor_id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'ready',
    'changed', v_changed,
    'duplicate', (NOT v_changed AND v_was_sent),
    'previous_status', v_order.status,
    'claim_token', v_claim_token
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_grabfood_order_ready(UUID, UUID) IS
  'Atomically confirm that a GrabFood order is already marked ready in Grab: locks order+claim, promotes failed/uncertain claims, blocks pending, and writes status plus audit together.';

REVOKE ALL ON FUNCTION public.confirm_grabfood_order_ready(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_grabfood_order_ready(UUID, UUID)
  TO service_role;

COMMIT;
