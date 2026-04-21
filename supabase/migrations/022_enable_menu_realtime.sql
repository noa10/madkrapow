-- Enable realtime on menu tables for customer app sync
-- Only 3 tables: menu_items, categories, modifiers
-- modifier_groups and menu_item_modifier_groups change rarely;
-- the customer app does a full refetch when any of the 3 subscribed tables fire,
-- capturing changes to all 5 tables indirectly.
ALTER PUBLICATION supabase_realtime ADD TABLE menu_items;
ALTER PUBLICATION supabase_realtime ADD TABLE categories;
ALTER PUBLICATION supabase_realtime ADD TABLE modifiers;
