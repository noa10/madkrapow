-- Repeat new-order alerts until the order is opened on this device.
-- Repeats are server-side because Android draws notification payloads itself
-- when the app is backgrounded or terminated. The app acknowledges a view when
-- the order detail screen becomes visible.
BEGIN;

ALTER TABLE public.fcm_tokens
  ADD COLUMN IF NOT EXISTS repeat_until_viewed_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS repeat_client_capable boolean NOT NULL DEFAULT false;

-- One active repeat per device. A newer order replaces the row, which is what
-- makes only the latest unviewed order repeat.
CREATE TABLE IF NOT EXISTS public.merchant_notification_repeats (
  token_id uuid PRIMARY KEY REFERENCES public.fcm_tokens(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  outbox_id uuid NOT NULL REFERENCES public.merchant_notification_outbox(id) ON DELETE CASCADE,
  outbox_created_at timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  next_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  -- The wall-clock deadline is the hard stop; the count is the payload sequence.
  repeat_count smallint NOT NULL DEFAULT 0 CHECK (repeat_count BETWEEN 0 AND 15),
  lease_id uuid,
  lease_until timestamptz,
  claimed_version uuid,
  CHECK ((lease_id IS NULL) = (lease_until IS NULL))
);
CREATE INDEX IF NOT EXISTS merchant_notification_repeat_due
  ON public.merchant_notification_repeats(next_at);

-- Per-device acknowledgement. A view on one installation does not stop repeats
-- on another device.
CREATE TABLE IF NOT EXISTS public.merchant_notification_views (
  token_id uuid NOT NULL REFERENCES public.fcm_tokens(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token_id, order_id)
);

ALTER TABLE public.merchant_notification_repeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_notification_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_notification_repeats, public.merchant_notification_views
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.merchant_notification_repeats, public.merchant_notification_views
  TO service_role;
DROP POLICY IF EXISTS merchant_repeats_service_read ON public.merchant_notification_repeats;
CREATE POLICY merchant_repeats_service_read ON public.merchant_notification_repeats
  FOR SELECT TO service_role USING (true);
DROP POLICY IF EXISTS merchant_views_service_read ON public.merchant_notification_views;
CREATE POLICY merchant_views_service_read ON public.merchant_notification_views
  FOR SELECT TO service_role USING (true);

-- Four-argument compatibility path kept for old merchant APKs. It preserves the
-- user's repeat choice, but marks the caller incapable of repeats so an old
-- build cannot receive alerts it cannot stop.
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
  IF p_device_id IS NULL OR length(p_device_id) NOT BETWEEN 22 AND 128
     OR p_device_id !~ '^[A-Za-z0-9_-]+$'
     OR p_order_alerts IS NULL OR p_sound IS NULL OR p_vibration IS NULL THEN
    RAISE EXCEPTION 'Invalid notification preferences' USING ERRCODE = '22023';
  END IF;
  UPDATE public.fcm_tokens
    SET order_alerts_enabled = p_order_alerts,
        sound_enabled = p_sound,
        vibration_enabled = p_vibration,
        repeat_client_capable = false,
        updated_at = now()
    WHERE device_id = p_device_id AND user_id = v_user;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM public.merchant_notification_repeats r
    USING public.fcm_tokens t
    WHERE r.token_id = t.id AND t.device_id = p_device_id AND t.user_id = v_user;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.set_merchant_notification_preferences(text,boolean,boolean,boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_merchant_notification_preferences(text,boolean,boolean,boolean)
  TO authenticated;

-- Five-argument path used by the updated app. Calling it proves the caller can
-- acknowledge views and disable repeats, so it enables repeat delivery.
CREATE OR REPLACE FUNCTION public.set_merchant_notification_preferences_v2(
  p_device_id text,
  p_order_alerts boolean,
  p_sound boolean,
  p_vibration boolean,
  p_repeat_until_viewed boolean
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
     OR p_repeat_until_viewed IS NULL THEN
    RAISE EXCEPTION 'Invalid notification preferences' USING ERRCODE = '22023';
  END IF;
  UPDATE public.fcm_tokens
    SET order_alerts_enabled = p_order_alerts,
        sound_enabled = p_sound,
        vibration_enabled = p_vibration,
        repeat_until_viewed_enabled = p_repeat_until_viewed,
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
REVOKE ALL ON FUNCTION public.set_merchant_notification_preferences_v2(text,boolean,boolean,boolean,boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_merchant_notification_preferences_v2(text,boolean,boolean,boolean,boolean)
  TO authenticated;

-- A different user on the same installation must not inherit repeat state.
CREATE OR REPLACE FUNCTION public.merchant_fcm_reset_repeat_on_owner_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    NEW.repeat_until_viewed_enabled := true;
    NEW.repeat_client_capable := false;
    DELETE FROM public.merchant_notification_repeats WHERE token_id = NEW.id;
    DELETE FROM public.merchant_notification_views WHERE token_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.merchant_fcm_reset_repeat_on_owner_change()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS merchant_fcm_reset_repeat_on_owner_change ON public.fcm_tokens;
CREATE TRIGGER merchant_fcm_reset_repeat_on_owner_change
  BEFORE UPDATE OF user_id ON public.fcm_tokens
  FOR EACH ROW EXECUTE FUNCTION public.merchant_fcm_reset_repeat_on_owner_change();

-- The existing completion path keeps its signature and terminal/backoff rules.
-- On a successful first send it arms the device's next-order repeat window.
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
        v_outbox_at, v_outbox_at + interval '60 seconds',
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
            AND (newer_outbox.created_at, newer.outbox_id) > (v_outbox.created_at, v_outbox.id)
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

-- Clean up bounded rows, then lease one due repeat. A repeat is never armed for
-- a viewed, muted, unauthorized or superseded order.
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
    AND r.repeat_count < 15
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
        next_at = now() + interval '60 seconds'
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
     AND (v_repeat.repeat_count >= 15 OR v_repeat.next_at >= v_repeat.expires_at) THEN
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

-- Per-device view acknowledgement. Stopping the repeat and skipping an unsent
-- delivery are both scoped to this caller's own installation.
CREATE OR REPLACE FUNCTION public.acknowledge_merchant_order_view(
  p_device_id text,
  p_order_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid(); v_token uuid; v_order uuid;
BEGIN
  IF v_user IS NULL OR auth.role() IS DISTINCT FROM 'authenticated'
     OR NOT public.merchant_notification_user_authorized(v_user) THEN
    RAISE EXCEPTION 'Authorized merchant staff required' USING ERRCODE = '42501';
  END IF;
  IF p_device_id IS NULL OR length(p_device_id) NOT BETWEEN 22 AND 128
     OR p_device_id !~ '^[A-Za-z0-9_-]+$'
     OR p_order_id IS NULL
     OR p_order_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid order view acknowledgement' USING ERRCODE = '22023';
  END IF;
  v_order := p_order_id::uuid;

  SELECT id INTO v_token FROM public.fcm_tokens
    WHERE device_id = p_device_id AND user_id = v_user;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = v_order) THEN
    RETURN false;
  END IF;

  INSERT INTO public.merchant_notification_views(token_id, order_id)
  VALUES (v_token, v_order)
  ON CONFLICT (token_id, order_id) DO UPDATE SET viewed_at = now();

  DELETE FROM public.merchant_notification_repeats
    WHERE token_id = v_token AND order_id = v_order;

  WITH target AS (
    SELECT d.id FROM public.merchant_notification_deliveries d
    JOIN public.merchant_notification_outbox o ON o.id = d.outbox_id
    WHERE d.token_id = v_token AND d.user_id = v_user
      AND o.order_id = v_order
      AND d.status IN ('pending','leased')
    FOR UPDATE OF d SKIP LOCKED
  )
  UPDATE public.merchant_notification_deliveries d
    SET status = 'skipped', lease_id = NULL, lease_until = NULL, completed_at = now()
    FROM target WHERE d.id = target.id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.acknowledge_merchant_order_view(text,text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.acknowledge_merchant_order_view(text,text)
  TO authenticated;

COMMENT ON TABLE public.merchant_notification_repeats IS
  'One active repeat schedule per device. The newest unviewed order replaces the previous row.';
COMMENT ON TABLE public.merchant_notification_views IS
  'Per-device order views. A view stops repeats only for that installation.';

COMMIT;
