-- Per-device notification preferences.
-- The merchant app stores the same values locally and mirrors them here after
-- every token registration and every settings change. The worker reads them
-- when choosing the Android channel and the APNs sound.
BEGIN;

ALTER TABLE public.fcm_tokens
  ADD COLUMN IF NOT EXISTS order_alerts_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sound_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vibration_enabled boolean NOT NULL DEFAULT true;

-- Only the authenticated owner of the device row may change its preferences.
CREATE OR REPLACE FUNCTION public.set_merchant_notification_preferences(
  p_device_id text,
  p_order_alerts boolean,
  p_sound boolean,
  p_vibration boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR auth.role() IS DISTINCT FROM 'authenticated'
     OR NOT public.merchant_notification_user_authorized(v_user) THEN
    RAISE EXCEPTION 'Authorized merchant staff required' USING ERRCODE = '42501';
  END IF;
  -- Same installation-id contract as register_merchant_fcm_token.
  IF p_device_id IS NULL OR length(p_device_id) NOT BETWEEN 22 AND 128
     OR p_device_id !~ '^[A-Za-z0-9_-]+$'
     OR p_order_alerts IS NULL OR p_sound IS NULL OR p_vibration IS NULL THEN
    RAISE EXCEPTION 'Invalid notification preferences' USING ERRCODE = '22023';
  END IF;
  UPDATE public.fcm_tokens
    SET order_alerts_enabled = p_order_alerts,
        sound_enabled = p_sound,
        vibration_enabled = p_vibration,
        updated_at = now()
    WHERE device_id = p_device_id AND user_id = v_user;
  -- False means this installation has not registered yet; the app retries
  -- after the next token registration.
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.set_merchant_notification_preferences(text,boolean,boolean,boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_merchant_notification_preferences(text,boolean,boolean,boolean)
  TO authenticated;

-- The return type gains two columns, so the function must be recreated.
DROP FUNCTION IF EXISTS public.claim_merchant_notification();

-- Fan out at most ten newly committed events, then lease ONE recipient just before sending.
-- Repeated invocations are bounded by the worker; concurrent callers skip locked rows.
CREATE FUNCTION public.claim_merchant_notification()
RETURNS TABLE(delivery_id uuid, lease_id uuid, event_id uuid, order_id uuid,
  user_id uuid, device_id text, token text, platform text,
  sound_enabled boolean, vibration_enabled boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_event record; v_devices uuid[]; v_started timestamptz;
BEGIN
  FOR v_event IN SELECT o.id, o.fanout_cursor, o.fanout_started_at FROM public.merchant_notification_outbox o
    WHERE o.expanded_at IS NULL ORDER BY o.created_at, o.id LIMIT 10 FOR UPDATE SKIP LOCKED
  LOOP
    v_started := coalesce(v_event.fanout_started_at, now());
    -- Scan no more than 100 registrations per event per call. The cursor also advances
    -- past unauthorized or muted registrations. Installations created after fan-out began
    -- are excluded.
    SELECT array_agg(t.id ORDER BY t.id) INTO v_devices FROM (
      SELECT f.id FROM public.fcm_tokens f
      WHERE (v_event.fanout_cursor IS NULL OR f.id > v_event.fanout_cursor)
        AND f.created_at <= v_started AND f.order_alerts_enabled
      ORDER BY f.id LIMIT 100
    ) t;
    INSERT INTO public.merchant_notification_deliveries(outbox_id, token_id, user_id)
      SELECT v_event.id, t.id, t.user_id FROM public.fcm_tokens t
      WHERE t.id = ANY(v_devices) AND public.merchant_notification_user_authorized(t.user_id)
      ON CONFLICT (outbox_id, token_id) DO NOTHING;
    UPDATE public.merchant_notification_outbox SET fanout_started_at = v_started,
      fanout_cursor = coalesce(v_devices[cardinality(v_devices)], v_event.fanout_cursor),
      expanded_at = CASE WHEN coalesce(cardinality(v_devices), 0) < 100 THEN now() ELSE NULL END
      WHERE id = v_event.id;
  END LOOP;

  -- Bounded cleanup of signed-out/reassigned/deactivated/muted recipients and
  -- exhausted crash leases.
  WITH stale AS (
    SELECT d.id FROM public.merchant_notification_deliveries d
    WHERE (d.status = 'pending' OR (d.status = 'leased' AND d.lease_until <= now()))
      AND (d.attempts >= 8 OR NOT EXISTS (SELECT 1 FROM public.fcm_tokens t
        WHERE t.id = d.token_id AND t.user_id = d.user_id
          AND t.order_alerts_enabled
          AND public.merchant_notification_user_authorized(t.user_id)))
    ORDER BY d.available_at, d.id LIMIT 100 FOR UPDATE SKIP LOCKED
  ) UPDATE public.merchant_notification_deliveries d
    SET status = CASE WHEN d.attempts >= 8 THEN 'failed' ELSE 'skipped' END,
      lease_id = NULL, lease_until = NULL, completed_at = now()
    FROM stale WHERE d.id = stale.id;

  RETURN QUERY
  WITH candidate AS (
    SELECT d.id, t.registration_version FROM public.merchant_notification_deliveries d
    JOIN public.fcm_tokens t ON t.id = d.token_id AND t.user_id = d.user_id
    WHERE ((d.status = 'pending' AND d.available_at <= now())
      OR (d.status = 'leased' AND d.lease_until <= now()))
      AND d.attempts < 8 AND t.order_alerts_enabled
      AND public.merchant_notification_user_authorized(t.user_id)
    ORDER BY d.available_at, d.id LIMIT 1 FOR UPDATE OF d SKIP LOCKED
  ), claimed AS (
    UPDATE public.merchant_notification_deliveries d SET status = 'leased',
      attempts = d.attempts + 1, lease_id = gen_random_uuid(), lease_until = now() + interval '2 minutes',
      claimed_version = c.registration_version
    FROM candidate c WHERE d.id = c.id RETURNING d.*
  ) SELECT c.id, c.lease_id, o.id, o.order_id, c.user_id, t.device_id, t.token, t.platform,
      t.sound_enabled, t.vibration_enabled
    FROM claimed c JOIN public.merchant_notification_outbox o ON o.id = c.outbox_id
    JOIN public.fcm_tokens t ON t.id = c.token_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_merchant_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_merchant_notification() TO service_role;

COMMIT;
