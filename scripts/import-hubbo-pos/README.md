# HubboPOS historical import

Loads the `Order with Items` export from the HubboPOS admin portal into the
canonical order model (orders, order_items, payments, channel_orders, refunds).

## Getting the export

1. Sign in at `https://admin.hubbopos.com/admin/login` (chain admin account).
2. **Report → Detail**. The page is a Metabase embed, so it needs two things
   before it renders rows: the merchant (`Select merchant` → *Mad Krapow -
   Subang Permai*) and a date range (the `Start Date` / `End Date` widgets).
3. The embed exposes three cards. **Order with Items** is the one this importer
   reads — it carries the line detail and the `order_group` that links ITEM rows
   to their ORDER row. Set the date range to cover the window you need
   (HubboPOS only retains two years) and copy the CSV endpoint URL out of the
   network panel, or use the card's download control.
4. Save the CSV locally. Rows look like:

   ```
   row_num,order_group,Date,Time,...,Invoice No,System ID,...,Record Type,Items,...
   1521.0,100067500,2025-04-03,14:18,...,#0-00004018,aup2-2514-qmux-3173,...,ORDER,,...
   9578.0,100067500,,,,,,,,,ITEM,"1x Chicken Krapow Set | 17 | Extra Spicy 🌶️🌶️, Food Container (Photodegradable)",...
   ```

   `System ID` is empty on ITEM rows — join on `order_group`, never on System ID.

## Running

```bash
# dry run: parse + validate + reconcile, writes nothing
node scripts/import-hubbo-pos/index.mjs --file ~/export.csv

# write (needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,
# from .env.local or the process environment)
node scripts/import-hubbo-pos/index.mjs --file ~/export.csv --apply --concurrency 6

# a slice, for a smoke test
node scripts/import-hubbo-pos/index.mjs --file ~/export.csv --apply --limit 5 --concurrency 1
```

The dry run must report `errors: 0` before applying — an unmapped item name or
an item-sum/gross mismatch means the catalog or the export changed.

## Behaviour

- One RPC call per order (`import_legacy_order`): order + items + payment +
  channel identity + refunds + audit rows are written atomically.
- Idempotent on `channel_orders(channel, external_order_id)` — re-running the
  same file imports only what is missing and reports the rest as skipped.
- Refunds are the negative `Table=REFUND` rows; each is attached to the order it
  reverses (invoice match, then amount+recency) instead of becoming a negative
  order.
- `order_number` is `HUB-<invoice>`; a repeated invoice (the POS reuses a number
  for two concurrent platform orders) gets a `-2` suffix because the column is
  UNIQUE.
- Channel comes from the `Table` column. ShopeeFood has no `orders.source`
  value in the CHECK constraint yet, so it is stored as `counter` with
  `channel_orders.channel = legacy_pos`, the SF number, and a note on the order.

## Known limitations

- 45 orders from the first four days of the export window (2024-11-01…04) have
  no ITEM rows — the POS wasn't capturing item detail yet. They are imported
  header-only.
- Widening `orders_source_check` / `channel_orders_channel_check` /
  `payments_method_check` with `shopeefood` needs SQL access (psql or the
  dashboard), not the REST service key.
