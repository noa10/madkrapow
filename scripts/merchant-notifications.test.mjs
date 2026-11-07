import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

// Exercise the actual migration with real PostgreSQL triggers, grants and RLS.
let db
const owner = '11111111-1111-4111-8111-111111111111'
const staff = '22222222-2222-4222-8222-222222222222'
const other = '33333333-3333-4333-8333-333333333333'
const device = 'Abcdefghijklmnopqrstuv'
const jwt = (id, role = 'authenticated') => JSON.stringify({ sub: id, role })
const claims = async (id, role = 'authenticated') => {
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [jwt(id, role)])
}
const register = (id, token = 'a-valid-fcm-token') =>
  db.query('SELECT public.register_merchant_fcm_token($1,$2,$3)', [id, token, 'android'])
const makeOrder = async (source = 'web', delivery = 'delivery', kind = 'standard', created = 'now()') => {
  const { rows } = await db.query(`INSERT INTO orders(source,delivery_type,order_kind,status,created_at)
    VALUES ($1,$2,$3,'pending',${created}) RETURNING id`, [source, delivery, kind])
  return rows[0].id
}
const event = (order, type) => db.query('INSERT INTO order_events(order_id,event_type) VALUES ($1,$2)', [order, type])
const outbox = async () => (await db.query('SELECT * FROM merchant_notification_outbox ORDER BY created_at')).rows

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    -- Hosted Supabase grants API roles default privileges; the migration must revoke them explicitly.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_app_meta_data jsonb, banned_until timestamptz, deleted_at timestamptz);
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
    $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE TABLE employees(auth_user_id uuid UNIQUE, role text, is_active boolean);
    CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text NOT NULL,
      delivery_type text NOT NULL, order_kind text NOT NULL, status text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE order_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      event_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    GRANT SELECT, INSERT, UPDATE, DELETE ON orders, order_events TO authenticated, service_role;
    INSERT INTO auth.users(id,raw_app_meta_data) VALUES
      ('${owner}', '{"role":"admin"}'), ('${staff}', '{"role":"kitchen"}'), ('${other}', '{"role":"cashier"}');
    INSERT INTO employees VALUES ('${staff}', 'kitchen', true), ('${other}', 'cashier', true);
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/019_fcm_tokens.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../supabase/migrations/073_merchant_notifications.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../supabase/migrations/20261106120000_merchant_notification_preferences.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../supabase/migrations/20261107120000_merchant_notification_repeat.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../supabase/migrations/20261107130000_repeat_interval_10s.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../supabase/migrations/20261107140000_alert_sound.sql', import.meta.url), 'utf8'))
  await db.query('INSERT INTO merchant_notification_owners(user_id) VALUES ($1)', [owner])
})

beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE merchant_notification_views, merchant_notification_repeats,
    merchant_notification_deliveries, merchant_notification_outbox, order_events, orders, fcm_tokens;
    UPDATE employees SET is_active = true;
    UPDATE auth.users SET banned_until = NULL, deleted_at = NULL;`)
  await claims(owner, 'service_role')
})
afterAll(async () => { await db?.close() })

describe('transactional order notification outbox', () => {
  it('fails closed when scheduler extensions are absent, without installing anything', async () => {
    const scheduler = await readFile(new URL('../supabase/functions/notify-admin/scheduler.sql', import.meta.url), 'utf8')
    await expect(db.exec(scheduler)).rejects.toThrow('Enable pg_cron, pg_net and Vault')
    await db.exec('ROLLBACK')
    expect((await db.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name='merchant_notification_private'")).rows).toHaveLength(0)
  })

  it('keeps optional prompt wakes transactional, private and best-effort with local pg_net/Vault stubs', async () => {
    await db.exec(`
      CREATE SCHEMA vault; CREATE SCHEMA net; CREATE SCHEMA cron;
      CREATE TABLE vault.decrypted_secrets(name text, decrypted_secret text);
      CREATE TABLE net.http_request_queue(id bigint GENERATED ALWAYS AS IDENTITY, url text, headers jsonb, body jsonb);
      CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
        RETURNS bigint LANGUAGE sql AS $$
          INSERT INTO net.http_request_queue(url,headers,body) VALUES (url,headers,body) RETURNING id
        $$;
      CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
      INSERT INTO vault.decrypted_secrets VALUES
        ('merchant_notification_worker_url','https://testproject.supabase.co/functions/v1/notify-admin'),
        ('merchant_notification_worker_secret','a-32-byte-or-longer-random-secret-placeholder');
    `)
    try {
      const setup = await readFile(new URL('../supabase/functions/notify-admin/scheduler.sql', import.meta.url), 'utf8')
      // Real function/trigger SQL, following the extension preflight tested separately above.
      await db.exec('BEGIN;\n' + setup.slice(setup.indexOf('CREATE SCHEMA IF NOT EXISTS merchant_notification_private;')))
      await event(await makeOrder('counter'), 'created')
      expect((await db.query('SELECT count(*)::int n FROM net.http_request_queue')).rows[0].n).toBe(1)
      await db.exec('BEGIN')
      await event(await makeOrder('counter'), 'created')
      expect((await db.query('SELECT count(*)::int n FROM net.http_request_queue')).rows[0].n).toBe(2)
      await db.exec('ROLLBACK')
      expect((await db.query('SELECT count(*)::int n FROM net.http_request_queue')).rows[0].n).toBe(1)
      expect(await outbox()).toHaveLength(1)
      // An unavailable optional secret cannot roll back an otherwise valid source event.
      await db.exec("DELETE FROM vault.decrypted_secrets WHERE name='merchant_notification_worker_secret'")
      await event(await makeOrder('counter'), 'created')
      expect(await outbox()).toHaveLength(2)
      expect((await db.query('SELECT count(*)::int n FROM net.http_request_queue')).rows[0].n).toBe(1)
      await db.exec('SET ROLE authenticated')
      await expect(db.query('SELECT merchant_notification_private.wake_worker()')).rejects.toThrow()
    } finally {
      await db.exec(`RESET ROLE;
        DROP TRIGGER IF EXISTS merchant_notification_prompt_wake ON merchant_notification_outbox;
        DROP SCHEMA merchant_notification_private CASCADE;
        DROP SCHEMA net CASCADE; DROP SCHEMA vault CASCADE; DROP SCHEMA cron CASCADE;`)
    }
  })

  it('accepts a current managerial JWT for manual payment but fails closed for missing roles', async () => {
    const manual = await makeOrder()
    await claims(owner)
    await db.query("UPDATE orders SET status='paid' WHERE id=$1", [manual])
    expect((await outbox()).map((r) => r.order_id)).toEqual([manual])
    const invalid = await makeOrder()
    await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: owner })])
    await db.query("UPDATE orders SET status='paid' WHERE id=$1", [invalid])
    expect(await outbox()).toHaveLength(1)
  })

  it('does not enqueue abandoned checkouts, imported/history markers or later kitchen edits', async () => {
    const abandoned = await makeOrder()
    await db.query("UPDATE orders SET status='pending' WHERE id=$1", [abandoned])
    const historical = await makeOrder('counter', 'self_pickup', 'standard', "now() - interval '1 day'")
    await event(historical, 'created')
    const imported = await makeOrder('counter')
    await event(imported, 'legacy_imported')
    const paid = await makeOrder()
    await db.query("UPDATE orders SET status='paid' WHERE id=$1", [paid])
    await db.exec('TRUNCATE merchant_notification_outbox CASCADE')
    await db.query("UPDATE orders SET status='preparing' WHERE id=$1", [paid])
    await event(paid, 'status_changed')
    expect(await outbox()).toHaveLength(0)
  })

  it('enqueues only the intended event sources and deduplicates one order', async () => {
    const qr = await makeOrder('web', 'dine_in')
    const bulk = await makeOrder('web', 'delivery', 'bulk')
    const grab = await makeOrder('grabfood')
    const counter = await makeOrder('counter')
    const web = await makeOrder()
    for (const [id, type] of [[qr,'table_order_placed'],[bulk,'bulk_submitted'],[grab,'grabfood_received'],[counter,'created'],[web,'created'],[grab,'grabfood_order_updated']]) await event(id, type)
    await event(qr, 'table_order_placed')
    expect((await outbox()).map((r) => r.order_id).sort()).toEqual([qr, bulk, grab, counter].sort())
  })

  it('queues web and bot payment transitions once, excludes old, bulk, QR and other channels', async () => {
    const web = await makeOrder()
    const bot = await makeOrder('telegram')
    const qr = await makeOrder('web', 'dine_in')
    const bulk = await makeOrder('web', 'delivery', 'bulk')
    const historical = await makeOrder('web', 'delivery', 'standard', "now() - interval '1 day'")
    const counter = await makeOrder('counter')
    await db.query("UPDATE orders SET status='preparing' WHERE id = ANY($1::uuid[])", [[web, bot, qr, bulk, historical, counter]])
    await db.query("UPDATE orders SET status='ready' WHERE id=$1", [web])
    expect((await outbox()).map((r) => r.order_id).sort()).toEqual([web, bot].sort())
    const manual = await makeOrder()
    await db.query("UPDATE orders SET status='paid' WHERE id=$1", [manual])
    expect((await outbox()).map((r) => r.order_id)).toContain(manual)
  })

  it('rolls back the source write and outbox together', async () => {
    const id = await makeOrder('counter')
    await db.exec('BEGIN')
    await event(id, 'created')
    expect(await outbox()).toHaveLength(1)
    await db.exec('ROLLBACK')
    expect(await outbox()).toHaveLength(0)
    expect((await db.query('SELECT * FROM order_events')).rows).toHaveLength(0)
  })

  it('does not trust forged events from authenticated users', async () => {
    const id = await makeOrder('counter')
    await claims(staff)
    await event(id, 'created')
    expect(await outbox()).toHaveLength(0)
  })
})

describe('token registration and leased delivery', () => {
  it('uses live auth metadata, rejects banned/deleted users and preserves own deletion', async () => {
    await claims(staff)
    await register(device)
    await db.query("UPDATE auth.users SET raw_app_meta_data='{}' WHERE id=$1", [staff])
    await expect(register(device)).rejects.toThrow()
    await db.query("UPDATE auth.users SET raw_app_meta_data=$2::jsonb, banned_until=now()+interval '1 day' WHERE id=$1", [staff, JSON.stringify({ role: 'kitchen' })])
    await expect(register(device)).rejects.toThrow()
    await db.query('UPDATE auth.users SET banned_until=NULL, deleted_at=now() WHERE id=$1', [staff])
    await expect(register(device)).rejects.toThrow()
    await db.query('UPDATE auth.users SET deleted_at=NULL WHERE id=$1', [staff])
  })

  it('retires an old installation for the same token and returns no foreign row data', async () => {
    await claims(staff); await register(device)
    await claims(other)
    const result = await register('Bbcdefghijklmnopqrstuv')
    expect(result.rows).toEqual([{ register_merchant_fcm_token: '' }])
    expect((await db.query('SELECT user_id,device_id FROM fcm_tokens')).rows).toEqual([{ user_id: other, device_id: 'Bbcdefghijklmnopqrstuv' }])
  })

  it('skips deactivated, signed-out and reassigned recipients and never retries a sent device', async () => {
    await claims(staff); await register(device)
    await claims(other); await register('Bbcdefghijklmnopqrstuv', 'another-token')
    await claims(owner, 'service_role')
    await event(await makeOrder('counter'), 'created')
    const first = (await db.query('SELECT * FROM claim_merchant_notification()')).rows[0]
    await db.query('SELECT complete_merchant_notification($1,$2,$3)', [first.delivery_id,first.lease_id,'sent'])
    await db.query('UPDATE employees SET is_active=false WHERE auth_user_id<>$1', [first.user_id])
    expect((await db.query('SELECT * FROM claim_merchant_notification()')).rows).toHaveLength(0)
    expect((await db.query('SELECT status FROM merchant_notification_deliveries ORDER BY status')).rows.map((r) => r.status)).toEqual(['sent','skipped'])
  })

  it('bounds fan-out with a resumable registration cursor', async () => {
    await db.query(`INSERT INTO fcm_tokens(user_id,device_id,token,platform)
      SELECT $1,'installation-'||n,'fcm-token-'||n,'android' FROM generate_series(1,105) n`, [staff])
    await event(await makeOrder('counter'), 'created')
    await db.query('SELECT * FROM claim_merchant_notification()')
    expect((await db.query('SELECT count(*)::int n FROM merchant_notification_deliveries')).rows[0].n).toBe(100)
    expect((await outbox())[0].expanded_at).toBeNull()
    await db.query('SELECT * FROM claim_merchant_notification()')
    expect((await db.query('SELECT count(*)::int n FROM merchant_notification_deliveries')).rows[0].n).toBe(105)
    expect((await outbox())[0].expanded_at).not.toBeNull()
  })

  it('backs off retries, stops at eight attempts, and removes a confirmed unchanged unregistered token', async () => {
    await claims(staff); await register(device)
    await claims(owner, 'service_role'); await event(await makeOrder('counter'), 'created')
    for (let attempt = 1; attempt <= 8; attempt++) {
      const claimed = (await db.query('SELECT * FROM claim_merchant_notification()')).rows[0]
      expect(claimed).toBeDefined()
      await db.query('SELECT complete_merchant_notification($1,$2,$3)', [claimed.delivery_id, claimed.lease_id, 'retry'])
      expect((await db.query('SELECT * FROM claim_merchant_notification()')).rows).toHaveLength(0)
      await db.query("UPDATE merchant_notification_deliveries SET available_at=now() WHERE id=$1", [claimed.delivery_id])
    }
    expect((await db.query('SELECT status,attempts FROM merchant_notification_deliveries')).rows).toEqual([{ status: 'failed', attempts: 8 }])
    await event(await makeOrder('counter'), 'created')
    const unregistered = (await db.query('SELECT * FROM claim_merchant_notification()')).rows[0]
    await db.query('SELECT complete_merchant_notification($1,$2,$3)', [unregistered.delivery_id,unregistered.lease_id,'unregistered'])
    expect((await db.query('SELECT * FROM fcm_tokens')).rows).toHaveLength(0)
  })

  it('checks live staff state, owner allowlist, validates and reassigns a device', async () => {
    await claims(staff)
    await expect(register('short')).rejects.toThrow()
    await register(device)
    await claims(other)
    await register(device, 'new-fcm-token')
    expect((await db.query('SELECT user_id,token FROM fcm_tokens')).rows).toEqual([{ user_id: other, token: 'new-fcm-token' }])
    await claims(staff)
    await db.exec('SET ROLE authenticated')
    await db.query('DELETE FROM fcm_tokens WHERE user_id=$1 AND device_id=$2', [staff, device])
    expect((await db.query('SELECT * FROM fcm_tokens')).rows).toHaveLength(0)
    await db.exec('RESET ROLE')
    expect((await db.query('SELECT user_id FROM fcm_tokens')).rows).toEqual([{ user_id: other }])
    await claims(other)
    await db.query('UPDATE employees SET is_active=false WHERE auth_user_id=$1', [other])
    await expect(register(device)).rejects.toThrow()
    await claims(owner)
    await register('Bbcdefghijklmnopqrstuv')
    await db.query('DELETE FROM merchant_notification_owners WHERE user_id=$1', [owner])
    await expect(register(device)).rejects.toThrow()
    await db.query('INSERT INTO merchant_notification_owners(user_id) VALUES ($1)', [owner])
  })

  it('allows only active own-row reads/deletes; disallows direct writes and RPC access', async () => {
    await claims(staff); await register(device)
    await claims(other); await register('Bbcdefghijklmnopqrstuv', 'another-fcm-token')
    await claims(staff)
    await db.exec('SET ROLE authenticated')
    expect((await db.query('SELECT user_id FROM fcm_tokens')).rows).toEqual([{ user_id: staff }])
    await expect(db.query("INSERT INTO fcm_tokens(user_id,device_id,token,platform) VALUES ($1,'direct','direct','android')", [staff])).rejects.toThrow()
    await expect(db.query('SELECT * FROM public.claim_merchant_notification()')).rejects.toThrow()
    await expect(db.query('SELECT * FROM public.merchant_notification_owners')).rejects.toThrow()
    await expect(db.query('SELECT * FROM public.merchant_notification_outbox')).rejects.toThrow()
    await expect(db.query('SELECT public.merchant_notification_user_authorized($1)', [other])).rejects.toThrow()
    await expect(db.query('SELECT public.complete_merchant_notification(gen_random_uuid(),gen_random_uuid(),$1)', ['sent'])).rejects.toThrow()
    await db.query('DELETE FROM fcm_tokens WHERE user_id=$1 AND device_id=$2', [staff, device])
    expect((await db.query('SELECT user_id FROM fcm_tokens')).rows).toHaveLength(0)
    await db.exec('RESET ROLE')
    expect((await db.query('SELECT user_id FROM fcm_tokens')).rows).toEqual([{ user_id: other }])
  })

  it('fences expired claims, retries only failed recipients, and deletes only the unchanged unregistered token', async () => {
    await claims(staff); await register(device, 'first-token')
    await claims(other); await register('Bbcdefghijklmnopqrstuv', 'second-token')
    await claims(owner, 'service_role')
    const id = await makeOrder('counter'); await event(id, 'created')
    const claim = async () => (await db.query('SELECT * FROM claim_merchant_notification()')).rows[0]
    const done = (d, outcome) => db.query('SELECT complete_merchant_notification($1,$2,$3)', [d.delivery_id, d.lease_id, outcome])
    const first = await claim()
    await done(first, 'sent')
    const second = await claim()
    expect(second.delivery_id).not.toBe(first.delivery_id)
    await db.query("UPDATE merchant_notification_deliveries SET lease_until=now()-interval '1 second' WHERE id=$1", [second.delivery_id])
    const replacement = await claim()
    expect(replacement.delivery_id).toBe(second.delivery_id)
    expect(replacement.lease_id).not.toBe(second.lease_id)
    expect((await done(second, 'sent')).rows[0].complete_merchant_notification).toBe(false)
    // A token refreshed after claiming must not be deleted by the old response.
    await claims(replacement.user_id); await register(replacement.device_id, 'refreshed-token')
    await claims(owner, 'service_role'); await done(replacement, 'unregistered')
    expect((await db.query("SELECT token FROM fcm_tokens WHERE token='refreshed-token'")).rows).toHaveLength(1)
    expect(await claim()).toBeUndefined() // Retry respects its backoff.
    await db.query("UPDATE merchant_notification_deliveries SET available_at=now() WHERE id=$1", [replacement.delivery_id])
    const refreshed = await claim()
    expect(refreshed.token).toBe('refreshed-token')
    await done(refreshed, 'sent')
    expect(await claim()).toBeUndefined()
    expect((await db.query("SELECT status FROM merchant_notification_deliveries ORDER BY status")).rows.map((r) => r.status)).toEqual(['sent','sent'])
  })
})

describe('repeat until viewed', () => {
  const secondDevice = 'Bbcdefghijklmnopqrstuv'
  const setV2 = (id, orderAlerts = true, sound = true, vibration = true, repeat = true) =>
    db.query('SELECT public.set_merchant_notification_preferences_v2($1,$2,$3,$4,$5)',
      [id, orderAlerts, sound, vibration, repeat])
  const setPreferences = (id, orderAlerts, sound, vibration) =>
    db.query('SELECT public.set_merchant_notification_preferences($1,$2,$3,$4)', [id, orderAlerts, sound, vibration])
  const ack = (id, order) => db.query('SELECT public.acknowledge_merchant_order_view($1,$2)', [id, order])
  const claim = async () => (await db.query('SELECT * FROM claim_merchant_notification()')).rows
  const claimAll = async () => {
    const rows = []
    for (;;) {
      const [row] = await claim()
      if (!row) return rows
      rows.push(row)
    }
  }
  const claimRepeat = async () => (await db.query('SELECT * FROM claim_merchant_notification_repeat()')).rows
  const complete = (row, outcome) =>
    db.query('SELECT public.complete_merchant_notification($1,$2,$3)', [row.delivery_id, row.lease_id, outcome])
  const completeRepeat = (row, outcome) =>
    db.query('SELECT public.complete_merchant_notification_repeat($1,$2,$3)', [row.token_id, row.lease_id, outcome])
  const repeatRows = async () => (await db.query('SELECT * FROM merchant_notification_repeats')).rows
  const prepareRepeat = async (order) => {
    const first = (await claim())[0]
    await complete(first, 'sent')
    const [row] = await repeatRows()
    if (order) {
      expect(row.order_id).toBe(order)
    }
    await db.query("UPDATE merchant_notification_repeats SET next_at=now() - interval '1 second'")
    return (await claimRepeat())[0]
  }

  it('keeps old four-argument callers from enrolling in repeats', async () => {
    await claims(staff); await register(device)
    expect((await db.query('SELECT repeat_until_viewed_enabled,repeat_client_capable FROM fcm_tokens')).rows).toEqual([
      { repeat_until_viewed_enabled: true, repeat_client_capable: false },
    ])
    expect((await setPreferences(device, true, true, true)).rows[0].set_merchant_notification_preferences).toBe(true)
    await claims(owner, 'service_role'); await event(await makeOrder('counter'), 'created')
    await complete((await claim())[0], 'sent')
    expect(await repeatRows()).toHaveLength(0)
  })

  it('validates the five-argument preference and acknowledgement RPCs', async () => {
    await claims(staff); await register(device)
    const order = await makeOrder('counter')
    expect((await setV2(device, true, true, true, true)).rows[0].set_merchant_notification_preferences_v2).toBe(true)
    expect((await db.query('SELECT repeat_client_capable FROM fcm_tokens')).rows).toEqual([{ repeat_client_capable: true }])
    await claims(other)
    expect((await setV2(device)).rows[0].set_merchant_notification_preferences_v2).toBe(false)
    expect((await ack(device, order)).rows[0].acknowledge_merchant_order_view).toBe(false)
    await claims(staff)
    await expect(setV2('short')).rejects.toThrow()
    await expect(setV2(device, true, true, true, null)).rejects.toThrow()
    await expect(ack(device, '../orders')).rejects.toThrow()
    await expect(ack(device, '11111111-1111-1111-1111-111111111111')).resolves.toBeDefined()
    await db.query('UPDATE employees SET is_active=false WHERE auth_user_id=$1', [staff])
    await expect(setV2(device)).rejects.toThrow()
    await expect(ack(device, order)).rejects.toThrow()
    await claims(owner, 'service_role')
    await expect(setV2(device)).rejects.toThrow()
    await expect(ack(device, order)).rejects.toThrow()
    await db.exec('SET ROLE anon')
    await expect(setV2(device)).rejects.toThrow()
    await expect(ack(device, order)).rejects.toThrow()
    await db.exec('RESET ROLE')
    await db.query('UPDATE employees SET is_active=true WHERE auth_user_id=$1', [staff])
    await claims(staff)
    expect((await ack(device, order)).rows[0].acknowledge_merchant_order_view).toBe(true)
    const views = await db.query('SELECT count(*)::int n FROM merchant_notification_views')
    expect(views.rows[0].n).toBe(1)
    expect((await ack(device, order)).rows[0].acknowledge_merchant_order_view).toBe(true)
    expect((await db.query('SELECT count(*)::int n FROM merchant_notification_views')).rows[0].n).toBe(1)
  })

  it('arms a 10-second repeat, re-arms without backoff, and stops at 15 minutes', async () => {
    await claims(staff); await register(device); await setV2(device)
    await claims(owner, 'service_role'); await event(await makeOrder('counter'), 'created')
    await complete((await claim())[0], 'sent')
    const [armed] = await repeatRows()
    expect(armed.repeat_count).toBe(0)
    expect(new Date(armed.next_at) - new Date(armed.started_at)).toBe(10_000)
    expect(new Date(armed.expires_at) - new Date(armed.started_at)).toBe(15 * 60_000)

    await db.query("UPDATE merchant_notification_repeats SET next_at=now() - interval '1 second'")
    const repeated = (await claimRepeat())[0]
    expect(repeated.repeat_count).toBe(1)
    expect(repeated.event_id).toBe((await outbox())[0].id)
    await completeRepeat(repeated, 'sent')
    expect(await repeatRows()).toHaveLength(1)
    await db.query("UPDATE merchant_notification_repeats SET repeat_count=89, next_at=now() - interval '1 second'")
    const final = (await claimRepeat())[0]
    expect(final.repeat_count).toBe(90)
    await completeRepeat(final, 'sent')
    expect(await repeatRows()).toHaveLength(0)
  })

  it('retries a failed repeat in 30 seconds and fences a completed lease', async () => {
    await claims(staff); await register(device); await setV2(device)
    await claims(owner, 'service_role'); await event(await makeOrder('counter'), 'created')
    const repeat = await prepareRepeat()
    expect((await completeRepeat(repeat, 'retry')).rows[0].complete_merchant_notification_repeat).toBe(true)
    expect((await completeRepeat(repeat, 'sent')).rows[0].complete_merchant_notification_repeat).toBe(false)
    const [row] = await repeatRows()
    expect(new Date(row.next_at) - Date.now()).toBeGreaterThan(25_000)
    expect(new Date(row.next_at) - Date.now()).toBeLessThan(35_000)
    expect(row.lease_id).toBeNull()
  })

  it('stops repeats only for the device that viewed the order', async () => {
    await claims(staff); await register(device); await setV2(device)
    await claims(other); await register(secondDevice, 'another-token'); await setV2(secondDevice)
    await claims(owner, 'service_role')
    const order = await makeOrder('counter'); await event(order, 'created')
    for (const row of await claimAll()) await complete(row, 'sent')
    expect(await repeatRows()).toHaveLength(2)

    await claims(staff)
    expect((await ack(device, order)).rows[0].acknowledge_merchant_order_view).toBe(true)
    expect(await repeatRows()).toHaveLength(1)
    expect((await repeatRows())[0].order_id).toBe(order)
    await db.query("UPDATE merchant_notification_repeats SET next_at=now() - interval '1 second'")
    const [remaining] = await claimRepeat()
    const otherToken = (await db.query('SELECT device_id FROM fcm_tokens WHERE id=$1', [remaining.token_id])).rows[0].device_id
    expect(otherToken).toBe(secondDevice)
  })

  it('supersedes an older repeat with a newer order and never resumes the older one', async () => {
    await claims(staff); await register(device); await setV2(device)
    await claims(owner, 'service_role')
    const first = await makeOrder('counter'); await event(first, 'created')
    for (const row of await claimAll()) await complete(row, 'sent')
    expect((await repeatRows())[0].order_id).toBe(first)
    const second = await makeOrder('counter'); await event(second, 'created')
    for (const row of await claimAll()) await complete(row, 'sent')
    expect((await repeatRows())[0].order_id).toBe(second)

    await claims(staff); await ack(device, second)
    expect(await repeatRows()).toHaveLength(0)
  })

  it('stops repeats when preferences are disabled and preserves them on token refresh', async () => {
    await claims(staff); await register(device); await setV2(device)
    await claims(owner, 'service_role'); await event(await makeOrder('counter'), 'created')
    await complete((await claim())[0], 'sent')
    expect(await repeatRows()).toHaveLength(1)
    await claims(staff); await register(device, 'refreshed-token')
    expect((await db.query('SELECT token,repeat_client_capable FROM fcm_tokens')).rows).toEqual([
      { token: 'refreshed-token', repeat_client_capable: true },
    ])
    expect(await repeatRows()).toHaveLength(1)
    await setV2(device, true, true, true, false)
    expect(await repeatRows()).toHaveLength(0)
    await setV2(device, true, true, true, true)
    await setPreferences(device, false, true, true)
    expect((await db.query('SELECT repeat_client_capable,order_alerts_enabled FROM fcm_tokens')).rows).toEqual([
      { repeat_client_capable: false, order_alerts_enabled: false },
    ])
  })

  it('resets repeat capability and view state after an account switch', async () => {
    await claims(staff); await register(device); await setV2(device)
    const order = await makeOrder('counter'); await ack(device, order)
    await claims(other); await register(device, 'new-fcm-token')
    expect((await db.query('SELECT repeat_until_viewed_enabled,repeat_client_capable FROM fcm_tokens')).rows).toEqual([
      { repeat_until_viewed_enabled: true, repeat_client_capable: false },
    ])
    expect((await db.query('SELECT count(*)::int n FROM merchant_notification_views')).rows[0].n).toBe(0)
  })

  it('removes an unchanged unregistered token during a repeat and retains a refreshed one', async () => {
    await claims(staff); await register(device); await setV2(device)
    await claims(owner, 'service_role'); await event(await makeOrder('counter'), 'created')
    const repeat = await prepareRepeat()
    await claims(staff); await register(device, 'refreshed-token')
    await claims(owner, 'service_role')
    expect((await completeRepeat(repeat, 'unregistered')).rows[0].complete_merchant_notification_repeat).toBe(true)
    expect((await db.query('SELECT token FROM fcm_tokens')).rows).toEqual([{ token: 'refreshed-token' }])
    expect(await repeatRows()).toHaveLength(1)
  })

  it('cleans up expired, viewed, muted, unauthorized and due-stopped repeat rows', async () => {
    await claims(staff); await register(device); await setV2(device)
    await claims(owner, 'service_role')
    const order = await makeOrder('counter'); await event(order, 'created')
    await complete((await claim())[0], 'sent')
    await db.query("UPDATE merchant_notification_repeats SET expires_at=now() - interval '1 second'")
    expect(await claimRepeat()).toHaveLength(0)
    expect(await repeatRows()).toHaveLength(0)

    const second = await makeOrder('counter'); await event(second, 'created')
    await complete((await claim())[0], 'sent')
    await claims(staff); await ack(device, second)
    await claims(owner, 'service_role')
    await db.query("UPDATE merchant_notification_repeats SET next_at=now() - interval '1 second'")
    expect(await claimRepeat()).toHaveLength(0)
    expect(await repeatRows()).toHaveLength(0)
  })
})

describe('per-device notification preferences', () => {
  const setPreferences = (id, orderAlerts, sound, vibration) =>
    db.query('SELECT public.set_merchant_notification_preferences($1,$2,$3,$4)', [id, orderAlerts, sound, vibration])
  const claim = async () => (await db.query('SELECT * FROM claim_merchant_notification()')).rows

  it('defaults to sound and vibration, saves own preferences, and returns them with the claim', async () => {
    await claims(staff); await register(device)
    expect((await db.query('SELECT order_alerts_enabled,sound_enabled,vibration_enabled FROM fcm_tokens')).rows).toEqual([
      { order_alerts_enabled: true, sound_enabled: true, vibration_enabled: true },
    ])
    expect((await setPreferences(device, true, true, false)).rows[0].set_merchant_notification_preferences).toBe(true)
    await claims(owner, 'service_role')
    await event(await makeOrder('counter'), 'created')
    expect((await claim())[0]).toMatchObject({ device_id: device, sound_enabled: true, vibration_enabled: false })
  })

  it('rejects writes for another device, inactive staff, anonymous and service roles, and malformed input', async () => {
    await claims(staff); await register(device)
    await claims(other)
    expect((await setPreferences(device, false, false, false)).rows[0].set_merchant_notification_preferences).toBe(false)
    expect((await db.query('SELECT order_alerts_enabled FROM fcm_tokens')).rows[0].order_alerts_enabled).toBe(true)
    await claims(staff)
    await expect(setPreferences('short', false, false, false)).rejects.toThrow()
    await expect(setPreferences(device, null, true, true)).rejects.toThrow()
    await db.query('UPDATE employees SET is_active=false WHERE auth_user_id=$1', [staff])
    await expect(setPreferences(device, false, false, false)).rejects.toThrow()
    await claims(owner, 'service_role')
    await expect(setPreferences(device, false, false, false)).rejects.toThrow()
    await db.exec('SET ROLE anon')
    await expect(setPreferences(device, false, false, false)).rejects.toThrow()
    await db.exec('RESET ROLE')
  })

  it('keeps preferences when the token refreshes', async () => {
    await claims(staff); await register(device, 'first-token')
    await setPreferences(device, false, true, false)
    await register(device, 'second-token')
    expect((await db.query('SELECT token,order_alerts_enabled,sound_enabled,vibration_enabled FROM fcm_tokens')).rows).toEqual([
      { token: 'second-token', order_alerts_enabled: false, sound_enabled: true, vibration_enabled: false },
    ])
  })

  it('mutes fan-out and skips deliveries pending when the device was muted', async () => {
    await claims(staff); await register(device)
    await claims(owner, 'service_role')
    await event(await makeOrder('counter'), 'created')
    expect(await claim()).toHaveLength(1)
    // Return the delivery to pending to represent an alert queued before the mute.
    await db.query("UPDATE merchant_notification_deliveries SET status='pending', lease_id=NULL, lease_until=NULL")

    await claims(staff)
    expect((await setPreferences(device, false, true, true)).rows[0].set_merchant_notification_preferences).toBe(true)
    await claims(owner, 'service_role')
    expect(await claim()).toHaveLength(0)
    expect((await db.query('SELECT status FROM merchant_notification_deliveries')).rows).toEqual([{ status: 'skipped' }])

    await event(await makeOrder('counter'), 'created')
    expect(await claim()).toHaveLength(0)
    expect((await db.query('SELECT count(*)::int n FROM merchant_notification_deliveries')).rows[0].n).toBe(1)

    await claims(staff)
    await setPreferences(device, true, true, true)
    await claims(owner, 'service_role')
    await event(await makeOrder('counter'), 'created')
    expect(await claim()).toHaveLength(1)
  })
})

describe('alert sound choice', () => {
  const setV3 = (id, orderAlerts = true, sound = true, vibration = true, repeat = true, alertSound = 'krapow') =>
    db.query('SELECT public.set_merchant_notification_preferences_v3($1,$2,$3,$4,$5,$6)',
      [id, orderAlerts, sound, vibration, repeat, alertSound])
  const setV2 = (id, orderAlerts = true, sound = true, vibration = true, repeat = true) =>
    db.query('SELECT public.set_merchant_notification_preferences_v2($1,$2,$3,$4,$5)',
      [id, orderAlerts, sound, vibration, repeat])
  const claim = async () => (await db.query('SELECT * FROM claim_merchant_notification()')).rows
  const claimRepeat = async () => (await db.query('SELECT * FROM claim_merchant_notification_repeat()')).rows
  const complete = (row, outcome) =>
    db.query('SELECT public.complete_merchant_notification($1,$2,$3)', [row.delivery_id, row.lease_id, outcome])

  it('defaults every registration to the krapow chime', async () => {
    await claims(staff); await register(device)
    expect((await db.query('SELECT alert_sound FROM fcm_tokens')).rows).toEqual([{ alert_sound: 'krapow' }])
  })

  it('saves the sound choice and returns it with both claims', async () => {
    await claims(staff); await register(device)
    expect((await setV3(device, true, true, true, true, 'bell')).rows[0].set_merchant_notification_preferences_v3).toBe(true)
    expect((await db.query('SELECT alert_sound,repeat_client_capable FROM fcm_tokens')).rows).toEqual([
      { alert_sound: 'bell', repeat_client_capable: true },
    ])
    await claims(owner, 'service_role')
    await event(await makeOrder('counter'), 'created')
    const initial = (await claim())[0]
    expect(initial).toMatchObject({ device_id: device, alert_sound: 'bell' })
    await complete(initial, 'sent')
    await db.query("UPDATE merchant_notification_repeats SET next_at=now() - interval '1 second'")
    expect((await claimRepeat())[0]).toMatchObject({ device_id: device, alert_sound: 'bell' })
  })

  it('leaves the sound choice untouched for five-argument callers', async () => {
    await claims(staff); await register(device)
    expect((await setV3(device, true, true, true, true, 'chime')).rows[0].set_merchant_notification_preferences_v3).toBe(true)
    await claims(staff)
    expect((await setV2(device, true, true, false, true)).rows[0].set_merchant_notification_preferences_v2).toBe(true)
    expect((await db.query('SELECT alert_sound FROM fcm_tokens')).rows).toEqual([{ alert_sound: 'chime' }])
  })

  it('deletes the repeat row when repeats are switched off through v3', async () => {
    await claims(staff); await register(device)
    expect((await setV3(device, true, true, true, true, 'chime')).rows[0].set_merchant_notification_preferences_v3).toBe(true)
    await claims(owner, 'service_role')
    await event(await makeOrder('counter'), 'created')
    await complete((await claim())[0], 'sent')
    expect((await db.query('SELECT count(*)::int n FROM merchant_notification_repeats')).rows[0].n).toBe(1)
    await claims(staff)
    expect((await setV3(device, true, true, true, false, 'chime')).rows[0].set_merchant_notification_preferences_v3).toBe(true)
    expect((await db.query('SELECT count(*)::int n FROM merchant_notification_repeats')).rows[0].n).toBe(0)
  })

  it('rejects invalid sound values and unauthorized callers', async () => {
    await claims(staff); await register(device)
    await expect(setV3(device, true, true, true, true, 'bogus')).rejects.toThrow()
    await expect(setV3(device, true, true, true, null)).rejects.toThrow()
    await claims(owner, 'service_role')
    await expect(setV3(device)).rejects.toThrow()
    await db.exec('SET ROLE anon')
    await expect(setV3(device)).rejects.toThrow()
    await db.exec('RESET ROLE')
  })
})
