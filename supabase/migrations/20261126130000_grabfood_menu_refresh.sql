-- Append-only desired revisions for the restaurant's GrabFood menu.
-- A successful notification means only that Grab accepted the request to pull;
-- it does not prove that Grab applied the menu.
CREATE TABLE public.grabfood_menu_refresh (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  revision bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  notified_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);
ALTER TABLE public.grabfood_menu_refresh ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.grabfood_menu_refresh FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grabfood_menu_refresh TO service_role;
GRANT USAGE ON SEQUENCE public.grabfood_menu_refresh_id_seq TO service_role;

-- Comparing only fields used by Get Menu avoids loops and spurious refreshes
-- when the separate item-availability worker changes its lease/restore flags.
-- JSON access to archived_at works before and after the archival migration.
CREATE FUNCTION public.enqueue_grabfood_menu_refresh() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  old_row jsonb := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  new_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  field text;
  changed boolean := TG_OP <> 'UPDATE';
BEGIN
  IF TG_TABLE_NAME IN ('channel_products', 'channel_categories', 'channel_modifiers')
    AND old_row->>'channel' IS DISTINCT FROM 'grabfood'
    AND new_row->>'channel' IS DISTINCT FROM 'grabfood' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    FOREACH field IN ARRAY TG_ARGV LOOP
      IF old_row->field IS DISTINCT FROM new_row->field THEN
        changed := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;
  IF changed THEN
    -- Append only: concurrent catalogue writers never share a queue row.
    INSERT INTO public.grabfood_menu_refresh DEFAULT VALUES;
  END IF;
  -- A later notification, not the triggering edit, computes the restored state.
  -- Only a new or changed snooze schedules an expiry, and one pending event per
  -- instant is enough, so repeated edits of an already-snoozed row do not pile up.
  IF TG_TABLE_NAME IN ('menu_items', 'channel_products')
    AND new_row->>'snooze_till' IS NOT NULL
    AND (new_row->>'snooze_till')::timestamptz > now()
    AND (TG_OP = 'INSERT' OR old_row->>'snooze_till' IS DISTINCT FROM new_row->>'snooze_till')
    AND NOT EXISTS (
      SELECT 1 FROM public.grabfood_menu_refresh
      WHERE notified_at IS NULL AND available_at = (new_row->>'snooze_till')::timestamptz
    ) THEN
    INSERT INTO public.grabfood_menu_refresh (available_at)
    VALUES ((new_row->>'snooze_till')::timestamptz);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_grabfood_menu_refresh() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER grabfood_refresh_categories AFTER INSERT OR UPDATE OR DELETE ON public.categories FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_grabfood_menu_refresh('id', 'name', 'sort_order', 'is_active', 'archived_at');
CREATE TRIGGER grabfood_refresh_menu_items AFTER INSERT OR UPDATE OR DELETE ON public.menu_items FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_grabfood_menu_refresh('id', 'category_id', 'name', 'description', 'price_cents', 'image_url', 'is_available', 'snooze_till', 'sort_order', 'archived_at');
CREATE TRIGGER grabfood_refresh_modifier_groups AFTER INSERT OR UPDATE OR DELETE ON public.modifier_groups FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_grabfood_menu_refresh('id', 'name', 'min_selections', 'max_selections', 'sort_order', 'archived_at');
CREATE TRIGGER grabfood_refresh_modifiers AFTER INSERT OR UPDATE OR DELETE ON public.modifiers FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_grabfood_menu_refresh('id', 'modifier_group_id', 'name', 'price_delta_cents', 'is_available', 'sort_order', 'archived_at');
CREATE TRIGGER grabfood_refresh_modifier_links AFTER INSERT OR UPDATE OR DELETE ON public.menu_item_modifier_groups FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_grabfood_menu_refresh('menu_item_id', 'modifier_group_id');
CREATE TRIGGER grabfood_refresh_channel_products AFTER INSERT OR UPDATE OR DELETE ON public.channel_products FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_grabfood_menu_refresh('menu_item_id', 'channel', 'external_item_id', 'external_name', 'price_cents', 'is_available', 'snooze_till');
CREATE TRIGGER grabfood_refresh_channel_categories AFTER INSERT OR UPDATE OR DELETE ON public.channel_categories FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_grabfood_menu_refresh('category_id', 'channel', 'external_category_id');
CREATE TRIGGER grabfood_refresh_channel_modifiers AFTER INSERT OR UPDATE OR DELETE ON public.channel_modifiers FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_grabfood_menu_refresh('modifier_id', 'channel', 'price_cents');

-- Notified events are only history; keep a week so the worker can be inspected.
CREATE FUNCTION public.cleanup_grabfood_menu_refresh()
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH deleted AS (
    DELETE FROM public.grabfood_menu_refresh
    WHERE notified_at < now() - interval '7 days'
    RETURNING 1
  )
  SELECT count(*) FROM deleted
$$;

CREATE FUNCTION public.claim_grabfood_menu_refresh(p_token uuid)
RETURNS TABLE(covered_revision bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  target bigint;
BEGIN
  PERFORM public.cleanup_grabfood_menu_refresh();

  -- One statement leases every due event and reports the highest revision it
  -- took. A single UPDATE scans and locks once, so two workers cannot interleave
  -- a "lock then re-lock" order and deadlock. One notification asks Grab to pull
  -- the whole menu, so it satisfies all of these edits; later edits stay pending.
  WITH claimed AS (
    UPDATE public.grabfood_menu_refresh
    SET lease_token = p_token, lease_until = now() + interval '5 minutes'
    WHERE notified_at IS NULL AND available_at <= now()
      AND (lease_until IS NULL OR lease_until <= now())
    RETURNING revision
  )
  SELECT max(revision) INTO target FROM claimed;
  IF target IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT target;
END;
$$;

CREATE FUNCTION public.finish_grabfood_menu_refresh(p_token uuid, p_revision bigint, p_error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.grabfood_menu_refresh AS q SET
    notified_at = CASE WHEN p_error IS NULL THEN now() ELSE q.notified_at END,
    attempts = CASE WHEN p_error IS NULL THEN 0 ELSE q.attempts + 1 END,
    last_error = CASE WHEN p_error IS NULL THEN NULL ELSE left(p_error, 500) END,
    available_at = CASE WHEN p_error IS NULL THEN q.available_at ELSE now() + make_interval(secs => least(900, 30 * power(2, least(q.attempts, 5))::integer)) END,
    lease_token = NULL, lease_until = NULL
  WHERE q.lease_token = p_token AND q.lease_until > now()
    AND (p_error IS NULL OR q.revision <= p_revision);
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_grabfood_menu_refresh() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_grabfood_menu_refresh(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_grabfood_menu_refresh(uuid, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_grabfood_menu_refresh() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_grabfood_menu_refresh(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_grabfood_menu_refresh(uuid, bigint, text) TO service_role;
