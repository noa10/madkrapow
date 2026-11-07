-- Durable merchant notifications. No network calls occur in an order transaction.
-- 074's atomic QR/bulk writers must insert the existing order_events markers.
BEGIN;

-- An owner with no employee row must be provisioned explicitly (see notify-admin/README.md).
-- Absence of an employee is not, by itself, proof that an admin is an owner.
CREATE TABLE public.merchant_notification_owners (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
CREATE TABLE public.merchant_notification_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  activated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.merchant_notification_config DEFAULT VALUES;

CREATE FUNCTION public.merchant_notification_user_authorized(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    LEFT JOIN public.employees e ON e.auth_user_id = u.id
    WHERE u.id = p_user_id AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())
      AND u.raw_app_meta_data->>'role' IN ('admin','manager','cashier','kitchen')
      AND CASE WHEN e.auth_user_id IS NOT NULL THEN
        e.is_active IS TRUE AND e.role = u.raw_app_meta_data->>'role'
      ELSE
        u.raw_app_meta_data->>'role' = 'admin'
        AND EXISTS (SELECT 1 FROM public.merchant_notification_owners o WHERE o.user_id = u.id)
      END
  )
$$;
REVOKE ALL ON FUNCTION public.merchant_notification_user_authorized(uuid) FROM PUBLIC, anon, authenticated;

-- Self-only wrapper for RLS; it cannot be used to enumerate other auth users.
CREATE FUNCTION public.merchant_notification_caller_authorized()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.merchant_notification_user_authorized(auth.uid())
$$;
REVOKE ALL ON FUNCTION public.merchant_notification_caller_authorized() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_notification_caller_authorized() TO authenticated;

-- Resolve historical duplicate registrations deterministically before adding global uniqueness.
DELETE FROM public.fcm_tokens a USING public.fcm_tokens b
WHERE a.device_id = b.device_id
  AND (a.updated_at, a.created_at, a.id) < (b.updated_at, b.created_at, b.id);
DELETE FROM public.fcm_tokens a USING public.fcm_tokens b
WHERE a.token = b.token
  AND (a.updated_at, a.created_at, a.id) < (b.updated_at, b.created_at, b.id);
CREATE UNIQUE INDEX merchant_fcm_device_unique ON public.fcm_tokens(device_id);
CREATE UNIQUE INDEX merchant_fcm_token_unique ON public.fcm_tokens(token);
ALTER TABLE public.fcm_tokens ADD COLUMN registration_version uuid NOT NULL DEFAULT gen_random_uuid();

DROP POLICY IF EXISTS admin_manage_own_fcm_tokens ON public.fcm_tokens;
DROP POLICY IF EXISTS service_role_read_fcm_tokens ON public.fcm_tokens;
CREATE POLICY merchant_fcm_select_own ON public.fcm_tokens FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.merchant_notification_caller_authorized()));
CREATE POLICY merchant_fcm_delete_own ON public.fcm_tokens FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.merchant_notification_caller_authorized()));
CREATE POLICY merchant_fcm_service ON public.fcm_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.fcm_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.fcm_tokens TO authenticated;
GRANT ALL ON public.fcm_tokens TO service_role;

