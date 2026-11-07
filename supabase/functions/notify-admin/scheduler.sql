-- OPTIONAL deployment setup, executed separately after migration 073 and secret provisioning.
-- This file is not a migration and has not been run against a remote database.
-- Requires pg_cron, pg_net and Supabase Vault already enabled by the operator.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION 'Enable pg_cron, pg_net and Vault before configuring the notification scheduler';
  END IF;
  -- Vault must never be readable by API roles.
  IF has_table_privilege('anon', 'vault.decrypted_secrets', 'SELECT')
     OR has_table_privilege('authenticated', 'vault.decrypted_secrets', 'SELECT') THEN
    RAISE EXCEPTION 'Restrict API-role access to Vault before configuring the notification scheduler';
  END IF;
  -- On hosted Supabase the net schema and its queue are owned by supabase_admin,
  -- which grants PUBLIC access; the project postgres role cannot revoke those
  -- platform grants. Supabase documents the grant as safe because net is not an
  -- exposed Data API schema and anon/authenticated are NOLOGIN. Fail closed if
  -- either platform guarantee has been broken.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon', 'authenticated') AND rolcanlogin) THEN
    RAISE EXCEPTION 'anon/authenticated can log in; restrict the pg_net request queue first';
  END IF;
  IF coalesce(current_setting('pgrst.db_schemas', true), '') <> ''
     AND 'net' = ANY (string_to_array(replace(current_setting('pgrst.db_schemas'), ' ', ''), ',')) THEN
    RAISE EXCEPTION 'The net schema is exposed through the Data API; restrict it first';
  END IF;
END;
$$;
CREATE SCHEMA IF NOT EXISTS merchant_notification_private;
REVOKE ALL ON SCHEMA merchant_notification_private FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION merchant_notification_private.wake_worker()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_url text; v_secret text;
BEGIN
  -- Empty queues cost only indexed existence checks. No customer/order data is sent.
  IF NOT EXISTS (SELECT 1 FROM public.merchant_notification_outbox WHERE expanded_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.merchant_notification_deliveries
       WHERE (status = 'pending' AND available_at <= now()) OR (status = 'leased' AND lease_until <= now()))
     AND NOT EXISTS (SELECT 1 FROM public.merchant_notification_repeats r
       WHERE r.next_at <= now() AND r.next_at < r.expires_at
         AND (r.lease_until IS NULL OR r.lease_until <= now())) THEN
    RETURN;
  END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'merchant_notification_worker_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'merchant_notification_worker_secret';
  IF v_url IS NULL OR v_url !~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/notify-admin$'
     OR v_secret IS NULL OR length(v_secret) < 32 THEN
    RAISE EXCEPTION 'Merchant notification scheduler is not configured';
  END IF;
  PERFORM net.http_post(url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-merchant-worker-secret',v_secret),
    body := '{}'::jsonb, timeout_milliseconds := 120000);
END;
$$;
REVOKE ALL ON FUNCTION merchant_notification_private.wake_worker() FROM PUBLIC, anon, authenticated, service_role;

-- pg_net does not start HTTP requests until the surrounding transaction commits.
-- Enqueue locally after the outbox insert, but never let optional wake-up faults roll back an order.
CREATE OR REPLACE FUNCTION merchant_notification_private.prompt_wake()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  BEGIN
    PERFORM merchant_notification_private.wake_worker();
  EXCEPTION WHEN OTHERS THEN
    -- No SQLERRM/DETAIL: extension or network queue errors can contain secret headers.
    RAISE WARNING 'Merchant notification wake unavailable; scheduled polling will retry';
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION merchant_notification_private.prompt_wake() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS merchant_notification_prompt_wake ON public.merchant_notification_outbox;
CREATE TRIGGER merchant_notification_prompt_wake AFTER INSERT ON public.merchant_notification_outbox
  FOR EACH ROW EXECUTE FUNCTION merchant_notification_private.prompt_wake();

-- Repeats are armed at 60-second intervals. Ten-second polling keeps that
-- cadence close; older pg_cron versions fall back to minute polling (roughly
-- 60-120 second repeat spacing).
DO $$
DECLARE
  v_schedule text := '* * * * *';
  v_major integer;
  v_minor integer;
BEGIN
  SELECT split_part(extversion, '.', 1)::integer,
         split_part(extversion, '.', 2)::integer
    INTO v_major, v_minor
    FROM pg_extension
   WHERE extname = 'pg_cron';
  IF coalesce(v_major, 0) > 1 OR (v_major = 1 AND coalesce(v_minor, 0) >= 5) THEN
    v_schedule := '10 seconds';
  END IF;
  PERFORM cron.schedule('merchant-order-notifications', v_schedule,
    'SELECT merchant_notification_private.wake_worker()');
END $$;
COMMIT;
