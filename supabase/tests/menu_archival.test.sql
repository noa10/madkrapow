-- Run against a local migrated database with psql -v ON_ERROR_STOP=1. Nothing persists.
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$
DECLARE
  c uuid := gen_random_uuid();
  i uuid := gen_random_uuid();
  g uuid := gen_random_uuid();
  m uuid := gen_random_uuid();
  o uuid := gen_random_uuid();
  oi uuid := gen_random_uuid();
  c2 uuid := gen_random_uuid();
  result jsonb;
BEGIN
  INSERT INTO public.categories (id, name) VALUES (c, 'archive test');
  INSERT INTO public.menu_items (id, category_id, name, price_cents) VALUES (i, c, 'archive test', 100);
  INSERT INTO public.modifier_groups (id, name) VALUES (g, 'archive test');
  INSERT INTO public.modifiers (id, modifier_group_id, name) VALUES (m, g, 'archive test');
  INSERT INTO public.menu_item_modifier_groups (menu_item_id, modifier_group_id) VALUES (i, g);
  INSERT INTO public.channel_categories (category_id, channel, external_category_id) VALUES (c, 'grabfood', c::text);
  INSERT INTO public.channel_products (menu_item_id, channel, external_item_id) VALUES (i, 'grabfood', i::text);
  INSERT INTO public.channel_modifiers (modifier_id, channel) VALUES (m, 'grabfood');
  INSERT INTO public.orders (id, order_number, display_code, subtotal_cents, total_cents) VALUES (o, o::text, 'ARCHIVE', 100, 100);
  INSERT INTO public.order_items (id, order_id, menu_item_id, menu_item_name, menu_item_price_cents, line_total_cents) VALUES (oi, o, i, 'archive test', 100, 100);
  INSERT INTO public.order_item_modifiers (order_item_id, modifier_id, modifier_name) VALUES (oi, m, 'archive test');

  DELETE FROM public.categories WHERE id = c;
  IF NOT EXISTS (
    SELECT 1 FROM pg_locks
    WHERE locktype = 'advisory' AND pid = pg_backend_pid()
      AND objid::bigint = (hashtext('menu-parent:categories:' || c::text)::bigint & 4294967295)
  ) THEN
    RAISE EXCEPTION 'archiving a category must hold its parent lock';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = c AND archived_at IS NOT NULL AND NOT is_active) OR
     NOT EXISTS (SELECT 1 FROM public.menu_items WHERE id = i AND category_id = c AND archived_at IS NOT NULL AND NOT is_available) THEN
    RAISE EXCEPTION 'category deletion must archive the category and its items';
  END IF;
  DELETE FROM public.modifier_groups WHERE id = g;
  IF NOT EXISTS (SELECT 1 FROM public.modifier_groups WHERE id = g AND archived_at IS NOT NULL) OR
     NOT EXISTS (SELECT 1 FROM public.modifiers WHERE id = m AND archived_at IS NOT NULL AND NOT is_available) THEN
    RAISE EXCEPTION 'group deletion must archive its modifiers';
  END IF;
  IF EXISTS (SELECT 1 FROM public.menu_item_modifier_groups WHERE menu_item_id = i AND modifier_group_id = g) THEN
    RAISE EXCEPTION 'archived groups must not remain assigned to active menus';
  END IF;
  BEGIN
    INSERT INTO public.menu_items (category_id, name, price_cents) VALUES (c, 'stale item', 100);
    RAISE EXCEPTION 'insert into archived category succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.modifiers (modifier_group_id, name) VALUES (g, 'stale modifier');
    RAISE EXCEPTION 'insert into archived group succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.menu_items SET is_available = true WHERE id = i;
    RAISE EXCEPTION 'archived item was made orderable';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.modifiers SET is_available = true WHERE id = m;
    RAISE EXCEPTION 'archived modifier was made orderable';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  result := public.apply_channel_order(jsonb_build_object(
    'order', jsonb_build_object('order_number', gen_random_uuid()::text, 'source', 'grabfood', 'subtotal_cents', 100, 'total_cents', 100),
    'items', jsonb_build_array(jsonb_build_object('menu_item_id', i, 'menu_item_name', 'archive test', 'menu_item_price_cents', 100, 'line_total_cents', 100, 'notes', (SELECT name FROM public.modifiers WHERE id = m))),
    'payment', jsonb_build_object('method', 'other', 'amount_cents', 100),
    'channelOrder', jsonb_build_object('channel', 'grabfood', 'external_order_id', gen_random_uuid()::text)
  ));
  IF result->>'status' <> 'created' OR NOT EXISTS (
    SELECT 1 FROM public.order_items WHERE order_id = (result->>'order_id')::uuid AND menu_item_id = i AND notes = 'archive test'
  ) THEN
    RAISE EXCEPTION 'delayed Grab order failed after archive: %', result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE id = oi AND menu_item_id = i) OR
     NOT EXISTS (SELECT 1 FROM public.order_item_modifiers WHERE order_item_id = oi AND modifier_id = m) OR
     NOT EXISTS (SELECT 1 FROM public.channel_products WHERE menu_item_id = i AND external_item_id = i::text) OR
     NOT EXISTS (SELECT 1 FROM public.channel_categories WHERE category_id = c) OR
     NOT EXISTS (SELECT 1 FROM public.channel_modifiers WHERE modifier_id = m) THEN
    RAISE EXCEPTION 'archive must preserve historic references and channel mappings';
  END IF;

  -- Child writes take the same parent lock, so they serialise with an archive.
  INSERT INTO public.categories (id, name) VALUES (c2, 'active test');
  INSERT INTO public.menu_items (category_id, name, price_cents) VALUES (c2, 'active item', 100);
  IF NOT EXISTS (
    SELECT 1 FROM pg_locks
    WHERE locktype = 'advisory' AND pid = pg_backend_pid()
      AND objid::bigint = (hashtext('menu-parent:categories:' || c2::text)::bigint & 4294967295)
  ) THEN
    RAISE EXCEPTION 'inserting an item must hold its category lock';
  END IF;
