-- Repeat alerts every 10 seconds instead of 60, keeping the 15-minute cap.
-- With a 10-second cadence the 15-minute window allows up to 90 repeats, so the
-- sequence ceiling and the worker/Flutter clamps rise from 15 to 90 as well.
BEGIN;

ALTER TABLE public.merchant_notification_repeats
  DROP CONSTRAINT IF EXISTS merchant_notification_repeats_repeat_count_check,
  ADD CONSTRAINT merchant_notification_repeats_repeat_count_check
    CHECK (repeat_count BETWEEN 0 AND 90);

-- Only the arming interval changes; terminal/backoff behaviour is untouched.
CREATE OR REPLACE FUNCTION public.complete_merchant_notification(
  p_delivery_id uuid,
  p_lease_id uuid,
  p_outcome text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_delivery public.merchant_notification_deliveries%ROWTYPE;
  v_outbox public.merchant_notification_outbox%ROWTYPE;
  v_outbox_at timestamptz := now();
  v_outcome text := p_outcome;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent','retry','unregistered') THEN
    RAISE EXCEPTION 'Invalid delivery outcome' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_delivery FROM public.merchant_notification_deliveries
    WHERE id = p_delivery_id AND lease_id = p_lease_id AND status = 'leased'
      AND lease_until > now()
    FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  -- FCM confirmed UNREGISTERED for this exact registration version, not a refreshed token.
  IF p_outcome = 'unregistered' THEN
    DELETE FROM public.fcm_tokens WHERE id = v_delivery.token_id
      AND user_id = v_delivery.user_id AND registration_version = v_delivery.claimed_version;
    IF NOT FOUND AND EXISTS (SELECT 1 FROM public.fcm_tokens t
      WHERE t.id = v_delivery.token_id AND t.user_id = v_delivery.user_id
        AND t.registration_version <> v_delivery.claimed_version) THEN
      v_outcome := 'retry'; -- The replacement registration has not been tried yet.
    END IF;
  END IF;
  UPDATE public.merchant_notification_deliveries
    SET status = CASE WHEN v_outcome = 'retry' THEN CASE WHEN attempts >= 8 THEN 'failed' ELSE 'pending' END ELSE v_outcome END,
      available_at = now() + least(3600, (30 * power(2, attempts - 1))::integer) * interval '1 second',
      completed_at = CASE WHEN v_outcome <> 'retry' OR attempts >= 8 THEN now() ELSE NULL END,
      lease_id = NULL, lease_until = NULL
    WHERE id = p_delivery_id;

  IF v_outcome = 'sent' THEN
    SELECT * INTO v_outbox FROM public.merchant_notification_outbox WHERE id = v_delivery.outbox_id;
    IF v_outbox.id IS NOT NULL THEN
      INSERT INTO public.merchant_notification_repeats AS r (
        token_id, user_id, order_id, outbox_id, outbox_created_at,
        started_at, next_at, expires_at, repeat_count
      )
      SELECT t.id, v_delivery.user_id, v_outbox.order_id, v_outbox.id, v_outbox.created_at,
        v_outbox_at, v_outbox_at + interval '10 seconds',
        v_outbox_at + interval '15 minutes', 0
      FROM public.fcm_tokens t
      WHERE t.id = v_delivery.token_id AND t.user_id = v_delivery.user_id
        AND t.order_alerts_enabled AND t.repeat_until_viewed_enabled
        AND t.repeat_client_capable
        AND public.merchant_notification_user_authorized(t.user_id)
        AND NOT EXISTS (
          SELECT 1 FROM public.merchant_notification_views v
          WHERE v.token_id = t.id AND v.order_id = v_outbox.order_id
        )
      ON CONFLICT (token_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        order_id = EXCLUDED.order_id,
        outbox_id = EXCLUDED.outbox_id,
        outbox_created_at = EXCLUDED.outbox_created_at,
        started_at = EXCLUDED.started_at,
        next_at = EXCLUDED.next_at,
        expires_at = EXCLUDED.expires_at,
        repeat_count = 0,
        lease_id = NULL,
        lease_until = NULL,
        claimed_version = NULL
      WHERE (v_outbox.created_at, v_outbox.id) > (r.outbox_created_at, r.outbox_id)
        AND v_outbox_at < r.expires_at
        AND NOT EXISTS (SELECT 1 FROM public.merchant_notification_views v
          WHERE v.token_id = r.token_id AND v.order_id = v_outbox.order_id)
        AND NOT EXISTS (
          SELECT 1 FROM public.merchant_notification_repeats newer
          JOIN public.merchant_notification_outbox newer_outbox ON newer_outbox.id = newer.outbox_id
          WHERE newer.token_id = r.token_id
            AND (newer_outbox.created_at, newer_outbox.id) > (v_outbox.created_at, v_outbox.id)
        );
    END IF;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_merchant_notification(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_merchant_notification(uuid,uuid,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_merchant_notification_repeat()
RETURNS TABLE(token_id uuid, lease_id uuid, order_id uuid, event_id uuid,
  user_id uuid, device_id text, token text, platform text,
  sound_enabled boolean, vibration_enabled boolean, repeat_count smallint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_token uuid; v_row public.merchant_notification_repeats%ROWTYPE;
  v_lease uuid;
BEGIN
  WITH stale AS (
    SELECT r.token_id FROM public.merchant_notification_repeats r
    LEFT JOIN public.fcm_tokens t ON t.id = r.token_id
    WHERE r.expires_at <= now()
       OR r.next_at >= r.expires_at
       OR t.id IS NULL
       OR t.user_id IS DISTINCT FROM r.user_id
       OR NOT t.order_alerts_enabled
       OR NOT t.repeat_until_viewed_enabled
       OR NOT t.repeat_client_capable
       OR NOT public.merchant_notification_user_authorized(t.user_id)
       OR EXISTS (SELECT 1 FROM public.merchant_notification_views v
         WHERE v.token_id = r.token_id AND v.order_id = r.order_id)
    ORDER BY r.next_at, r.token_id
    LIMIT 100
    FOR UPDATE OF r SKIP LOCKED
  )
  DELETE FROM public.merchant_notification_repeats r USING stale
    WHERE r.token_id = stale.token_id;

  SELECT r.token_id INTO v_token
  FROM public.merchant_notification_repeats r
  JOIN public.fcm_tokens t ON t.id = r.token_id AND t.user_id = r.user_id
  WHERE r.next_at <= now()
    AND r.next_at < r.expires_at
    AND (r.lease_until IS NULL OR r.lease_until <= now())
    AND r.repeat_count < 90
    AND t.order_alerts_enabled AND t.repeat_until_viewed_enabled
    AND t.repeat_client_capable
    AND public.merchant_notification_user_authorized(t.user_id)
    AND NOT EXISTS (SELECT 1 FROM public.merchant_notification_views v
      WHERE v.token_id = r.token_id AND v.order_id = r.order_id)
  ORDER BY r.next_at, r.token_id
  LIMIT 1
  FOR UPDATE OF r SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;

  v_lease := gen_random_uuid();
  UPDATE public.merchant_notification_repeats r
    SET lease_id = v_lease,
        lease_until = now() + interval '2 minutes',
        claimed_version = t.registration_version,
        repeat_count = (r.repeat_count + 1)::smallint,
        next_at = now() + interval '10 seconds'
    FROM public.fcm_tokens t
    WHERE r.token_id = v_token AND t.id = v_token
    RETURNING r.* INTO v_row;

  RETURN QUERY
  SELECT v_row.token_id, v_lease, v_row.order_id, v_row.outbox_id, v_row.user_id,
    t.device_id, t.token, t.platform, t.sound_enabled, t.vibration_enabled,
    v_row.repeat_count
  FROM public.fcm_tokens t WHERE t.id = v_row.token_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_merchant_notification_repeat()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_merchant_notification_repeat()
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_merchant_notification_repeat(
  p_token_id uuid,
  p_lease_id uuid,
  p_outcome text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_repeat public.merchant_notification_repeats%ROWTYPE;
  v_outcome text := p_outcome;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent','retry','unregistered') THEN
    RAISE EXCEPTION 'Invalid repeat outcome' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_repeat FROM public.merchant_notification_repeats
    WHERE token_id = p_token_id AND lease_id = p_lease_id
      AND lease_until > now()
    FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF p_outcome = 'unregistered' THEN
    DELETE FROM public.fcm_tokens
      WHERE id = v_repeat.token_id AND user_id = v_repeat.user_id
        AND registration_version = v_repeat.claimed_version;
    IF FOUND THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM public.fcm_tokens t
      WHERE t.id = v_repeat.token_id AND t.user_id = v_repeat.user_id
        AND t.registration_version IS DISTINCT FROM v_repeat.claimed_version) THEN
      v_outcome := 'retry';
    END IF;
  END IF;

  IF v_outcome = 'sent'
     AND (v_repeat.repeat_count >= 90 OR v_repeat.next_at >= v_repeat.expires_at) THEN
    DELETE FROM public.merchant_notification_repeats WHERE token_id = v_repeat.token_id;
    RETURN true;
  END IF;

  UPDATE public.merchant_notification_repeats
    SET lease_id = NULL,
        lease_until = NULL,
        claimed_version = NULL,
        next_at = CASE WHEN v_outcome = 'retry'
          THEN now() + interval '30 seconds' ELSE next_at END
    WHERE token_id = v_repeat.token_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_merchant_notification_repeat(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_merchant_notification_repeat(uuid,uuid,text)
  TO service_role;

COMMIT;
