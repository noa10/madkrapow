-- Reconcile the deployed apply_channel_order body with the reviewed migration.
DO $patch$
DECLARE
  body_hash text;
  definition text;
BEGIN
  SELECT md5(replace(prosrc, E'\r\n', E'\n')), pg_get_functiondef(oid)
    INTO body_hash, definition
  FROM pg_proc
  WHERE oid = 'public.apply_channel_order(jsonb)'::regprocedure;

  IF body_hash = '97ac1657edc9404a5ccd9a2e24843754' THEN
    RETURN;
  END IF;
  IF body_hash <> '6d4e6394bc08678ad2a4b863e3d2afa6' THEN
    RAISE EXCEPTION 'Unexpected apply_channel_order definition: %', body_hash;
  END IF;

  EXECUTE replace(
    definition,
    'delivery_fee_cents = (v_order ->> ''delivery_fee_cents'')::integer,',
    'delivery_fee_cents = COALESCE((v_order ->> ''delivery_fee_cents'')::integer, 0),'
  );

  SELECT md5(replace(prosrc, E'\r\n', E'\n')) INTO body_hash
  FROM pg_proc
  WHERE oid = 'public.apply_channel_order(jsonb)'::regprocedure;
  IF body_hash <> '97ac1657edc9404a5ccd9a2e24843754' THEN
    RAISE EXCEPTION 'Unexpected corrected apply_channel_order definition: %', body_hash;
  END IF;
END;
$patch$;