END $$;

-- Moving the only available option out of a required group must relax it.
DO $$
DECLARE
  c uuid := gen_random_uuid();
  i uuid := gen_random_uuid();
  src uuid := gen_random_uuid();
  dst uuid := gen_random_uuid();
  m uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.categories (id, name) VALUES (c, 'move test');
  INSERT INTO public.menu_items (id, category_id, name, price_cents) VALUES (i, c, 'move test', 100);
  INSERT INTO public.modifier_groups (id, name) VALUES (src, 'move source');
  INSERT INTO public.modifier_groups (id, name) VALUES (dst, 'move destination');
  INSERT INTO public.modifiers (id, modifier_group_id, name) VALUES (m, src, 'only option');
  INSERT INTO public.menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES (i, src, true);

  UPDATE public.modifiers SET modifier_group_id = dst WHERE id = m;
  IF EXISTS (SELECT 1 FROM public.menu_item_modifier_groups WHERE menu_item_id = i AND modifier_group_id = src) THEN
    RAISE EXCEPTION 'moving the last option must remove the old group binding';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.modifiers WHERE id = m AND modifier_group_id = dst) THEN
    RAISE EXCEPTION 'move test modifier did not move';
  END IF;
END $$;

-- min_selections > 0 makes a binding required even when is_required is false.
DO $$
DECLARE
  c uuid := gen_random_uuid();
  i uuid := gen_random_uuid();
  g uuid := gen_random_uuid();
  g2 uuid := gen_random_uuid();
  m uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.categories (id, name) VALUES (c, 'min test');
  INSERT INTO public.menu_items (id, category_id, name, price_cents) VALUES (i, c, 'min test', 100);
  INSERT INTO public.modifier_groups (id, name, min_selections) VALUES (g, 'min one', 1);
  INSERT INTO public.modifier_groups (id, name) VALUES (g2, 'min destination');
  INSERT INTO public.modifiers (id, modifier_group_id, name) VALUES (m, g, 'only option');
  INSERT INTO public.menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES (i, g, false);

  -- Moving the last option away relaxes a min > 0 binding too.
  UPDATE public.modifiers SET modifier_group_id = g2 WHERE id = m;
  IF EXISTS (SELECT 1 FROM public.menu_item_modifier_groups WHERE menu_item_id = i AND modifier_group_id = g) THEN
    RAISE EXCEPTION 'moving the last option must relax min_selections bindings';
  END IF;

  -- Deleting the last option relaxes it as well.
  UPDATE public.modifiers SET modifier_group_id = g WHERE id = m;
  INSERT INTO public.menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES (i, g, false);
  DELETE FROM public.modifiers WHERE id = m;
  IF EXISTS (SELECT 1 FROM public.menu_item_modifier_groups WHERE menu_item_id = i AND modifier_group_id = g) THEN
    RAISE EXCEPTION 'deleting the last option must relax min_selections bindings';
  END IF;

  -- A min > 0 group with no available option cannot be bound.
  BEGIN
    INSERT INTO public.menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES (i, g, false);
    RAISE EXCEPTION 'binding a min_selections group without options was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Archiving the group removes the binding as well.
  INSERT INTO public.modifiers (id, modifier_group_id, name) VALUES (gen_random_uuid(), g, 'replacement option');
  INSERT INTO public.menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES (i, g, false);
  DELETE FROM public.modifier_groups WHERE id = g;
  IF EXISTS (SELECT 1 FROM public.menu_item_modifier_groups WHERE menu_item_id = i AND modifier_group_id = g) THEN
    RAISE EXCEPTION 'group archive must remove min_selections bindings';
  END IF;
END $$;

-- A group cannot require more selections than it allows.
DO $$
DECLARE
  g uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.modifier_groups (id, name, min_selections, max_selections) VALUES (g, 'range test', 1, 2);
  UPDATE public.modifier_groups SET min_selections = 0, max_selections = 0 WHERE id = g;
  BEGIN
    INSERT INTO public.modifier_groups (name, min_selections, max_selections) VALUES ('range test', 2, 1);
    RAISE EXCEPTION 'group with min above max was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.modifier_groups SET min_selections = 3 WHERE id = g;
    RAISE EXCEPTION 'update to min above max was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- Raising a group to required without an available option is rejected.
