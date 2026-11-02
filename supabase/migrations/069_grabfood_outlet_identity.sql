-- Serialize discovery and prohibit replacing an established outlet mapping.
-- This integration currently supports one outlet per deployment.
CREATE OR REPLACE FUNCTION public.guard_grabfood_outlet_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE existing record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('grabfood-outlet-identity', 0));
  SELECT partner_merchant_id, grab_merchant_id INTO existing
    FROM public.grabfood_integrations
    WHERE id <> NEW.id LIMIT 1;
  IF FOUND AND existing.partner_merchant_id IS DISTINCT FROM NEW.partner_merchant_id THEN
    RAISE EXCEPTION 'Only one GrabFood outlet is supported per deployment';
  END IF;
  IF FOUND AND existing.grab_merchant_id IS NOT NULL AND NEW.grab_merchant_id IS NOT NULL
     AND existing.grab_merchant_id IS DISTINCT FROM NEW.grab_merchant_id THEN
    RAISE EXCEPTION 'Established GrabFood outlet mapping cannot be replaced';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.partner_merchant_id IS DISTINCT FROM OLD.partner_merchant_id OR
       (OLD.grab_merchant_id IS NOT NULL AND NEW.grab_merchant_id IS DISTINCT FROM OLD.grab_merchant_id) THEN
      RAISE EXCEPTION 'Established GrabFood outlet mapping cannot be replaced';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_grabfood_outlet_identity
BEFORE INSERT OR UPDATE ON public.grabfood_integrations
FOR EACH ROW EXECUTE FUNCTION public.guard_grabfood_outlet_identity();
