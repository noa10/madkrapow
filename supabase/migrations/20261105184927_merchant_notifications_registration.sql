BEGIN;

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

CREATE FUNCTION public.merchant_notification_caller_authorized()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.merchant_notification_user_authorized(auth.uid())
$$;
REVOKE ALL ON FUNCTION public.merchant_notification_caller_authorized() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merchant_notification_caller_authorized() TO authenticated;

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
  IF p_device_id IS NULL OR length(p_device_id) NOT BETWEEN 22 AND 128
     OR p_device_id !~ '^[A-Za-z0-9_-]+$'
     OR p_token IS NULL OR length(p_token) NOT BETWEEN 10 AND 2048
     OR p_token !~ '^[A-Za-z0-9:_.-]+$'
     OR p_platform IS NULL OR p_platform NOT IN ('android','ios') THEN
    RAISE EXCEPTION 'Invalid device registration' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(731073019);
  DELETE FROM public.fcm_tokens WHERE token = p_token AND device_id <> p_device_id;
  INSERT INTO public.fcm_tokens(user_id, device_id, token, platform)
  VALUES (v_user, p_device_id, p_token, p_platform)
  ON CONFLICT (device_id) DO UPDATE SET
    user_id = EXCLUDED.user_id, token = EXCLUDED.token, platform = EXCLUDED.platform,
    registration_version = gen_random_uuid(), updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.register_merchant_fcm_token(text,text,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.register_merchant_fcm_token(text,text,text) TO authenticated;

COMMIT;
