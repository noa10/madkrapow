-- Defensive trigger: validate app_metadata.role = 'admin' on writes to menu tables
-- This protects both write paths (browser client and API routes) from non-admin writes
-- Raises a descriptive error instead of silently failing
--
-- IMPORTANT: Uses SECURITY INVOKER (default) + auth.jwt() instead of SECURITY DEFINER + current_setting.
-- SECURITY DEFINER runs as the function owner (postgres superuser), whose JWT claims do not
-- contain the caller's app_metadata. auth.jwt() in SECURITY INVOKER context correctly returns
-- the calling user's JWT claims, matching the pattern used in all existing RLS policies.

CREATE OR REPLACE FUNCTION validate_admin_write()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.jwt()->'app_metadata'->>'role' != 'admin'
       AND auth.jwt()->>'role' != 'service_role' THEN
        RAISE EXCEPTION 'Admin role required for write operations on %', TG_TABLE_NAME;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to categories
CREATE TRIGGER check_admin_before_insert_categories
    BEFORE INSERT ON categories FOR EACH ROW EXECUTE FUNCTION validate_admin_write();
CREATE TRIGGER check_admin_before_update_categories
    BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION validate_admin_write();
CREATE TRIGGER check_admin_before_delete_categories
    BEFORE DELETE ON categories FOR EACH ROW EXECUTE FUNCTION validate_admin_write();

-- Apply to menu_items
CREATE TRIGGER check_admin_before_insert_menu_items
    BEFORE INSERT ON menu_items FOR EACH ROW EXECUTE FUNCTION validate_admin_write();
CREATE TRIGGER check_admin_before_update_menu_items
    BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION validate_admin_write();
CREATE TRIGGER check_admin_before_delete_menu_items
    BEFORE DELETE ON menu_items FOR EACH ROW EXECUTE FUNCTION validate_admin_write();

-- Apply to modifier_groups
CREATE TRIGGER check_admin_before_insert_modifier_groups
    BEFORE INSERT ON modifier_groups FOR EACH ROW EXECUTE FUNCTION validate_admin_write();
CREATE TRIGGER check_admin_before_update_modifier_groups
    BEFORE UPDATE ON modifier_groups FOR EACH ROW EXECUTE FUNCTION validate_admin_write();
CREATE TRIGGER check_admin_before_delete_modifier_groups
    BEFORE DELETE ON modifier_groups FOR EACH ROW EXECUTE FUNCTION validate_admin_write();

-- Apply to modifiers
CREATE TRIGGER check_admin_before_insert_modifiers
    BEFORE INSERT ON modifiers FOR EACH ROW EXECUTE FUNCTION validate_admin_write();
CREATE TRIGGER check_admin_before_update_modifiers
    BEFORE UPDATE ON modifiers FOR EACH ROW EXECUTE FUNCTION validate_admin_write();
CREATE TRIGGER check_admin_before_delete_modifiers
    BEFORE DELETE ON modifiers FOR EACH ROW EXECUTE FUNCTION validate_admin_write();

-- Apply to menu_item_modifier_groups
CREATE TRIGGER check_admin_before_insert_menu_item_modifier_groups
    BEFORE INSERT ON menu_item_modifier_groups FOR EACH ROW EXECUTE FUNCTION validate_admin_write();
CREATE TRIGGER check_admin_before_update_menu_item_modifier_groups
    BEFORE UPDATE ON menu_item_modifier_groups FOR EACH ROW EXECUTE FUNCTION validate_admin_write();
CREATE TRIGGER check_admin_before_delete_menu_item_modifier_groups
    BEFORE DELETE ON menu_item_modifier_groups FOR EACH ROW EXECUTE FUNCTION validate_admin_write();
