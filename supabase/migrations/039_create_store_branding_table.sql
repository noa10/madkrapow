-- Security fix: isolate branding data from operational store_settings.
-- store_settings contains sensitive HubboPOS config, circuit state, and health data.
-- Enabling realtime on the entire table broadcasts all columns to anonymous subscribers.
-- This migration creates a dedicated store_branding table and moves realtime there.

-- 1. Create store_branding table (single-row config, similar to store_settings)
CREATE TABLE IF NOT EXISTS public.store_branding (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    logo_url text,
    hero_image_url text,
    store_name text NOT NULL DEFAULT 'Mad Krapow',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Seed from existing store_settings branding data (single row)
INSERT INTO public.store_branding (logo_url, hero_image_url, store_name)
SELECT logo_url, hero_image_url, store_name
FROM public.store_settings
LIMIT 1
ON CONFLICT DO NOTHING;

-- 3. Enable RLS
ALTER TABLE public.store_branding ENABLE ROW LEVEL SECURITY;

-- 4. Public read policy (branding is public)
DROP POLICY IF EXISTS "store_branding_public_select" ON public.store_branding;
CREATE POLICY "store_branding_public_select"
ON public.store_branding FOR SELECT
USING (true);

-- 5. Admin/manager write policy
DROP POLICY IF EXISTS "store_branding_staff_update" ON public.store_branding;
CREATE POLICY "store_branding_staff_update"
ON public.store_branding FOR UPDATE
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role' = ANY (ARRAY['admin', 'manager']))
  OR (auth.jwt() ->> 'role' = 'service_role')
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role' = ANY (ARRAY['admin', 'manager']))
  OR (auth.jwt() ->> 'role' = 'service_role')
);

-- 6. Admin/manager insert policy (for initial seed if table is empty)
DROP POLICY IF EXISTS "store_branding_staff_insert" ON public.store_branding;
CREATE POLICY "store_branding_staff_insert"
ON public.store_branding FOR INSERT
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role' = ANY (ARRAY['admin', 'manager']))
  OR (auth.jwt() ->> 'role' = 'service_role')
);

-- 7. Enable realtime on store_branding
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'store_branding'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.store_branding;
    END IF;
END $$;

-- 8. Remove store_settings from realtime to stop leaking operational data
-- (conditional: may already have been removed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'store_settings'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.store_settings';
  END IF;
END $$;
