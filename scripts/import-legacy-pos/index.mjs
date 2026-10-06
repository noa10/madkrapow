#!/usr/bin/env node
// Legacy Aliments POS export importer.
//
// Dry run (default): parse + validate + print a reconciliation report.
//   node scripts/import-legacy-pos/index.mjs --file /path/to/export.json
//
// Apply: writes to the database configured by .env.local
// (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) via the
// import_legacy_order RPC (atomic + idempotent per order).
//   node scripts/import-legacy-pos/index.mjs --file /path/to/export.json --apply
//
// Optional: --out report.json writes the full reconciliation report.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { buildImportModel } from './lib/build.mjs';
import { centsToRm } from './lib/money.mjs';

const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const args = { apply: false, file: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') args.apply = true;
    else if (argv[i] === '--file') args.file = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

function loadEnvLocal() {
  // Minimal .env.local reader (KEY=VALUE lines) — avoids a dotenv dependency.
  const path = new URL('../../.env.local', import.meta.url).pathname;
  try {
    const content = readFileSync(path, 'utf8');
    for (const line of content.split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, '');
      if (!(m[1] in process.env)) process.env[m[1]] = value;
    }
  } catch {
    // no .env.local — fall back to the process environment
  }
}

function printReport(model, { applied = false, skipped = 0 } = {}) {
  const { stats, warnings, errors } = model;
  console.log('=== Legacy POS import reconciliation ===');
  console.log(`rows: ${stats.totalRows} (${stats.orderRows} ORDER, ${stats.itemRows} ITEM)`);
  console.log(`importable orders: ${stats.importedOrders}  errors: ${stats.errorOrders}  refunds: ${stats.refunds}`);
  if (applied) console.log(`applied: ${stats.importedOrders - skipped}, skipped (already imported): ${skipped}`);
  console.log('');
  for (const [channel, s] of Object.entries(stats.perChannel)) {
    console.log(
      `${channel.padEnd(10)} orders=${String(s.orders).padStart(4)}  gross=${centsToRm(s.grossCents).padStart(12)}  discount=${centsToRm(s.discountCents).padStart(10)}  nett=${centsToRm(s.nettCents).padStart(12)}`
    );
  }
  console.log(
    `${'TOTAL'.padEnd(10)} orders=${String(stats.importedOrders).padStart(4)}  gross=${centsToRm(stats.totalGrossCents).padStart(12)}  discount=${centsToRm(stats.totalDiscountCents).padStart(10)}  nett=${centsToRm(stats.totalNettCents).padStart(12)}`
  );
  console.log(`${'REFUNDS'.padEnd(10)} count=${String(stats.refunds).padStart(4)}  amount=${centsToRm(stats.refundCents).padStart(12)}`);
  if (errors.length) {
    console.log(`\nERRORS (${errors.length}):`);
    for (const e of errors) console.log(`  ${e.invoice}: ${e.error}`);
  }
  if (warnings.length) {
    console.log(`\nWARNINGS (${warnings.length}):`);
    for (const w of warnings.slice(0, 20)) console.log(`  ${w}`);
    if (warnings.length > 20) console.log(`  … and ${warnings.length - 20} more`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.file) {
    console.error('Usage: node scripts/import-legacy-pos/index.mjs --file <export.json> [--apply] [--out report.json]');
    process.exit(args.help ? 0 : 1);
  }

  const rows = JSON.parse(readFileSync(args.file, 'utf8'));
  const model = buildImportModel(rows);
  printReport(model);

  if (args.out) {
    writeFileSync(
      args.out,
      JSON.stringify({ stats: model.stats, warnings: model.warnings, errors: model.errors }, null, 2)
    );
    console.log(`\nreport written to ${args.out}`);
  }

  if (!args.apply) {
    console.log('\ndry run only — re-run with --apply to write to the database');
    if (model.errors.length > 0) process.exit(2);
    return;
  }

  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (set in .env.local)');
    process.exit(1);
  }
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1. Batch row for auditability.
  const { data: batch, error: batchError } = await supabase
    .from('legacy_import_batches')
    .insert({
      filename: args.file.split('/').pop(),
      source_system: 'aliments_pos',
      outlet_name: model.orders[0]?.legacy.outlet ?? null,
      record_count: rows.length,
      status: 'pending',
    })
    .select('id')
    .single();
  if (batchError) {
    console.error('Failed to create import batch:', batchError.message);
    process.exit(1);
  }
  console.log(`\nbatch ${batch.id}`);

  // 2. Per-order atomic import via RPC (idempotent).
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  for (const o of model.orders) {
    const payload = {
      batchId: batch.id,
      order: o.order,
      items: o.items,
      payment: o.payment,
      channelOrder: o.channelOrder,
      refunds: (o.refunds ?? []).map((r) => ({
        amount_cents: r.amountCents,
        reason: r.reason,
        external_ref: r.systemId || null,
        refunded_at: r.refundedAtIso,
        raw: r.raw,
        systemId: r.systemId,
        invoice: r.invoice,
      })),
      rawOrder: o.rawOrder,
      rawItems: o.rawItems,
      legacy: o.legacy,
    };
    const { data, error } = await supabase.rpc('import_legacy_order', { payload });
    if (error) {
      failed += 1;
      console.error(`  FAIL ${o.legacy.invoice}: ${error.message}`);
      continue;
    }
    if (data?.status === 'skipped') skipped += 1;
    else if (data?.status === 'imported') imported += 1;
    else {
      failed += 1;
      console.error(`  FAIL ${o.legacy.invoice}: ${data?.reason ?? 'unknown RPC response'}`);
    }
  }

  // 3. Close the batch.
  const summary = { ...model.stats, imported, skipped, failed };
  await supabase
    .from('legacy_import_batches')
    .update({
      status: failed === 0 ? 'completed' : 'failed',
      summary,
    })
    .eq('id', batch.id);

  console.log(`\napplied=${imported} skipped=${skipped} failed=${failed}`);
  if (failed > 0) {
    console.error('Re-run with --apply to resume (import is idempotent).');
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
