-- Keep menu identities and channel mappings for historic and delayed orders.
ALTER TABLE public.categories ADD COLUMN archived_at timestamptz;
ALTER TABLE public.menu_items ADD COLUMN archived_at timestamptz;
ALTER TABLE public.modifier_groups ADD COLUMN archived_at timestamptz;
ALTER TABLE public.modifiers ADD COLUMN archived_at timestamptz;

-- Existing first-party order RPCs check availability; prevent a stale update
-- from making an archived identity orderable again.
ALTER TABLE public.categories ADD CONSTRAINT archived_categories_inactive CHECK (archived_at IS NULL OR NOT is_active);
ALTER TABLE public.menu_items ADD CONSTRAINT archived_items_unavailable CHECK (archived_at IS NULL OR NOT is_available);
ALTER TABLE public.modifiers ADD CONSTRAINT archived_modifiers_unavailable CHECK (archived_at IS NULL OR NOT is_available);

-- A group requiring more selections than it allows can never be satisfied.
-- NOT VALID leaves existing rows untouched while checking every new write.
ALTER TABLE public.modifier_groups ADD CONSTRAINT modifier_group_selection_range
  CHECK (min_selections <= max_selections) NOT VALID;

-- Parent and child writes take the same transaction-scoped advisory lock, so a
-- stale form cannot attach an active child to a parent archived concurrently.
CREATE FUNCTION public.menu_parent_key(p_table text, p_id uuid) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT p_table || ':' || p_id::text $$;
REVOKE ALL ON FUNCTION public.menu_parent_key(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.lock_menu_parent(p_table text, p_id uuid) RETURNS void
LANGUAGE sql SET search_path = ''
AS $$ SELECT pg_advisory_xact_lock(hashtext('menu-parent:' || public.menu_parent_key(p_table, p_id))) $$;
REVOKE ALL ON FUNCTION public.lock_menu_parent(text, uuid) FROM PUBLIC, anon, authenticated;

-- Moving a child touches two parents; lock both in a stable order so two
-- opposite moves cannot deadlock each other.
CREATE FUNCTION public.lock_menu_parent_pair(p_table text, p_a uuid, p_b uuid) RETURNS void
LANGUAGE sql SET search_path = ''
AS $$
  SELECT public.lock_menu_parent(p_table, k)
  FROM (SELECT k FROM unnest(ARRAY[p_a, p_b]) AS k WHERE k IS NOT NULL ORDER BY k::text) keys
$$;
REVOKE ALL ON FUNCTION public.lock_menu_parent_pair(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
-- The invoker-rights archive trigger calls these as the deleting role, so the
-- roles that may delete menu rows need EXECUTE on the lock helpers.
-- Accepted tradeoff: a signed-in user can call these helpers directly and take
-- a transaction-scoped advisory lock for a menu-parent key. The lock cannot
-- read or write rows and ends with the request; making the helpers SECURITY
-- DEFINER would not prevent arbitrary-key locking either.
GRANT EXECUTE ON FUNCTION public.menu_parent_key(text, uuid), public.lock_menu_parent(text, uuid),
  public.lock_menu_parent_pair(text, uuid, uuid)
  TO authenticated, service_role;

CREATE FUNCTION public.require_active_menu_parent() RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'menu_items' THEN
    v_id := NEW.category_id;
    IF TG_OP = 'UPDATE' AND OLD.category_id IS DISTINCT FROM NEW.category_id THEN
      PERFORM public.lock_menu_parent_pair('categories', OLD.category_id, NEW.category_id);
    ELSE
      PERFORM public.lock_menu_parent('categories', v_id);
    END IF;
    IF EXISTS (SELECT 1 FROM public.categories WHERE id = v_id AND archived_at IS NOT NULL) THEN
      RAISE EXCEPTION 'archived menu category cannot receive items' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF TG_TABLE_NAME = 'modifiers' THEN
    v_id := NEW.modifier_group_id;
    IF TG_OP = 'UPDATE' AND OLD.modifier_group_id IS DISTINCT FROM NEW.modifier_group_id THEN
      PERFORM public.lock_menu_parent_pair('modifier_groups', OLD.modifier_group_id, NEW.modifier_group_id);
    ELSE
      PERFORM public.lock_menu_parent('modifier_groups', v_id);
    END IF;
    IF EXISTS (SELECT 1 FROM public.modifier_groups WHERE id = v_id AND archived_at IS NOT NULL) THEN
      RAISE EXCEPTION 'archived modifier group cannot receive options' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.require_active_menu_parent() FROM PUBLIC, anon, authenticated;

-- A required assignment with no selectable option makes the item unorderable
-- on POS and checkout, so reject it at the database boundary.
CREATE FUNCTION public.require_available_modifier_for_required_group() RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  PERFORM public.lock_menu_parent('modifier_groups', NEW.modifier_group_id);
  IF EXISTS (
    SELECT 1 FROM public.modifier_groups
    WHERE id = NEW.modifier_group_id AND archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'archived modifier group cannot be assigned' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (
    NEW.is_required
    OR EXISTS (
      SELECT 1 FROM public.modifier_groups g
      WHERE g.id = NEW.modifier_group_id AND g.min_selections > 0
    )
  ) THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.modifiers m
    WHERE m.modifier_group_id = NEW.modifier_group_id
      AND m.is_available AND m.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'required modifier group has no available options' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.require_available_modifier_for_required_group() FROM PUBLIC, anon, authenticated;

-- Losing the last available option of a group must not strand required
-- assignments: relax them in the same statement that removes availability.
CREATE FUNCTION public.relax_required_group_assignments() RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  v_group uuid;
BEGIN
  -- A move removes the option from the old group too, so relax both parents.
  FOR v_group IN
    SELECT k
    FROM unnest(ARRAY[OLD.modifier_group_id, NEW.modifier_group_id]) AS k
    WHERE k IS NOT NULL
    ORDER BY k::text
  LOOP
    PERFORM public.lock_menu_parent('modifier_groups', v_group);
    IF NOT EXISTS (
      SELECT 1 FROM public.modifiers m
      WHERE m.modifier_group_id = v_group
        AND m.is_available AND m.archived_at IS NULL
    ) THEN
      -- Order creation also enforces the group's own min_selections, so a
      -- min > 0 group with no option left is just as unorderable.
      DELETE FROM public.menu_item_modifier_groups b
      WHERE b.modifier_group_id = v_group
        AND (b.is_required OR EXISTS (
          SELECT 1 FROM public.modifier_groups g
          WHERE g.id = v_group AND g.min_selections > 0
        ));
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.relax_required_group_assignments() FROM PUBLIC, anon, authenticated;

-- Invoker rights deliberately retain the caller's existing UPDATE and DELETE
-- permissions and RLS checks. A failure rolls back the entire DELETE statement.
CREATE FUNCTION public.archive_menu_entity() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Same gate as validate_admin_write(), repeated here so an unauthorized
  -- direct DELETE fails even if trigger firing order ever changes.
  IF ((auth.jwt()->'app_metadata'->>'role' IN ('admin', 'manager'))
      OR auth.jwt()->>'role' = 'service_role') IS NOT TRUE THEN
    RAISE EXCEPTION 'Admin or manager role required for write operations on %', TG_TABLE_NAME;
  END IF;
  IF TG_TABLE_NAME = 'categories' THEN
    PERFORM public.lock_menu_parent('categories', OLD.id);
    UPDATE public.categories SET archived_at = COALESCE(archived_at, now()), is_active = false WHERE id = OLD.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'category archive denied'; END IF;
    UPDATE public.menu_items SET archived_at = COALESCE(archived_at, now()), is_available = false WHERE category_id = OLD.id;
    IF EXISTS (SELECT 1 FROM public.categories WHERE id = OLD.id AND archived_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.menu_items WHERE category_id = OLD.id AND archived_at IS NULL) THEN
      RAISE EXCEPTION 'menu archive did not update every category item';
    END IF;
  ELSIF TG_TABLE_NAME = 'menu_items' THEN
    PERFORM public.lock_menu_parent('menu_items', OLD.id);
    UPDATE public.menu_items SET archived_at = COALESCE(archived_at, now()), is_available = false WHERE id = OLD.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'menu item archive denied'; END IF;
  ELSIF TG_TABLE_NAME = 'modifier_groups' THEN
    PERFORM public.lock_menu_parent('modifier_groups', OLD.id);
    UPDATE public.modifier_groups SET archived_at = COALESCE(archived_at, now()) WHERE id = OLD.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'modifier group archive denied'; END IF;
    UPDATE public.modifiers SET archived_at = COALESCE(archived_at, now()), is_available = false WHERE modifier_group_id = OLD.id;
    DELETE FROM public.menu_item_modifier_groups WHERE modifier_group_id = OLD.id;
    IF EXISTS (SELECT 1 FROM public.modifier_groups WHERE id = OLD.id AND archived_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.modifiers WHERE modifier_group_id = OLD.id AND archived_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.menu_item_modifier_groups WHERE modifier_group_id = OLD.id) THEN
      RAISE EXCEPTION 'menu archive did not update every group option or assignment';
    END IF;
  ELSIF TG_TABLE_NAME = 'modifiers' THEN
    PERFORM public.lock_menu_parent('modifier_groups', OLD.modifier_group_id);
    UPDATE public.modifiers SET archived_at = COALESCE(archived_at, now()), is_available = false WHERE id = OLD.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'modifier archive denied'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.modifiers m
      WHERE m.modifier_group_id = OLD.modifier_group_id
        AND m.is_available AND m.archived_at IS NULL
    ) THEN
      DELETE FROM public.menu_item_modifier_groups b
      WHERE b.modifier_group_id = OLD.modifier_group_id
        AND (b.is_required OR EXISTS (
          SELECT 1 FROM public.modifier_groups g
          WHERE g.id = OLD.modifier_group_id AND g.min_selections > 0
        ));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER archive_category BEFORE DELETE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.archive_menu_entity();
CREATE TRIGGER archive_menu_item BEFORE DELETE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.archive_menu_entity();
CREATE TRIGGER archive_modifier_group BEFORE DELETE ON public.modifier_groups FOR EACH ROW EXECUTE FUNCTION public.archive_menu_entity();
CREATE TRIGGER archive_modifier BEFORE DELETE ON public.modifiers FOR EACH ROW EXECUTE FUNCTION public.archive_menu_entity();

CREATE TRIGGER require_active_category BEFORE INSERT OR UPDATE OF category_id ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.require_active_menu_parent();
CREATE TRIGGER require_active_modifier_group BEFORE INSERT OR UPDATE OF modifier_group_id ON public.modifiers
  FOR EACH ROW EXECUTE FUNCTION public.require_active_menu_parent();
CREATE TRIGGER require_available_modifier BEFORE INSERT OR UPDATE OF is_required, modifier_group_id
  ON public.menu_item_modifier_groups
  FOR EACH ROW EXECUTE FUNCTION public.require_available_modifier_for_required_group();
CREATE TRIGGER relax_required_assignments AFTER UPDATE OF is_available, archived_at, modifier_group_id ON public.modifiers
  FOR EACH ROW EXECUTE FUNCTION public.relax_required_group_assignments();

-- Raising a group's minimum selections without an available option makes every
-- bound item unorderable. Reject the transition at the database boundary.
CREATE FUNCTION public.require_available_option_for_required_group() RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.min_selections > 0
     AND NEW.min_selections IS DISTINCT FROM OLD.min_selections
     AND NOT EXISTS (
       SELECT 1 FROM public.modifiers m
       WHERE m.modifier_group_id = NEW.id
         AND m.is_available AND m.archived_at IS NULL
     ) THEN
    RAISE EXCEPTION 'a required modifier group needs an available option' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.require_available_option_for_required_group() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER require_group_available_option BEFORE UPDATE OF min_selections ON public.modifier_groups
  FOR EACH ROW EXECUTE FUNCTION public.require_available_option_for_required_group();
