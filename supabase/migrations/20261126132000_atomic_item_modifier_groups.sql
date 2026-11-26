-- Replace every modifier-group binding for one menu item in a single statement.
-- SECURITY INVOKER keeps the caller's RLS policies, column privileges and the
-- admin-write, archive and GrabFood refresh triggers in force. Any error rolls
-- the whole replacement back, leaving the previous bindings untouched.
CREATE FUNCTION public.replace_item_modifier_groups(
  p_menu_item_id uuid,
  p_bindings jsonb
) RETURNS TABLE (id uuid, menu_item_id uuid, modifier_group_id uuid, is_required boolean, created_at timestamptz)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_groups uuid[];
  v_item_exists boolean;
BEGIN
  -- IS NOT TRUE also rejects absent or NULL claims, which would otherwise skip
  -- the whole branch and fail open.
  IF (
    (auth.jwt()->'app_metadata'->>'role' IN ('admin', 'manager'))
    OR auth.jwt()->>'role' = 'service_role'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'Admin or manager role required to replace modifier bindings'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_bindings IS NULL OR jsonb_typeof(p_bindings) <> 'array' THEN
    RAISE EXCEPTION 'Bindings must be a JSON array' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT (binding->>'modifier_group_id')::uuid), '{}')
  INTO v_groups
  FROM jsonb_array_elements(p_bindings) AS binding
  WHERE jsonb_typeof(binding) = 'object' AND binding->>'modifier_group_id' IS NOT NULL;

  IF v_groups IS NULL OR array_position(v_groups, NULL) IS NOT NULL
    OR cardinality(v_groups) <> jsonb_array_length(p_bindings) THEN
    RAISE EXCEPTION 'Each binding must name one distinct modifier group'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Serialize concurrent replacements for the same item on the same key the
  -- item archive uses, so an archive and a replacement cannot interleave.
  PERFORM public.lock_menu_parent('menu_items', p_menu_item_id);

  SELECT EXISTS (SELECT 1 FROM public.menu_items AS i WHERE i.id = p_menu_item_id)
  INTO v_item_exists;
  IF NOT v_item_exists THEN
    RAISE EXCEPTION 'Menu item not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.menu_items AS i
    WHERE i.id = p_menu_item_id AND i.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot bind options to an archived menu item'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.modifier_groups AS g
    WHERE g.id = ANY(v_groups) AND g.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot bind an archived modifier group' USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Order creation treats min_selections > 0 as a required choice even when the
  -- binding says optional, so both shapes need a selectable option. The archive
  -- trigger enforces the same rule at insert time; this check keeps the RPC's
  -- contract independent of it.
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_bindings)
      AS b(modifier_group_id uuid, is_required boolean)
    JOIN public.modifier_groups AS g ON g.id = b.modifier_group_id
    WHERE (COALESCE(b.is_required, false) OR g.min_selections > 0)
      AND NOT EXISTS (
        SELECT 1 FROM public.modifiers AS m
        WHERE m.modifier_group_id = g.id AND m.is_available AND m.archived_at IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'A required modifier group needs an available option'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.menu_item_modifier_groups AS b WHERE b.menu_item_id = p_menu_item_id;

  RETURN QUERY
  INSERT INTO public.menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required)
  SELECT p_menu_item_id, b.modifier_group_id, COALESCE(b.is_required, false)
  FROM jsonb_to_recordset(p_bindings)
    AS b(modifier_group_id uuid, is_required boolean)
  ORDER BY b.modifier_group_id
  RETURNING menu_item_modifier_groups.id, menu_item_modifier_groups.menu_item_id,
    menu_item_modifier_groups.modifier_group_id, menu_item_modifier_groups.is_required,
    menu_item_modifier_groups.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_item_modifier_groups(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_item_modifier_groups(uuid, jsonb) TO authenticated, service_role;
