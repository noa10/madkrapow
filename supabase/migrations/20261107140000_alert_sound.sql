-- Per-device alert sound choice ("how the order alert sounds").
--
-- Background and terminated alerts are drawn by Android from the notification
-- channel, so the choice has to be mirrored into per-sound channel ids that the
-- worker targets: merchant_orders_<sound> / merchant_orders_<sound>_quiet.
-- 'system' and any unknown value keep the legacy default-sound channels.
BEGIN;

ALTER TABLE public.fcm_tokens
  ADD COLUMN IF NOT EXISTS alert_sound text NOT NULL DEFAULT 'krapow'
    CHECK (alert_sound IN ('krapow','bell','chime','system'));

-- Six-argument path used by the updated app; adds the alert sound choice.
-- Calling it proves the caller is a current build, so it enables repeat delivery.
CREATE OR REPLACE FUNCTION public.set_merchant_notification_preferences_v3(
  p_device_id text,
  p_order_alerts boolean,
  p_sound boolean,
  p_vibration boolean,
  p_repeat_until_viewed boolean,
  p_alert_sound text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR auth.role() IS DISTINCT FROM 'authenticated'
     OR NOT public.merchant_notification_user_authorized(v_user) THEN
    RAISE EXCEPTION 'Authorized merchant staff required' USING ERRCODE = '42501';
  END IF;
  IF p_device_id IS NULL OR length(p_device_id) NOT BETWEEN 22 AND 128
     OR p_device_id !~ '^[A-Za-z0-9_-]+$'
     OR p_order_alerts IS NULL OR p_sound IS NULL OR p_vibration IS NULL
     OR p_repeat_until_viewed IS NULL
     OR p_alert_sound NOT IN ('krapow','bell','chime','system') THEN
    RAISE EXCEPTION 'Invalid notification preferences' USING ERRCODE = '22023';
  END IF;
  UPDATE public.fcm_tokens
    SET order_alerts_enabled = p_order_alerts,
        sound_enabled = p_sound,
        vibration_enabled = p_vibration,
        repeat_until_viewed_enabled = p_repeat_until_viewed,
        alert_sound = p_alert_sound,
        repeat_client_capable = true,
        updated_at = now()
    WHERE device_id = p_device_id AND user_id = v_user;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT p_order_alerts OR NOT p_repeat_until_viewed THEN
    DELETE FROM public.merchant_notification_repeats r
      USING public.fcm_tokens t
      WHERE r.token_id = t.id AND t.device_id = p_device_id AND t.user_id = v_user;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.set_merchant_notification_preferences_v3(text,boolean,boolean,boolean,boolean,text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_merchant_notification_preferences_v3(text,boolean,boolean,boolean,boolean,text)
  TO authenticated;

-- The five-argument v2 callers (the previous app build) keep their sound at the
-- shipped default, so their UPDATE does not touch alert_sound.

-- The initial claim now carries the alert sound the worker should target.
-- CREATE OR REPLACE cannot change a function's return type, so drop first.
DROP FUNCTION IF EXISTS public.claim_merchant_notification();
CREATE FUNCTION public.claim_merchant_notification()
RETURNS TABLE(delivery_id uuid, lease_id uuid, event_id uuid, order_id uuid,
  user_id uuid, device_id text, token text, platform text,
  sound_enabled boolean, vibration_enabled boolean, alert_sound text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_event record; v_devices uuid[]; v_started timestamptz;
BEGIN
  FOR v_event IN SELECT o.id, o.fanout_cursor, o.fanout_started_at FROM public.merchant_notification_outbox o
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
      ON CONFLICT (outbox_id, token_id) DO NOTHING;
    UPDATE public.merchant_notification_outbox SET fanout_started_at = v_started,
      fanout_cursor = coalesce(v_devices[cardinality(v_devices)], v_event.fanout_cursor),
      expanded_at = CASE WHEN coalesce(cardinality(v_devices), 0) < 100 THEN now() ELSE NULL END
      WHERE id = v_event.id;
  END LOOP;

  -- Bounded cleanup of signed-out/reassigned/deactivated/muted recipients and exhausted crash leases.
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
      t.sound_enabled, t.vibration_enabled, t.alert_sound
    FROM claimed c JOIN public.merchant_notification_outbox o ON o.id = c.outbox_id
    JOIN public.fcm_tokens t ON t.id = c.token_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_merchant_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_merchant_notification() TO service_role;

-- The repeat claim carries the alert sound too. The return type changes, so
-- this also needs an explicit drop.
DROP FUNCTION IF EXISTS public.claim_merchant_notification_repeat();
CREATE FUNCTION public.claim_merchant_notification_repeat()
RETURNS TABLE(token_id uuid, lease_id uuid, order_id uuid, event_id uuid,
  user_id uuid, device_id text, token text, platform text,
  sound_enabled boolean, vibration_enabled boolean, alert_sound text, repeat_count smallint)
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
    t.alert_sound, v_row.repeat_count
  FROM public.fcm_tokens t WHERE t.id = v_row.token_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_merchant_notification_repeat()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_merchant_notification_repeat()
  TO service_role;

COMMIT;
