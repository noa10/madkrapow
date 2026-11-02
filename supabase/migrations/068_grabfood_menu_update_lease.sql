-- Serialize Grab menu updates per channel product across application instances.
-- A lease recovers from a crashed worker; it cannot fence a delayed Grab request.
ALTER TABLE public.channel_products
  ADD COLUMN IF NOT EXISTS grab_menu_lease_token uuid,
  ADD COLUMN IF NOT EXISTS grab_menu_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS grab_menu_restore_after timestamptz;

CREATE OR REPLACE FUNCTION public.claim_grab_menu_update(p_id uuid, p_token uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE channel_products
     SET grab_menu_lease_token = p_token,
         grab_menu_lease_until = now() + interval '5 minutes'
   WHERE id = p_id AND channel = 'grabfood'
     AND (grab_menu_lease_until IS NULL OR grab_menu_lease_until < now());
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_grab_menu_update(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_grab_menu_update(uuid, uuid) TO service_role;
