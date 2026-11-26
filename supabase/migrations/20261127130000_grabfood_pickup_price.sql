-- GrabFood self pick-up pricing.
--
-- Grab's Service Based Menu lets a merchant charge a different price when the
-- diner collects the order. The override lives beside the existing delivery
-- override so the menu builder can emit Grab's `advancedPricing` object without
-- another mapping table. NULL means "use the normal GrabFood price".

ALTER TABLE public.channel_products
  ADD COLUMN pickup_price_cents integer;

ALTER TABLE public.channel_products
  ADD CONSTRAINT channel_products_pickup_price_cents_check
  CHECK (pickup_price_cents IS NULL OR (pickup_price_cents >= 0 AND pickup_price_cents <= 9999999));

ALTER TABLE public.channel_modifiers
  ADD COLUMN pickup_price_cents integer;

ALTER TABLE public.channel_modifiers
  ADD CONSTRAINT channel_modifiers_pickup_price_cents_check
  CHECK (pickup_price_cents IS NULL OR (pickup_price_cents >= 0 AND pickup_price_cents <= 9999999));

COMMENT ON COLUMN public.channel_products.pickup_price_cents IS
  'GrabFood self pick-up price in minor units; NULL falls back to price_cents.';
COMMENT ON COLUMN public.channel_modifiers.pickup_price_cents IS
  'GrabFood self pick-up add-on price in minor units; NULL falls back to price_cents.';
