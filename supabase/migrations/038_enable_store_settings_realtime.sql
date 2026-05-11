-- Enable realtime on store_settings for instant branding sync across all apps
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'store_settings'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE store_settings;
    END IF;
END $$;
