-- Grab starts its 120-second cooldown when the pull *completes*, not when the
-- notification is accepted. A pull can finish several seconds after the
-- request, so retrying at exactly 120 seconds can still land inside the
-- cooldown. Leave a small margin before the first retry; later attempts keep
-- the exponential backoff.
CREATE OR REPLACE FUNCTION public.finish_grabfood_menu_refresh(p_token uuid, p_revision bigint, p_error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.grabfood_menu_refresh AS q SET
    notified_at = CASE WHEN p_error IS NULL THEN now() ELSE q.notified_at END,
    attempts = CASE WHEN p_error IS NULL THEN 0 ELSE q.attempts + 1 END,
    last_error = CASE WHEN p_error IS NULL THEN NULL ELSE left(p_error, 500) END,
    available_at = CASE
      WHEN p_error IS NULL THEN q.available_at
      ELSE now() + make_interval(secs => least(900, 150 * power(2, least(q.attempts, 5))::integer))
    END,
    lease_token = NULL, lease_until = NULL
  WHERE q.lease_token = p_token AND q.lease_until > now()
    AND (p_error IS NULL OR q.revision <= p_revision);
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_grabfood_menu_refresh(uuid, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_grabfood_menu_refresh(uuid, bigint, text) TO service_role;
