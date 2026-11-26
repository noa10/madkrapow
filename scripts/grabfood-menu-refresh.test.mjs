import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

let db
const migration = new URL('../supabase/migrations/20261126130000_grabfood_menu_refresh.sql', import.meta.url)
const token = '11111111-1111-4111-8111-111111111111'
const token2 = '22222222-2222-4222-8222-222222222222'
const events = async () => (await db.query('select * from grabfood_menu_refresh order by id')).rows
const claim = async (t) => (await db.query('select * from claim_grabfood_menu_refresh($1)', [t])).rows

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table categories(id int, name text, sort_order int, is_active boolean);
    create table menu_items(id int, category_id int, name text, description text, price_cents int, image_url text, is_available boolean, snooze_till timestamptz, sort_order int);
    create table modifier_groups(id int, name text, min_selections int, max_selections int, sort_order int);
    create table modifiers(id int, modifier_group_id int, name text, price_delta_cents int, is_available boolean, sort_order int);
    create table menu_item_modifier_groups(id int, menu_item_id int, modifier_group_id int);
    create table channel_products(id int, menu_item_id int, channel text, external_item_id text, external_name text, price_cents int, is_available boolean, snooze_till timestamptz, snooze_restore_required boolean);
    create table channel_categories(id int, category_id int, channel text, external_category_id text);
    create table channel_modifiers(id int, modifier_id int, channel text, price_cents int);
  `)
  await db.exec(await readFile(migration, 'utf8'))
})
afterAll(async () => { await db?.close() })
beforeEach(async () => {
  await db.exec('truncate categories, menu_items, modifier_groups, modifiers, menu_item_modifier_groups, channel_products, channel_categories, channel_modifiers, grabfood_menu_refresh restart identity')
})

describe('durable GrabFood menu refresh', () => {
  it('captures inserts, relevant updates and deletions from all menu sources', async () => {
    for (const sql of [
      "insert into categories(id,name) values (1,'Category')",
      "insert into menu_items(id,name) values (1,'Item')",
      "insert into modifier_groups(id,name) values (1,'Group')",
      "insert into modifiers(id,name) values (1,'Modifier')",
      'insert into menu_item_modifier_groups(id,menu_item_id) values (1,1)',
      "insert into channel_products(id,channel) values (1,'grabfood')",
      "insert into channel_categories(id,channel) values (1,'grabfood')",
      "insert into channel_modifiers(id,channel) values (1,'grabfood')",
    ]) await db.exec(sql)
    expect(await events()).toHaveLength(8)
    await db.exec("update menu_items set name='Changed' where id=1; delete from channel_modifiers where id=1")
    expect(await events()).toHaveLength(10)
    await db.exec("update channel_products set snooze_restore_required=true where id=1; insert into channel_products(id,channel) values (2,'foodpanda')")
    expect(await events()).toHaveLength(10)
  })
  it('captures later-added archive fields and rolls back with the edit', async () => {
    await db.exec('alter table categories add column if not exists archived_at timestamptz')
    await db.exec("insert into categories(id,name) values (1,'one'); update categories set archived_at=now() where id=1")
    expect(await events()).toHaveLength(2)
    await db.exec("begin; update categories set name='rolled back' where id=1; rollback")
    expect(await events()).toHaveLength(2)
  })
  it('restricts queue and claim access to the service role while staff edits enqueue', async () => {
    const { rows } = await db.query(`select
      has_table_privilege('authenticated', 'public.grabfood_menu_refresh', 'SELECT') as can_read,
      has_function_privilege('authenticated', 'public.claim_grabfood_menu_refresh(uuid)', 'EXECUTE') as can_claim,
      has_function_privilege('anon', 'public.claim_grabfood_menu_refresh(uuid)', 'EXECUTE') as anon_can_claim,
      has_function_privilege('anon', 'public.finish_grabfood_menu_refresh(uuid,bigint,text)', 'EXECUTE') as anon_can_finish,
      has_function_privilege('authenticated', 'public.cleanup_grabfood_menu_refresh()', 'EXECUTE') as can_cleanup,
      has_function_privilege('service_role', 'public.claim_grabfood_menu_refresh(uuid)', 'EXECUTE') as service_can_claim,
      has_function_privilege('service_role', 'public.cleanup_grabfood_menu_refresh()', 'EXECUTE') as service_can_cleanup`)
    expect(rows[0]).toEqual({
      can_read: false,
      can_claim: false,
      anon_can_claim: false,
      anon_can_finish: false,
      can_cleanup: false,
      service_can_claim: true,
      service_can_cleanup: true,
    })
    await db.exec("grant insert on categories to authenticated; set role authenticated; insert into categories(id,name) values (9,'Staff edit'); reset role")
    expect(await events()).toHaveLength(1)
  })
  it('coalesces a burst into one claim while keeping later edits pending', async () => {
    await db.exec("insert into categories(id,name) values (1,'one'); update categories set name='two' where id=1; update categories set name='three' where id=1")
    const [claimed] = await claim(token)
    expect(claimed.covered_revision).toBe(3)
    await db.query('select finish_grabfood_menu_refresh($1,$2,$3)', [token, claimed.covered_revision, null])
    expect(await claim(token2)).toHaveLength(0)
    await db.exec("update categories set name='four' where id=1")
    const [next] = await claim(token2)
    expect(next.covered_revision).toBe(4)
  })
  it('does not let coalescing acknowledge a snooze expiry that is still in the future', async () => {
    await db.exec("insert into categories(id,name) values (1,'now')")
    await db.exec("insert into menu_items(id,name,snooze_till) values (1,'snoozed',now()+interval '1 hour')")
    const [claimed] = await claim(token)
    await db.query('select finish_grabfood_menu_refresh($1,$2,$3)', [token, claimed.covered_revision, null])
    const pending = await events()
    expect(pending.filter((e) => e.notified_at === null)).toHaveLength(1)
    expect(new Date(pending.find((e) => e.notified_at === null).available_at).getTime()).toBeGreaterThan(Date.now())
  })
  it('removes old notified events without touching pending or fresh ones', async () => {
    await db.exec("insert into categories(id,name) values (1,'old')")
    const [claimed] = await claim(token)
    await db.query('select finish_grabfood_menu_refresh($1,$2,$3)', [token, claimed.covered_revision, null])
    await db.exec("insert into categories(id,name) values (2,'pending'); insert into categories(id,name) values (3,'fresh')")
    await db.exec("update grabfood_menu_refresh set notified_at=now()-interval '8 days' where revision=1; update grabfood_menu_refresh set notified_at=now() where revision=3")
    await db.exec("update grabfood_menu_refresh set available_at=now()-interval '1 second' where notified_at is null")
    const [covered] = await claim(token2)
    expect(covered.covered_revision).toBe(2)
    await db.query('select finish_grabfood_menu_refresh($1,$2,$3)', [token2, covered.covered_revision, null])
    const remaining = (await events()).map((e) => e.revision)
    expect(remaining).not.toContain(1)
    expect(remaining).toContain(2)
    expect(remaining).toContain(3)
  })
  it('does not acknowledge an edit inserted during an earlier notification', async () => {
    await db.exec("insert into categories(id,name) values (1,'one')")
    const [first] = await claim(token)
    await db.exec("update categories set name='two' where id=1")
    await db.query('select finish_grabfood_menu_refresh($1,$2,$3)', [token, first.covered_revision, null])
    expect((await events()).filter((e) => e.notified_at === null)).toHaveLength(1)
    expect(await claim(token2)).toHaveLength(1)
  })
  it('retries failures and expired claims while rejecting stale completion', async () => {
    await db.exec("insert into categories(id,name) values (1,'one')")
    const [first] = await claim(token)
    expect(await claim(token2)).toHaveLength(0)
    await db.exec("update grabfood_menu_refresh set lease_until=now()-interval '1 second'")
    const [second] = await claim(token2)
    await db.query('select finish_grabfood_menu_refresh($1,$2,$3)', [token, first.covered_revision, null])
    expect((await events())[0].notified_at).toBeNull()
    await db.query('select finish_grabfood_menu_refresh($1,$2,$3)', [token2, second.covered_revision, 'network failure'])
    expect((await events())[0].last_error).toBe('network failure')
    expect(await claim(token)).toHaveLength(0)
    await db.exec("update grabfood_menu_refresh set available_at=now()-interval '1 second'")
    expect(await claim(token)).toHaveLength(1)
  })
  it('backs off after a failure and resets attempts after success', async () => {
    await db.exec("insert into categories(id,name) values (1,'one')")
    const [first] = await claim(token)
    await db.query('select finish_grabfood_menu_refresh($1,$2,$3)', [token, first.covered_revision, 'network failure'])
    const [failed] = await events()
    expect(failed.attempts).toBe(1)
    expect(failed.notified_at).toBeNull()
    expect(new Date(failed.available_at).getTime()).toBeGreaterThan(Date.now() + 20000)
    await db.exec("update grabfood_menu_refresh set available_at=now()-interval '1 second'")
    const [second] = await claim(token2)
    await db.query('select finish_grabfood_menu_refresh($1,$2,$3)', [token2, second.covered_revision, null])
    const [succeeded] = await events()
    expect(succeeded.attempts).toBe(0)
    expect(succeeded.last_error).toBeNull()
    expect(succeeded.notified_at).not.toBeNull()
  })
  it('does not add another future event when an already-snoozed row is edited again', async () => {
    await db.exec("insert into menu_items(id,name,snooze_till) values (1,'one',now()+interval '1 hour')")
    const future = (await events()).filter((e) => new Date(e.available_at).getTime() > Date.now())
    expect(future).toHaveLength(1)
    await db.exec("update menu_items set name='renamed' where id=1")
    expect((await events()).filter((e) => new Date(e.available_at).getTime() > Date.now())).toHaveLength(1)
  })
  it.each(['menu_items', 'channel_products'])('schedules another refresh when %s snooze expires even without restore flag', async (table) => {
    const future = "now()+interval '1 hour'"
    if (table === 'menu_items') await db.exec(`insert into menu_items(id,name,snooze_till) values (1,'one',${future})`)
    else await db.exec(`insert into channel_products(id,channel,snooze_restore_required,snooze_till) values (1,'grabfood',false,${future})`)
    expect((await events()).filter((e) => new Date(e.available_at).getTime() > Date.now())).toHaveLength(1)
    const [initial] = await claim(token)
    expect(initial.covered_revision).toBeGreaterThan(0)
    await db.query('select finish_grabfood_menu_refresh($1,$2,$3)', [token, initial.covered_revision, null])
    expect(await claim(token2)).toHaveLength(0)
    await db.exec("update grabfood_menu_refresh set available_at=now()-interval '1 second' where notified_at is null")
    expect(await claim(token2)).toHaveLength(1)
  })
})