DO $$
DECLARE
  g uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.modifier_groups (id, name, min_selections) VALUES (g, 'empty required', 0);
  BEGIN
    UPDATE public.modifier_groups SET min_selections = 1 WHERE id = g;
    RAISE EXCEPTION 'required group without options was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.modifiers (modifier_group_id, name, is_available) VALUES (g, 'available option', true);
  UPDATE public.modifier_groups SET min_selections = 1 WHERE id = g;
END $$;

-- Required assignments must never outlive the group's last available option.
DO $$
DECLARE
  c uuid := gen_random_uuid();
  i uuid := gen_random_uuid();
  g uuid := gen_random_uuid();
  g2 uuid := gen_random_uuid();
  m1 uuid := gen_random_uuid();
  m2 uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.categories (id, name) VALUES (c, 'required test');
  INSERT INTO public.modifier_groups (id, name) VALUES (g2, 'required test destination');
  INSERT INTO public.menu_items (id, category_id, name, price_cents) VALUES (i, c, 'required test', 100);
  INSERT INTO public.modifier_groups (id, name) VALUES (g, 'required test');
  INSERT INTO public.modifiers (id, modifier_group_id, name, is_available) VALUES (m1, g, 'option one', true);
  INSERT INTO public.modifiers (id, modifier_group_id, name, is_available) VALUES (m2, g, 'option two', false);
  INSERT INTO public.menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES (i, g, true);

  BEGIN
    UPDATE public.modifiers SET is_available = false WHERE id = m1;
    IF EXISTS (SELECT 1 FROM public.menu_item_modifier_groups WHERE menu_item_id = i AND modifier_group_id = g AND is_required) THEN
      RAISE EXCEPTION 'required binding survived losing its last available option';
    END IF;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'unavailability update must relax bindings, not fail';
  END;

  INSERT INTO public.menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES (i, g, false);
  BEGIN
    UPDATE public.menu_item_modifier_groups SET is_required = true WHERE menu_item_id = i AND modifier_group_id = g;
    RAISE EXCEPTION 'required binding accepted with no available options';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Deleting the last available option archives it and relaxes the binding too.
  UPDATE public.modifiers SET is_available = true WHERE id = m2;
  UPDATE public.menu_item_modifier_groups SET is_required = true WHERE menu_item_id = i AND modifier_group_id = g;
  DELETE FROM public.modifiers WHERE id = m2;
  IF NOT EXISTS (SELECT 1 FROM public.modifiers WHERE id = m2 AND archived_at IS NOT NULL) OR
     EXISTS (SELECT 1 FROM public.menu_item_modifier_groups WHERE menu_item_id = i AND modifier_group_id = g AND is_required) THEN
    RAISE EXCEPTION 'modifier deletion must archive and relax required bindings';
  END IF;

  -- Moving the last available option away must relax the old group's bindings.
  UPDATE public.modifiers SET modifier_group_id = g2 WHERE id = m1;
  IF EXISTS (SELECT 1 FROM public.menu_item_modifier_groups WHERE menu_item_id = i AND modifier_group_id = g AND is_required) THEN
    RAISE EXCEPTION 'moving the last option must relax the old group';
  END IF;

  -- A stale non-required binding must not reference an archived group.
  DELETE FROM public.modifier_groups WHERE id = g;
  BEGIN
    INSERT INTO public.menu_item_modifier_groups (menu_item_id, modifier_group_id) VALUES (i, g);
    RAISE EXCEPTION 'binding to archived group was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
INSERT INTO public.categories (id, name) VALUES ('ef9cdb4c-7c20-478d-b967-738a528d0001', 'archive role test');
INSERT INTO public.menu_items (id, category_id, name, price_cents)
VALUES ('ef9cdb4c-7c20-478d-b967-738a528d0002', 'ef9cdb4c-7c20-478d-b967-738a528d0001', 'archive role test', 100);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"manager"}}', true);
DELETE FROM public.categories WHERE id = 'ef9cdb4c-7c20-478d-b967-738a528d0001';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.menu_items WHERE id = 'ef9cdb4c-7c20-478d-b967-738a528d0002' AND archived_at IS NOT NULL AND NOT is_available) THEN
    RAISE EXCEPTION 'manager category deletion did not archive its item';
  END IF;
END $$;
RESET ROLE;
-- A direct DELETE without admin claims must fail even for the table owner.
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$
DECLARE
  blocked boolean := false;
BEGIN
  BEGIN
    DELETE FROM public.menu_items WHERE id = 'ef9cdb4c-7c20-478d-b967-738a528d0002';
  EXCEPTION WHEN raise_exception THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'unauthorized direct delete succeeded'; END IF;
END $$;
ROLLBACK;
