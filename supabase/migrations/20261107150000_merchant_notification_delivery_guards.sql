-- Preserve per-device order acknowledgements across asynchronous fan-out.
-- A newer order receives its own repeat window even if the previous schedule
-- expired before the worker cleaned it up. Historical migrations stay unchanged.
BEGIN;

-- Completion fences look up a device's durable sent history after the active
-- repeat row has been removed. Avoid scanning every device's delivery history.
CREATE INDEX merchant_notification_sent_history
  ON public.merchant_notification_deliveries(token_id, user_id, outbox_id)
  WHERE status = 'sent';

CREATE OR REPLACE FUNCTION public.claim_merchant_notification()
RETURNS TABLE(delivery_id uuid, lease_id uuid, event_id uuid, order_id uuid,
  user_id uuid, device_id text, token text, platform text,
  sound_enabled boolean, vibration_enabled boolean, alert_sound text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_event record; v_devices uuid[]; v_started timestamptz;
BEGIN
  FOR v_event IN SELECT o.id, o.order_id, o.fanout_cursor, o.fanout_started_at FROM public.merchant_notification_outbox o
    WHERE o.expanded_at IS NULL ORDER BY o.created_at, o.id LIMIT 10 FOR UPDATE SKIP LOCKED
  LOOP
    v_started := coalesce(v_event.fanout_started_at, now());
    -- Scan no more than 100 registrations per event per call. The cursor also advances
    -- past unauthorized or muted registrations. Installations created after fan-out began are excluded.
    SELECT array_agg(t.id ORDER BY t.id) INTO v_devices FROM (
      SELECT f.id FROM public.fcm_tokens f
      WHERE (v_event.fanout_cursor IS NULL OR f.id > v_event.fanout_cursor)
        AND f.created_at <= v_started AND f.order_alerts_enabled ORDER BY f.id LIMIT 100
    ) t;
    INSERT INTO public.merchant_notification_deliveries(outbox_id, token_id, user_id)
      SELECT v_event.id, t.id, t.user_id FROM public.fcm_tokens t
      WHERE t.id = ANY(v_devices) AND public.merchant_notification_user_authorized(t.user_id)
        AND NOT EXISTS (SELECT 1 FROM public.merchant_notification_views v
          WHERE v.token_id = t.id AND v.order_id = v_event.order_id)
      ON CONFLICT (outbox_id, token_id) DO NOTHING;
    UPDATE public.merchant_notification_outbox SET fanout_started_at = v_started,
      fanout_cursor = coalesce(v_devices[cardinality(v_devices)], v_event.fanout_cursor),
      expanded_at = CASE WHEN coalesce(cardinality(v_devices), 0) < 100 THEN now() ELSE NULL END
      WHERE id = v_event.id;
  END LOOP;

  -- Bounded cleanup also skips orders already viewed on this installation.
  WITH stale AS (
    SELECT d.id FROM public.merchant_notification_deliveries d
    JOIN public.merchant_notification_outbox o ON o.id = d.outbox_id
    WHERE (d.status = 'pending' OR (d.status = 'leased' AND d.lease_until <= now()))
      AND (d.attempts >= 8
        OR EXISTS (SELECT 1 FROM public.merchant_notification_views v
          WHERE v.token_id = d.token_id AND v.order_id = o.order_id)
        OR NOT EXISTS (SELECT 1 FROM public.fcm_tokens t
        WHERE t.id = d.token_id AND t.user_id = d.user_id
          AND t.order_alerts_enabled
          AND public.merchant_notification_user_authorized(t.user_id)))
    ORDER BY d.available_at, d.id LIMIT 100 FOR UPDATE OF d SKIP LOCKED
  ) UPDATE public.merchant_notification_deliveries d
    SET status = CASE WHEN d.attempts >= 8 THEN 'failed' ELSE 'skipped' END,
      lease_id = NULL, lease_until = NULL, completed_at = now()
    FROM stale WHERE d.id = stale.id;

  RETURN QUERY
  WITH candidate AS (
    SELECT d.id, t.registration_version FROM public.merchant_notification_deliveries d
    JOIN public.fcm_tokens t ON t.id = d.token_id AND t.user_id = d.user_id
    JOIN public.merchant_notification_outbox o ON o.id = d.outbox_id
    WHERE ((d.status = 'pending' AND d.available_at <= now())
      OR (d.status = 'leased' AND d.lease_until <= now()))
      AND d.attempts < 8 AND t.order_alerts_enabled
      AND public.merchant_notification_user_authorized(t.user_id)
      AND NOT EXISTS (SELECT 1 FROM public.merchant_notification_views v
        WHERE v.token_id = t.id AND v.order_id = o.order_id)
    ORDER BY d.available_at, d.id LIMIT 1 FOR UPDATE OF d SKIP LOCKED
  ), claimed AS (
    UPDATE public.merchant_notification_deliveries d SET status = 'leased',
      attempts = d.attempts + 1, lease_id = gen_random_uuid(), lease_until = now() + interval '2 minutes',
      claimed_version = c.registration_version
    FROM candidate c WHERE d.id = c.id RETURNING d.*
  ) SELECT c.id, c.lease_id, o.id, o.order_id, c.user_id, t.device_id, t.token, t.platform,
      t.sound_enabled, t.vibration_enabled, t.alert_sound
    FROM claimed c JOIN public.merchant_notification_outbox o ON o.id = c.outbox_id
    JOIN public.fcm_tokens t ON t.id = c.token_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_merchant_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_merchant_notification() TO service_role;


-- Expiration belongs to the previous order, not the next order's repeat window.
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
        -- The active repeat row may already be gone after a newer order was
        -- viewed or expired. Durable deliveries/views still fence old completions.
        AND NOT EXISTS (
          SELECT 1 FROM public.merchant_notification_deliveries newer
          JOIN public.merchant_notification_outbox newer_outbox ON newer_outbox.id = newer.outbox_id
          WHERE newer.token_id = t.id AND newer.user_id = t.user_id AND newer.status = 'sent'
            AND (newer_outbox.created_at, newer_outbox.id) > (v_outbox.created_at, v_outbox.id)
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.merchant_notification_views v
          JOIN public.merchant_notification_outbox newer_outbox ON newer_outbox.order_id = v.order_id
          WHERE v.token_id = t.id
            AND (newer_outbox.created_at, newer_outbox.id) > (v_outbox.created_at, v_outbox.id)
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


COMMIT;
