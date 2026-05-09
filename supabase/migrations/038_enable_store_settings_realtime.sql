-- Enable realtime on store_settings for instant branding sync across all apps
ALTER PUBLICATION supabase_realtime ADD TABLE store_settings;
