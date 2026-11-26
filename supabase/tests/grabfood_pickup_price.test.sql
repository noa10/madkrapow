-- Run against a local migrated database. Nothing persists: the script rolls back.
BEGIN;
SELECT plan(3);

SELECT has_column('public', 'channel_products', 'pickup_price_cents', 'items can store a self pick-up price');
SELECT has_column('public', 'channel_modifiers', 'pickup_price_cents', 'modifiers can store a self pick-up price');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$
DECLARE
  c uuid := gen_random_uuid();
  i uuid := gen_random_uuid();
  g uuid := gen_random_uuid();
  m uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.categories (id, name) VALUES (c, 'pickup price test');
  INSERT INTO public.menu_items (id, category_id, name, price_cents) VALUES (i, c, 'pickup price test', 1000);
  INSERT INTO public.modifier_groups (id, name) VALUES (g, 'pickup price test');
  INSERT INTO public.modifiers (id, modifier_group_id, name) VALUES (m, g, 'pickup price test');

  BEGIN
    INSERT INTO public.channel_products (menu_item_id, channel, pickup_price_cents)
    VALUES (i, 'grabfood', -1);
    RAISE EXCEPTION 'negative item pick-up price was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.channel_modifiers (modifier_id, channel, pickup_price_cents)
    VALUES (m, 'grabfood', 10000000);
    RAISE EXCEPTION 'out-of-range modifier pick-up price was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.channel_products (menu_item_id, channel, price_cents, pickup_price_cents)
  VALUES (i, 'grabfood', 1200, 0);
  INSERT INTO public.channel_modifiers (modifier_id, channel, price_cents, pickup_price_cents)
  VALUES (m, 'grabfood', 200, 0);

  IF (SELECT pickup_price_cents FROM public.channel_products WHERE menu_item_id = i) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'zero item pick-up price did not survive';
  END IF;
  IF (SELECT pickup_price_cents FROM public.channel_modifiers WHERE modifier_id = m) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'zero modifier pick-up price did not survive';
  END IF;
END $$;

SELECT pass('pick-up price constraints and zero handling hold');
SELECT * FROM finish();
ROLLBACK;
