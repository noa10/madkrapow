#!/usr/bin/env node
// HubboPOS historical order importer.
//
// Reads the admin-portal export (Report → Detail → "Order with Items") and
// writes every sale into the canonical order model through the
// import_legacy_order RPC — atomic per order, idempotent on
// channel_orders(channel, external_order_id).
//
// Dry run (default): parse, validate the catalog mapping, print a
// reconciliation report.
//   node scripts/import-hubbo-pos/index.mjs --file export.csv
//
// Apply: writes to the database configured by .env.local
// (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
//   node scripts/import-hubbo-pos/index.mjs --file export.csv --apply
//
// Options: --out report.json, --concurrency 4, --limit N, --since YYYY-MM-DD

import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { parseCsvRecords } from './lib/csv.mjs';
import { buildImportModel } from './lib/build.mjs';
import { centsToRm } from '../import-legacy-pos/lib/money.mjs';

const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const args = {
    apply: false,
    file: null,
    out: null,
    concurrency: 4,
    limit: 0,
    since: null,
    batch: null,
    allowErrors: false,
    allowUnmatchedRefunds: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--file') args.file = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--concurrency') args.concurrency = parseInt(argv[++i], 10);
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (a === '--since') args.since = argv[++i];
    else if (a === '--batch') args.batch = argv[++i];
    else if (a === '--allow-errors') args.allowErrors = true;
    else if (a === '--allow-unmatched-refunds') args.allowUnmatchedRefunds = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function loadEnvLocal() {
  for (const rel of ['../../.env.local', '../../apps/web/.env.local']) {
    // fileURLToPath, not .pathname: the latter returns a percent-encoded POSIX
    // path ("/C:/…"), which resolves to a bogus path on Windows and would skip
    // a real .env.local.
    const path = fileURLToPath(new URL(rel, import.meta.url));
    try {
      const content = readFileSync(path, 'utf8');
      for (const line of content.split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!m) continue;
        const value = m[2].replace(/^["']|["']$/g, '').trim();
        if (!(m[1] in process.env)) process.env[m[1]] = value;
      }
      return path;
    } catch {
      // try the next location
    }
  }
  return null;
}

function printReport(model, { applied = false, imported = 0, skipped = 0, failed = 0 } = {}) {
  const { stats, warnings, errors } = model;
  console.log('=== HubboPOS import reconciliation ===');
  console.log(`rows: ${stats.totalRows} (${stats.orderRows} ORDER, ${stats.itemRows} ITEM)`);
  console.log(
    `importable orders: ${stats.importedOrders}  item lines: ${stats.itemLines}  header-only: ${stats.headerOnlyOrders}`
  );
  console.log(
    `errors: ${stats.errorOrders}  refunds: ${stats.refunds}  unmatched refunds: ${stats.unmatchedRefunds}`
  );
  console.log(`window: ${stats.firstOrderAt} → ${stats.lastOrderAt}`);
  console.log('');
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('CHANNEL', 11)}${pad('ORDERS', 8)}${pad('GROSS', 14)}${pad('DISCOUNT', 12)}${pad('NETT', 14)}${pad('REFUNDS', 9)}REFUND AMT`);
  for (const [channel, s] of Object.entries(stats.perChannel)) {
    console.log(
      `${pad(channel, 11)}${pad(s.orders, 8)}${pad(centsToRm(s.grossCents), 14)}${pad(centsToRm(s.discountCents), 12)}${pad(centsToRm(s.nettCents), 14)}${pad(s.refunds, 9)}${centsToRm(s.refundCents)}`
    );
  }
  console.log(
    `${pad('TOTAL', 11)}${pad(stats.importedOrders, 8)}${pad(centsToRm(stats.totalGrossCents), 14)}${pad(centsToRm(stats.totalDiscountCents), 12)}${pad(centsToRm(stats.totalNettCents), 14)}${pad(stats.refunds, 9)}${centsToRm(
      Object.values(stats.perChannel).reduce((a, s) => a + s.refundCents, 0)
    )}`
  );
  if (applied) {
    console.log(`\napplied: imported=${imported} skipped=${skipped} failed=${failed}`);
  }
  if (errors.length) {
    console.log(`\nERRORS (${errors.length}):`);
    for (const e of errors.slice(0, 30)) console.log(`  ${e.invoice}: ${e.error}`);
    if (errors.length > 30) console.log(`  … and ${errors.length - 30} more`);
  }
  if (warnings.length) {
    console.log(`\nWARNINGS (${warnings.length}):`);
    for (const w of warnings.slice(0, 15)) console.log(`  ${w}`);
    if (warnings.length > 15) console.log(`  … and ${warnings.length - 15} more`);
  }
}

async function pool(items, concurrency, worker) {
  let next = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.file) {
    console.error('Usage: node scripts/import-hubbo-pos/index.mjs --file <export.csv> [--apply] [--out report.json] [--concurrency 4] [--limit N] [--since YYYY-MM-DD] [--allow-errors] [--allow-unmatched-refunds]');
    process.exit(args.help ? 0 : 1);
  }

  const rows = parseCsvRecords(readFileSync(args.file, 'utf8'));
  const model = buildImportModel(rows);

  let orders = model.orders;
  if (args.since) {
    orders = orders.filter((o) => (o.legacy.date ?? '') >= args.since);
  }
  if (args.limit > 0) orders = orders.slice(0, args.limit);

  printReport(model);

  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(
      args.out,
      JSON.stringify(
        {
          stats: model.stats,
          warnings: model.warnings,
          errors: model.errors,
          failedOrders: [],
        },
        null,
        2
      )
    );
    console.log(`\nreport written to ${args.out}`);
  }

  if (!args.apply) {
    console.log('\ndry run only — re-run with --apply to write to the database');
    if (model.errors.length > 0) process.exit(2);
    return;
  }

  // Never write a partial history silently. `printReport` above has already
  // listed every error; without this guard the run would RPC the orders that
  // did build and leave the rest out of the dataset.
  if (model.errors.length > 0 && !args.allowErrors) {
    console.error(
      `\nrefusing to apply: ${model.errors.length} order(s) failed validation (see ERRORS above).\n` +
        'Fix the catalog/export, or re-run with --allow-errors to import the rest anyway.'
    );
    process.exit(2);
  }
  if (model.stats.unmatchedRefunds > 0 && !args.allowUnmatchedRefunds) {
    console.error(
      `\nrefusing to apply: ${model.stats.unmatchedRefunds} refund record(s) could not be paired with an order ` +
        '(revenue would be overstated). Re-run with --allow-unmatched-refunds to import anyway.'
    );
    process.exit(2);
  }

  const envPath = loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(`Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (loaded: ${envPath ?? 'no .env.local'})`);
    process.exit(1);
  }
  console.log(`\ndatabase: ${url}`);

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  });

  let batchId = args.batch;
  if (!batchId) {
    const { data, error } = await supabase
      .from('legacy_import_batches')
      .insert({
        filename: args.file.split('/').pop(),
        source_system: 'hubbopos',
        outlet_name: 'Mad Krapow - Desa Subang Permai',
        record_count: rows.length,
        status: 'pending',
      })
      .select('id')
      .single();
    if (error) {
      console.error('Failed to create import batch:', error.message);
      process.exit(1);
    }
    batchId = data.id;
  }
  console.log(`batch ${batchId}  orders to process: ${orders.length}`);

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];
  const started = Date.now();

  await pool(orders, Math.max(1, args.concurrency), async (o) => {
    const payload = {
      batchId,
      order: o.order,
      items: o.items,
      payment: o.payment,
      channelOrder: o.channelOrder,
      refunds: (o.refunds ?? []).map((r) => ({
        amount_cents: r.amountCents,
        reason: r.reason,
        external_ref: r.systemId || null,
        refunded_at: r.refundedIso ?? r.refundedAtIso,
        raw: r.raw,
        systemId: r.systemId,
        invoice: r.invoice,
      })),
      rawOrder: o.rawOrder,
      rawItems: o.rawItems,
      legacy: o.legacy,
    };

    for (let attempt = 1; attempt <= 3; attempt++) {
      const { data, error } = await supabase.rpc('import_legacy_order', { payload });
      if (!error) {
        if (data?.status === 'skipped') skipped += 1;
        else if (data?.status === 'imported') imported += 1;
        else {
          failed += 1;
          failures.push({ invoice: o.legacy.invoice, error: data?.reason ?? 'unknown RPC response' });
        }
        return;
      }
      const transient = /timeout|fetch|ECONNRESET|503|502|504|429/i.test(error.message ?? '');
      if (!transient || attempt === 3) {
        failed += 1;
        failures.push({ invoice: o.legacy.invoice, error: error.message });
        return;
      }
      await sleep(250 * attempt);
    }
  });

  const summary = {
    ...model.stats,
    imported,
    skipped,
    failed,
    batchId,
    durationSeconds: Math.round((Date.now() - started) / 1000),
    failures: failures.slice(0, 50),
  };

  await supabase
    .from('legacy_import_batches')
    .update({ status: failures.length === 0 ? 'completed' : 'failed', summary })
    .eq('id', batchId);

  if (args.out) {
    writeFileSync(
      args.out,
      JSON.stringify({ stats: model.stats, warnings: model.warnings, errors: model.errors, imported, skipped, failed, failures }, null, 2)
    );
  }

  // Append-only progress log so a long run can be followed from another shell.
  // Kept out of the repo: it is run state, not source.
  const logPath = join(tmpdir(), 'hubbo-import-progress.log');
  appendFileSync(
    logPath,
    `${new Date().toISOString()} batch=${batchId} imported=${imported} skipped=${skipped} failed=${failed}\n`
  );

  console.log(`\napplied: imported=${imported} skipped=${skipped} failed=${failed} in ${summary.durationSeconds}s`);
  if (failures.length) {
    console.error('first failures:');
    for (const f of failures.slice(0, 10)) console.error(`  ${f.invoice}: ${f.error}`);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
