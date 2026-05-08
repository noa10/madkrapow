-- Enable realtime on promo tables for cross-platform instant sync
-- Covers: admin portal, merchant app, and mobile client
ALTER PUBLICATION supabase_realtime ADD TABLE promo_codes;
ALTER PUBLICATION supabase_realtime ADD TABLE promo_items;
