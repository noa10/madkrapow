-- Billplz payment gateway (sandbox-first, alongside Stripe).
--
-- `orders.billplz_bill_id` mirrors the existing `stripe_session_id` /
-- `stripe_payment_intent_id` columns: it lets the webhook and the success page
-- find the order from a Billplz bill, and lets the admin UI derive the payment
-- provider from the order row itself.
--
-- `payments.method` is widened so a completed Billplz payment can be recorded
-- in the canonical payments ledger (POS cash/QR rows already live there).

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS billplz_bill_id TEXT;

COMMENT ON COLUMN orders.billplz_bill_id IS
  'Billplz bill id (e.g. 8X0K1ZQ2). Set when the customer chooses Billplz at checkout.';

-- A bill belongs to exactly one order. The partial index still allows legacy
-- rows (and Stripe orders) to have NULL here.
CREATE UNIQUE INDEX IF NOT EXISTS orders_billplz_bill_id_unique
  ON orders (billplz_bill_id)
  WHERE billplz_bill_id IS NOT NULL;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check
  CHECK (method IN ('stripe', 'billplz', 'cash', 'qr_pay', 'grabfood', 'foodpanda', 'other'));

COMMIT;