CREATE FUNCTION public.register_merchant_fcm_token(p_device_id text, p_token text, p_platform text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR auth.role() IS DISTINCT FROM 'authenticated'
     OR NOT public.merchant_notification_user_authorized(v_user) THEN
    RAISE EXCEPTION 'Authorized merchant staff required' USING ERRCODE = '42501';
  END IF;
  -- Flutter's installation ID is a random 128-bit base64url capability, not a hardware identifier.
  IF p_device_id IS NULL OR length(p_device_id) NOT BETWEEN 22 AND 128
     OR p_device_id !~ '^[A-Za-z0-9_-]+$'
     OR p_token IS NULL OR length(p_token) NOT BETWEEN 10 AND 2048
     OR p_token !~ '^[A-Za-z0-9:_.-]+$'
     OR p_platform IS NULL OR p_platform NOT IN ('android','ios') THEN
    RAISE EXCEPTION 'Invalid device registration' USING ERRCODE = '22023';
  END IF;
  -- Registration is infrequent. One lock avoids crossing device/token takeover deadlocks.
  PERFORM pg_catalog.pg_advisory_xact_lock(731073019);
  -- Possession of the token also retires an old installation registration for that token.
  DELETE FROM public.fcm_tokens WHERE token = p_token AND device_id <> p_device_id;
  INSERT INTO public.fcm_tokens(user_id, device_id, token, platform)
  VALUES (v_user, p_device_id, p_token, p_platform)
  ON CONFLICT (device_id) DO UPDATE SET
    user_id = EXCLUDED.user_id, token = EXCLUDED.token, platform = EXCLUDED.platform,
    registration_version = gen_random_uuid(), updated_at = now();
  -- No rows, identifiers or tokens are returned, including on account switch.
END;
$$;
REVOKE ALL ON FUNCTION public.register_merchant_fcm_token(text,text,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.register_merchant_fcm_token(text,text,text) TO authenticated;

CREATE TABLE public.merchant_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'new_order' CHECK (event_type = 'new_order'),
  source_event_type text NOT NULL,
  source_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  fanout_started_at timestamptz,
  fanout_cursor uuid,
  expanded_at timestamptz,
  UNIQUE(order_id, event_type)
);
CREATE INDEX merchant_notification_unexpanded ON public.merchant_notification_outbox(created_at, id)
  WHERE expanded_at IS NULL;

CREATE TABLE public.merchant_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.merchant_notification_outbox(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.fcm_tokens(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','leased','sent','skipped','unregistered','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 8),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  lease_until timestamptz,
  claimed_version uuid,
  completed_at timestamptz,
  UNIQUE(outbox_id, token_id),
  CHECK ((status = 'leased') = (lease_id IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX merchant_notification_delivery_due ON public.merchant_notification_deliveries(available_at, id)
  WHERE status IN ('pending','leased');

ALTER TABLE public.merchant_notification_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_notification_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_notification_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_notification_owners, public.merchant_notification_config,
  public.merchant_notification_outbox, public.merchant_notification_deliveries FROM PUBLIC, anon, authenticated, service_role;
-- Only service-role monitoring may read queue state. All writes use the fenced RPCs/triggers.
GRANT SELECT ON public.merchant_notification_outbox, public.merchant_notification_deliveries TO service_role;
CREATE POLICY merchant_outbox_service_read ON public.merchant_notification_outbox
  FOR SELECT TO service_role USING (true);
CREATE POLICY merchant_delivery_service_read ON public.merchant_notification_deliveries
  FOR SELECT TO service_role USING (true);

CREATE FUNCTION public.enqueue_merchant_order_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_order public.orders%ROWTYPE; v_activated timestamptz;
BEGIN
  -- Existing staff_all_order_events permits client writes. Never turn those into push requests.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RETURN NEW; END IF;
  IF NEW.event_type NOT IN ('table_order_placed','bulk_submitted','grabfood_received','created') THEN RETURN NEW; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
  SELECT activated_at INTO v_activated FROM public.merchant_notification_config WHERE singleton;
  -- Fail closed if the protected configuration row is missing: without an
  -- activation time the historical-replay guard cannot be evaluated.
  IF v_activated IS NULL THEN RETURN NEW; END IF;
  IF v_order.created_at < v_activated OR NEW.created_at < v_activated
     OR v_order.status NOT IN ('pending','paid','accepted','preparing') THEN RETURN NEW; END IF;
  IF NOT (
    (NEW.event_type = 'table_order_placed' AND v_order.source = 'web' AND v_order.delivery_type = 'dine_in')
    OR (NEW.event_type = 'bulk_submitted' AND v_order.order_kind = 'bulk')
    OR (NEW.event_type = 'grabfood_received' AND v_order.source = 'grabfood')
    OR (NEW.event_type = 'created' AND v_order.source = 'counter')
  ) THEN RETURN NEW; END IF;
  INSERT INTO public.merchant_notification_outbox(order_id, source_event_type, source_event_id)
  VALUES (NEW.order_id, NEW.event_type, NEW.id)
  ON CONFLICT (order_id, event_type) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_merchant_order_event() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enqueue_merchant_order_event AFTER INSERT ON public.order_events
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_merchant_order_event();

CREATE FUNCTION public.enqueue_merchant_paid_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.status <> 'pending' OR NEW.status NOT IN ('paid','preparing')
     OR NEW.source NOT IN ('web','telegram','whatsapp') OR OLD.source IS DISTINCT FROM NEW.source
     OR NEW.order_kind <> 'standard' OR OLD.order_kind IS DISTINCT FROM NEW.order_kind
     OR NEW.delivery_type NOT IN ('delivery','self_pickup') OR OLD.delivery_type IS DISTINCT FROM NEW.delivery_type
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR NEW.created_at < COALESCE(
       (SELECT activated_at FROM public.merchant_notification_config WHERE singleton),
       'infinity'::timestamptz
     )
  THEN RETURN NEW; END IF;
  -- Gateway writes use service_role; the existing manual mark-paid route uses a staff JWT.
  IF (auth.role() = 'service_role' OR (
    auth.role() = 'authenticated' AND public.merchant_notification_user_authorized(auth.uid())
    AND EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid()
      AND raw_app_meta_data->>'role' IN ('admin','manager'))
  )) IS NOT TRUE THEN RETURN NEW; END IF;
  INSERT INTO public.merchant_notification_outbox(order_id, source_event_type)
  VALUES (NEW.id, 'payment_confirmed') ON CONFLICT (order_id, event_type) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_merchant_paid_order() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enqueue_merchant_paid_order AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_merchant_paid_order();

-- Fan out at most ten newly committed events, then lease ONE recipient just before sending.
-- Repeated invocations are bounded by the worker; concurrent callers skip locked rows.
CREATE FUNCTION public.claim_merchant_notification()
RETURNS TABLE(delivery_id uuid, lease_id uuid, event_id uuid, order_id uuid,
  user_id uuid, device_id text, token text, platform text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_event record; v_devices uuid[]; v_started timestamptz;
BEGIN
  FOR v_event IN SELECT o.id, o.fanout_cursor, o.fanout_started_at FROM public.merchant_notification_outbox o
    WHERE o.expanded_at IS NULL ORDER BY o.created_at, o.id LIMIT 10 FOR UPDATE SKIP LOCKED
  LOOP
    v_started := coalesce(v_event.fanout_started_at, now());
    -- Scan no more than 100 registrations per event per call. The cursor also advances
    -- past unauthorized registrations. Installations created after fan-out began are excluded.
    SELECT array_agg(t.id ORDER BY t.id) INTO v_devices FROM (
      SELECT f.id FROM public.fcm_tokens f
      WHERE (v_event.fanout_cursor IS NULL OR f.id > v_event.fanout_cursor)
        AND f.created_at <= v_started ORDER BY f.id LIMIT 100
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

  -- Bounded cleanup of signed-out/reassigned/deactivated recipients and exhausted crash leases.
  WITH stale AS (
    SELECT d.id FROM public.merchant_notification_deliveries d
    WHERE (d.status = 'pending' OR (d.status = 'leased' AND d.lease_until <= now()))
      AND (d.attempts >= 8 OR NOT EXISTS (SELECT 1 FROM public.fcm_tokens t
        WHERE t.id = d.token_id AND t.user_id = d.user_id
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
      AND d.attempts < 8 AND public.merchant_notification_user_authorized(t.user_id)
    ORDER BY d.available_at, d.id LIMIT 1 FOR UPDATE OF d SKIP LOCKED
  ), claimed AS (
    UPDATE public.merchant_notification_deliveries d SET status = 'leased',
      attempts = d.attempts + 1, lease_id = gen_random_uuid(), lease_until = now() + interval '2 minutes',
      claimed_version = c.registration_version
    FROM candidate c WHERE d.id = c.id RETURNING d.*
  ) SELECT c.id, c.lease_id, o.id, o.order_id, c.user_id, t.device_id, t.token, t.platform
    FROM claimed c JOIN public.merchant_notification_outbox o ON o.id = c.outbox_id
    JOIN public.fcm_tokens t ON t.id = c.token_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_merchant_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_merchant_notification() TO service_role;

CREATE FUNCTION public.complete_merchant_notification(p_delivery_id uuid, p_lease_id uuid, p_outcome text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_delivery public.merchant_notification_deliveries%ROWTYPE; v_outcome text := p_outcome;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent','retry','unregistered') THEN
    RAISE EXCEPTION 'Invalid delivery outcome' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_delivery FROM public.merchant_notification_deliveries
    WHERE id = p_delivery_id AND lease_id = p_lease_id AND status = 'leased' AND lease_until > now()
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
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_merchant_notification(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_merchant_notification(uuid,uuid,text) TO service_role;

COMMENT ON TABLE public.merchant_notification_outbox IS
  'Transactional new-order events; unique(order_id,event_type). expanded_at snapshots eligible registrations, including an empty recipient set.';
COMMENT ON TABLE public.merchant_notification_deliveries IS
  'Per-registration delivery state. Sent recipients never retry; expiring random leases fence stale acknowledgements. No token copies are stored.';
COMMIT;
