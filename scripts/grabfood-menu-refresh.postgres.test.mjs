import { execFile, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// This file shells out to Docker and holds real transactions open, so it needs
// a wider budget than the suite default when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 30000, hookTimeout: 60000 })

// The local Supabase database container is not present in CI lint/typecheck or
// on a dev machine without Docker, so the suite skips instead of failing.
// Set SUPABASE_DB_CONTAINER to target a specific container.
function findContainer() {
  if (process.env.SUPABASE_DB_CONTAINER) return process.env.SUPABASE_DB_CONTAINER
  try {
    const names = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8', timeout: 15000 })
    return names.split('\n').map((name) => name.trim()).find((name) => name.startsWith('supabase_db_')) ?? null
  } catch {
    return null
  }
}
const container = findContainer()
const available = container !== null && (() => {
  try {
    execFileSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore', timeout: 15000 })
    return true
  } catch {
    return false
  }
})()
const database = `menu_refresh_test_${process.pid}_${Date.now()}_${randomUUID().slice(0, 8)}`
const migration = readFileSync(new URL('../supabase/migrations/20261126130000_grabfood_menu_refresh.sql', import.meta.url), 'utf8')
const backoffMigration = readFileSync(new URL('../supabase/migrations/20261127110000_menu_refresh_backoff.sql', import.meta.url), 'utf8')
const marginMigration = readFileSync(new URL('../supabase/migrations/20261127120000_menu_refresh_cooldown_margin.sql', import.meta.url), 'utf8')
const psql = (statement, db = database) => execFileSync('docker', [
  'exec', '-i', container, 'psql', '-X', '-q', '-At', '-U', 'postgres', '-d', db,
  '-v', 'ON_ERROR_STOP=1', '-c', statement,
], { encoding: 'utf8', timeout: 60000 })
const sql = (statement) => psql(`BEGIN; ${statement}; COMMIT`)
const events = () => Number(psql('SELECT count(*) FROM grabfood_menu_refresh').trim())
const reset = () => sql('TRUNCATE categories, menu_items, modifier_groups, modifiers, menu_item_modifier_groups, channel_products, channel_categories, channel_modifiers, grabfood_menu_refresh RESTART IDENTITY')

// Hold a transaction open in a separate psql process while a second connection
// attempts the opposing statement. `pg_sleep` keeps the first lock long enough
// for the overlap to be real; deadlock_timeout is shortened to fail fast.
function run(statement) {
  return new Promise((resolve, reject) => {
    execFile('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-At', '-U', 'postgres', '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-c', `SET deadlock_timeout='300ms'; ${statement}`], { timeout: 45000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${error.message}\n${stderr}`))
      else resolve(stdout)
    })
  })
}

// CREATE DATABASE reads template1, so a concurrent run can transiently fail it.
function createDatabase() {
  for (let attempt = 1; ; attempt += 1) {
    try {
      psql(`CREATE DATABASE "${database}"`, 'postgres')
      return
    } catch (error) {
      if (attempt === 3) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
    }
  }
}

beforeAll(() => {
  if (!available) return
  createDatabase()
  for (const role of ['anon', 'authenticated', 'service_role']) {
    // Concurrent runs may create the same cluster-wide role; the DO block makes
    // that race harmless instead of a check-then-create failure.
    psql(`DO $$ BEGIN CREATE ROLE ${role} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`, 'postgres')
  }
  sql(`
    CREATE TABLE categories(id int PRIMARY KEY, name text, sort_order int, is_active boolean, archived_at timestamptz);
    CREATE TABLE menu_items(id int PRIMARY KEY, category_id int, name text, description text, price_cents int, image_url text, is_available boolean, snooze_till timestamptz, sort_order int, archived_at timestamptz);
    CREATE TABLE modifier_groups(id int PRIMARY KEY, name text, min_selections int, max_selections int, sort_order int, archived_at timestamptz);
    CREATE TABLE modifiers(id int PRIMARY KEY, modifier_group_id int, name text, price_delta_cents int, is_available boolean, sort_order int, archived_at timestamptz);
    CREATE TABLE menu_item_modifier_groups(id int PRIMARY KEY, menu_item_id int, modifier_group_id int);
    CREATE TABLE channel_products(id int PRIMARY KEY, menu_item_id int, channel text, external_item_id text, external_name text, price_cents int, is_available boolean, snooze_till timestamptz, snooze_restore_required boolean);
    CREATE TABLE channel_categories(id int PRIMARY KEY, category_id int, channel text, external_category_id text);
    CREATE TABLE channel_modifiers(id int PRIMARY KEY, modifier_id int, channel text, price_cents int);
  `)
  sql(migration)
  sql(backoffMigration)
  sql(marginMigration)
})
afterAll(() => {
  if (!available) return
  // FORCE drops any session left behind by a timed-out statement, and the
  // catch keeps one failed cleanup from masking the test result.
  try {
    psql(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`, 'postgres')
  } catch (error) {
    console.error(`Could not drop ${database}: ${error instanceof Error ? error.message : error}`)
  }
})

describe.skipIf(!available)('GrabFood menu refresh with real PostgreSQL', () => {
  it('does not deadlock category archive against a concurrent item edit', async () => {
    reset()
    sql("INSERT INTO categories(id,name) VALUES (1,'c'); INSERT INTO menu_items(id,category_id,name) VALUES (1,1,'item')")
    // A category archive updates the category, then its items. Concurrent
    // writers touching the same catalogue rows overlap for a full second. A
    // shared queue row would make these transactions block each other here.
    const archive = run(`BEGIN; UPDATE categories SET archived_at=now() WHERE id=1;
      SELECT pg_sleep(1); UPDATE menu_items SET archived_at=now() WHERE category_id=1; COMMIT`)
    const edit = run(`BEGIN; UPDATE menu_items SET name='edited' WHERE id=1;
      SELECT pg_sleep(1); UPDATE channel_products SET price_cents=100 WHERE menu_item_id=1; COMMIT`)
    await expect(Promise.all([archive, edit])).resolves.toBeDefined()
    expect(events()).toBeGreaterThanOrEqual(2)
  })
  it('preserves an edit committed after an earlier claim regardless of commit order', () => {
    reset()
    sql("INSERT INTO categories(id,name) VALUES (1,'first')")
    const token = randomUUID()
    const revision = psql(`SELECT covered_revision FROM claim_grabfood_menu_refresh('${token}')`).trim()
    sql("UPDATE categories SET name='second' WHERE id=1")
    sql(`SELECT finish_grabfood_menu_refresh('${token}', ${revision}, NULL)`)
    expect(Number(psql('SELECT count(*) FROM grabfood_menu_refresh WHERE notified_at IS NULL').trim())).toBe(1)
  })
  it('coalesces a burst and cleans up old notified events', () => {
    reset()
    sql("INSERT INTO categories(id,name) VALUES (1,'one'); UPDATE categories SET name='two' WHERE id=1; UPDATE categories SET name='three' WHERE id=1")
    const token = randomUUID()
    const covered = Number(psql(`SELECT covered_revision FROM claim_grabfood_menu_refresh('${token}')`).trim())
    expect(covered).toBe(3)
    psql(`SELECT finish_grabfood_menu_refresh('${token}', ${covered}, NULL)`)
    expect(Number(psql('SELECT count(*) FROM grabfood_menu_refresh WHERE notified_at IS NULL').trim())).toBe(0)
    psql("UPDATE grabfood_menu_refresh SET notified_at = now() - interval '8 days'")
    psql("UPDATE categories SET name='four' WHERE id=1")
    const second = Number(psql(`SELECT covered_revision FROM claim_grabfood_menu_refresh('${randomUUID()}')`).trim())
    expect(second).toBe(4)
    expect(Number(psql('SELECT count(*) FROM grabfood_menu_refresh').trim())).toBe(1)
  })
  it('waits out the Grab cooldown before retrying a rejected notification', () => {
    reset()
    sql("INSERT INTO categories(id,name) VALUES (1,'one')")
    const token = randomUUID()
    const revision = Number(psql(`SELECT covered_revision FROM claim_grabfood_menu_refresh('${token}')`).trim())
    psql(`SELECT finish_grabfood_menu_refresh('${token}', ${revision}, 'GrabFood API failed (409): sync menu too frequently')`)
    const seconds = Number(psql("SELECT extract(epoch FROM (available_at - now()))::int FROM grabfood_menu_refresh").trim())
    expect(seconds).toBeGreaterThanOrEqual(145)
    expect(seconds).toBeLessThanOrEqual(155)
  })
  it('accepts concurrent writers without lock contention', async () => {
    reset()
    sql("INSERT INTO categories(id,name) VALUES (1,'one'); INSERT INTO categories(id,name) VALUES (2,'two')")
    const left = run(`BEGIN; UPDATE categories SET name='left' WHERE id=1; SELECT pg_sleep(1); COMMIT`)
    const right = run(`BEGIN; UPDATE categories SET name='right' WHERE id=2; SELECT pg_sleep(1); COMMIT`)
    await Promise.all([left, right])
    expect(events()).toBe(4)
  })
  it('does not deadlock when two workers claim at the same time', async () => {
    reset()
    sql("INSERT INTO categories(id,name) SELECT g, 'c' || g FROM generate_series(1, 500) g")
    const [first, second] = await Promise.all([
      run(`SELECT covered_revision FROM claim_grabfood_menu_refresh('${randomUUID()}')`),
      run(`SELECT covered_revision FROM claim_grabfood_menu_refresh('${randomUUID()}')`),
    ])
    // One claim takes every due row; the other waits and then finds them leased.
    expect([first, second].filter((output) => output.trim() !== '').length).toBeGreaterThan(0)
    expect(Number(psql('SELECT count(*) FROM grabfood_menu_refresh WHERE notified_at IS NULL').trim())).toBe(500)
  })
})
