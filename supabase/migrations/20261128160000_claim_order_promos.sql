-- Migration 20261128160000: atomic promo claims for checkout.
--
-- Checkout inserts a pending order with server-computed totals and promo_code_id,
-- then calls public.claim_order_promos() to record order_promo_applications and
-- consume promo capacity. The order row and every selected promo row are locked
-- before validation, so two checkouts can never both take the last redemption.
--
-- Interface:
--   public.claim_order_promos(p_order_id uuid, p_promos jsonb) RETURNS void
--   p_promos is a JSON array of
--     { "promo_id": uuid, "scope": "order"|"delivery", "discount_cents": positive int }
--   Entries must be unique by promo_id and by scope.
--
-- Expected claim conflicts raise SQLSTATE P0001 with message 'PROMO_UNAVAILABLE'.
-- The caller treats that as "the promo changed, is exhausted, or no longer matches
-- the order"; every other error propagates. The function writes nothing when it
-- raises, and it never releases capacity: once checkout may have created a payment
-- gateway, a consumed redemption stays consumed.
--
-- The validity window is required on both ends. Checkout selects promos with
-- .gte('valid_until', now) and .lte('valid_from', now), which excludes NULL bounds,
-- so a promo with an open-ended window can never be part of the snapshot being
-- claimed. Rejecting it here keeps the database check identical to the snapshot.
--
-- Only service_role may execute the function. It is SECURITY DEFINER with an empty
-- search_path so callers cannot shadow the tables it touches.
--
-- Apply this migration before deploying the checkout route that calls it. The
-- previously deployed route still uses increment_promo_code_usage and remains
-- compatible with this migration, so the migration can be applied first safely.

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_order_promos(
  p_order_id uuid,
  p_promos jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_promo public.promo_codes%ROWTYPE;
  v_entry record;
  v_now timestamptz := now();
  v_entry_count integer;
  v_distinct_promo_count integer;
  v_distinct_scope_count integer;
  v_invalid_scope_count integer;
  v_nonpositive_count integer;
  v_sum bigint;
  v_existing_count integer;
  v_expected_promo_code_id uuid;
  v_base integer;
  v_computed_numeric numeric;
  v_computed integer;
  v_updated integer;
BEGIN
  IF p_promos IS NULL THEN
    p_promos := '[]'::jsonb;
  END IF;

  IF jsonb_typeof(p_promos) <> 'array' THEN
    RAISE EXCEPTION 'p_promos must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  -- Structural validation happens before any lock is taken. Cast errors for a
  -- malformed uuid/integer propagate as invalid parameter values.
  SELECT
    count(*),
    count(DISTINCT e.promo_id),
    count(DISTINCT e.scope),
    count(*) FILTER (WHERE e.scope IS NULL OR e.scope NOT IN ('order', 'delivery')),
    count(*) FILTER (WHERE e.discount_cents IS NULL OR e.discount_cents <= 0),
    COALESCE(sum(e.discount_cents), 0)
  INTO
    v_entry_count,
    v_distinct_promo_count,
    v_distinct_scope_count,
    v_invalid_scope_count,
    v_nonpositive_count,
    v_sum
  FROM jsonb_to_recordset(p_promos)
    AS e(promo_id uuid, scope text, discount_cents integer);

  IF v_distinct_promo_count <> v_entry_count
     OR v_distinct_scope_count <> v_entry_count
     OR v_invalid_scope_count > 0
     OR v_nonpositive_count > 0 THEN
    RAISE EXCEPTION 'PROMO_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  -- Serialise retries for the same order. A second checkout attempt with the same
  -- order id waits here and then sees the applications written by the first.
  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id
      USING ERRCODE = 'P0002';
  END IF;

  -- A claim is only valid while the order is still awaiting payment. Once the
  -- order has advanced (paid, preparing, cancelled, ...), its promo snapshot is
  -- closed and no new redemption may be attached to it.
  IF v_order.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'PROMO_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_existing_count
  FROM public.order_promo_applications a
  WHERE a.order_id = p_order_id;

  IF v_existing_count > 0 THEN
    -- A retry is safe only when the stored applications are exactly the claim
    -- being replayed: same count, and every entry has a matching row.
    IF v_existing_count = v_entry_count
       AND NOT EXISTS (
         SELECT 1
         FROM jsonb_to_recordset(p_promos)
           AS e(promo_id uuid, scope text, discount_cents integer)
         WHERE NOT EXISTS (
           SELECT 1
           FROM public.order_promo_applications a
           WHERE a.order_id = p_order_id
             AND a.promo_id = e.promo_id
             AND a.scope = e.scope
             AND a.discount_cents = e.discount_cents
         )
       ) THEN
      RETURN;
    END IF;

    RAISE EXCEPTION 'PROMO_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  IF v_sum <> v_order.discount_cents THEN
    RAISE EXCEPTION 'PROMO_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  -- The order records the order-scope promo in promo_code_id. A delivery-only
  -- claim must leave it NULL, and an order-scope claim must name it exactly.
  SELECT e.promo_id INTO v_expected_promo_code_id
  FROM jsonb_to_recordset(p_promos)
    AS e(promo_id uuid, scope text, discount_cents integer)
  WHERE e.scope = 'order';

  IF v_order.promo_code_id IS DISTINCT FROM v_expected_promo_code_id THEN
    RAISE EXCEPTION 'PROMO_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  -- Lock every selected promo in promo_id order so concurrent claims cannot
  -- deadlock, then validate the row as it exists after the lock is granted.
  FOR v_entry IN
    SELECT e.promo_id, e.scope, e.discount_cents
    FROM jsonb_to_recordset(p_promos)
      AS e(promo_id uuid, scope text, discount_cents integer)
    ORDER BY e.promo_id
  LOOP
    SELECT p.* INTO v_promo
    FROM public.promo_codes p
    WHERE p.id = v_entry.promo_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PROMO_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;

    IF v_promo.scope IS DISTINCT FROM v_entry.scope
       OR v_promo.is_active IS NOT TRUE
       OR v_promo.valid_from IS NULL
       OR v_promo.valid_until IS NULL
       OR v_promo.valid_from > v_now
       OR v_promo.valid_until < v_now
       OR (v_promo.max_uses IS NOT NULL AND v_promo.current_uses >= v_promo.max_uses) THEN
      RAISE EXCEPTION 'PROMO_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;

    v_base := CASE v_entry.scope
      WHEN 'delivery' THEN v_order.delivery_fee_cents
      ELSE v_order.subtotal_cents
    END;

    IF v_base < 0
       OR (v_promo.min_order_amount_cents IS NOT NULL
           AND v_base < v_promo.min_order_amount_cents) THEN
      RAISE EXCEPTION 'PROMO_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;

    IF v_promo.discount_type = 'percentage' THEN
      -- Numeric round() is half-away-from-zero, matching JS Math.round for the
      -- non-negative amounts checkout sends. Keep the result numeric until after
      -- the cap: casting a huge percentage to integer first would overflow before
      -- LEAST could clamp it to the order base.
      v_computed_numeric := round(v_base::numeric * v_promo.discount_value / 100);
    ELSIF v_promo.discount_type = 'fixed' THEN
      v_computed_numeric := v_promo.discount_value::numeric;
    ELSE
      RAISE EXCEPTION 'PROMO_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;

    v_computed_numeric := LEAST(
      v_computed_numeric,
      COALESCE(v_promo.max_discount_cents, v_base)::numeric,
      v_base::numeric
    );
    v_computed := v_computed_numeric::integer;

    IF v_computed <> v_entry.discount_cents THEN
      RAISE EXCEPTION 'PROMO_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  INSERT INTO public.order_promo_applications (order_id, promo_id, scope, discount_cents)
  SELECT p_order_id, e.promo_id, e.scope, e.discount_cents
  FROM jsonb_to_recordset(p_promos)
    AS e(promo_id uuid, scope text, discount_cents integer);

  -- The rows are already locked and validated, but the conditional UPDATE keeps
  -- the cap atomic even if a future caller reaches the counter without the lock.
  FOR v_entry IN
    SELECT e.promo_id
    FROM jsonb_to_recordset(p_promos)
      AS e(promo_id uuid, scope text, discount_cents integer)
    ORDER BY e.promo_id
  LOOP
    UPDATE public.promo_codes p
    SET current_uses = p.current_uses + 1
    WHERE p.id = v_entry.promo_id
      AND (p.max_uses IS NULL OR p.current_uses + 1 <= p.max_uses);

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'PROMO_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_order_promos(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_promos(uuid, jsonb) TO service_role;

-- increment_promo_code_usage had a read-then-update TOCTOU: two callers could both
-- read current_uses = max_uses - 1 and both increment. Collapse the check into the
-- UPDATE so the cap is enforced by one atomic statement. The boolean contract is
-- unchanged: false for a non-positive increment, a missing promo, or an exhausted
-- promo; true only when the counter moved.
CREATE OR REPLACE FUNCTION public.increment_promo_code_usage(
  p_promo_id uuid,
  p_increment integer DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_increment IS NULL OR p_increment <= 0 THEN
    RETURN false;
  END IF;

  UPDATE public.promo_codes p
  SET current_uses = p.current_uses + p_increment
  WHERE p.id = p_promo_id
    AND (p.max_uses IS NULL OR p.current_uses + p_increment <= p.max_uses);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_promo_code_usage(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_promo_code_usage(uuid, integer) TO service_role;

COMMIT;
