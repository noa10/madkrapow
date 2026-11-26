-- Receipt printing settings.
--
-- The receipt header used to be hardcoded in the print job builder
-- ('Mad Krapow' + STORE_ADDRESS/STORE_PHONE env). Staff need to edit the
-- identity printed on the paper — company name and registration number, the
-- branch name, the footer line — without a deploy, and the paper width decides
-- how many characters the ESC/POS builder can fit per line.
--
-- store_settings is a single row (the store profile), publicly readable via
-- RLS, writable by admins only — the same place store_name/address/phone
-- already live.

ALTER TABLE store_settings
  -- Name printed on the receipt header. Separate from store_name so changing
  -- the branch label on paper cannot alter the public site's branding.
  ADD COLUMN IF NOT EXISTS receipt_store_name TEXT DEFAULT 'Mad Krapow Subang Permai',
  -- Company that operates the store, printed as "Bakaris Enterprise (201903057932)".
  ADD COLUMN IF NOT EXISTS company_name TEXT DEFAULT 'Bakaris Enterprise',
  ADD COLUMN IF NOT EXISTS company_registration TEXT DEFAULT '201903057932',
  -- Free-text line at the foot of the receipt (thank-you note, socials, WiFi…).
  ADD COLUMN IF NOT EXISTS receipt_footer TEXT DEFAULT 'Powered by Mad Krapow',
  -- SST percentage already included in menu prices. 0 hides the tax row.
  ADD COLUMN IF NOT EXISTS tax_rate_percent NUMERIC(5, 2) DEFAULT 6,
  -- Thermal paper width; 58mm fits 32 characters per line, 80mm fits 48.
  ADD COLUMN IF NOT EXISTS receipt_paper_width TEXT DEFAULT '80',
  -- Print kitchen docket + receipt automatically when an order comes in.
  ADD COLUMN IF NOT EXISTS auto_print_enabled BOOLEAN DEFAULT TRUE;

-- Guard the enumerated paper width without blocking future values outright.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'store_settings_receipt_paper_width_check'
  ) THEN
    ALTER TABLE store_settings
      ADD CONSTRAINT store_settings_receipt_paper_width_check
      CHECK (receipt_paper_width IN ('58', '80'));
  END IF;
END $$;

-- Backfill the store profile the receipts were already printing from env, so
-- the first print after deploy is byte-identical to the last one before it.
UPDATE store_settings
SET address = COALESCE(NULLIF(address, ''), '52, Jalan Subang Permai U6/6, Desa Subang Permai, 40150 Shah Alam, Selangor'),
    phone = COALESCE(NULLIF(phone, ''), '+6019-345-6476')
WHERE address IS NULL OR address = '' OR phone IS NULL OR phone = '';
