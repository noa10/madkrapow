// CI parity guard for order-status across SQL, JSON spec, web TS module, and
// Dart generated module. Pure-Node ESM, zero deps. Run via `npm run lint:parity`.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractLatestStatusEnum,
  REPO_ROOT,
} from './extract-status-enum.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PATHS = {
  json: join(REPO_ROOT, 'packages/madkrapow_orders/order_status.json'),
  webTs: join(REPO_ROOT, 'apps/web/src/lib/orders/status.ts'),
  dartGen: join(REPO_ROOT, 'packages/madkrapow_orders/lib/order_status.g.dart'),
  migrations: join(REPO_ROOT, 'supabase/migrations'),
};

function fail(msg) {
  console.error(`\n[order-status-parity] FAIL: ${msg}\n`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[order-status-parity] OK: ${msg}`);
}

function loadJson() {
  if (!existsSync(PATHS.json)) {
    fail(`missing JSON spec: ${PATHS.json}`);
  }
  return JSON.parse(readFileSync(PATHS.json, 'utf8'));
}

function loadSqlEnum() {
  return extractLatestStatusEnum(PATHS.migrations);
}

function loadWebTsEnum() {
  if (!existsSync(PATHS.webTs)) {
    fail(`missing web TS module: ${PATHS.webTs}`);
  }
  const src = readFileSync(PATHS.webTs, 'utf8');
  // Look for: export const ORDER_STATUSES = ['pending','paid',...] as const;
  const m = src.match(
    /export\s+const\s+ORDER_STATUSES\s*=\s*\[([^\]]+)\]\s*as\s+const/
  );
  if (!m) {
    fail(
      'apps/web/src/lib/orders/status.ts must export `ORDER_STATUSES` as a const tuple of literal strings'
    );
  }
  const matches = m[1].match(/'([^']+)'/g);
  if (!matches) fail('ORDER_STATUSES tuple is empty');
  return matches.map((q) => q.slice(1, -1));
}

function loadDartGenEnum() {
  if (!existsSync(PATHS.dartGen)) {
    fail(
      `missing Dart generated module: ${PATHS.dartGen} (run \`dart run packages/madkrapow_orders/tool/generate.dart\`)`
    );
  }
  const src = readFileSync(PATHS.dartGen, 'utf8');
  // Look for: const List<String> kOrderStatusValues = ['pending','paid',...];
  const m = src.match(
    /const\s+List<String>\s+kOrderStatusValues\s*=\s*\[([^\]]+)\]/
  );
  if (!m) {
    fail(
      'packages/madkrapow_orders/lib/order_status.g.dart must declare `const List<String> kOrderStatusValues = [...]`'
    );
  }
  const matches = m[1].match(/'([^']+)'/g);
  if (!matches) fail('kOrderStatusValues is empty');
  return matches.map((q) => q.slice(1, -1));
}

function arraysEqualOrdered(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function expect(label, actual, expected) {
  if (!arraysEqualOrdered(actual, expected)) {
    console.error(`  ${label}:    [${actual.join(', ')}]`);
    console.error(`  expected: [${expected.join(', ')}]`);
    return false;
  }
  ok(`${label} matches`);
  return true;
}

const json = loadJson();
const sql = loadSqlEnum();
const webTs = loadWebTsEnum();
const dartGen = loadDartGenEnum();

const expected = json.statuses;
let allOk = true;
console.log(`\n[order-status-parity] expected canonical: [${expected.join(', ')}]\n`);
allOk = expect('SQL (latest migration)', sql, expected) && allOk;
allOk = expect('Web TS (ORDER_STATUSES)', webTs, expected) && allOk;
allOk = expect('Dart gen (kOrderStatusValues)', dartGen, expected) && allOk;

// Cross-check JSON internal consistency
if (!json.flowSteps.every((s) => json.statuses.includes(s))) {
  console.error('  JSON.flowSteps contains a status not in JSON.statuses');
  allOk = false;
}
if (!json.terminal.every((s) => json.statuses.includes(s))) {
  console.error('  JSON.terminal contains a status not in JSON.statuses');
  allOk = false;
}
if (!json.cancellable.every((s) => json.statuses.includes(s))) {
  console.error('  JSON.cancellable contains a status not in JSON.statuses');
  allOk = false;
}
const cancellableSorted = [...json.cancellable].sort().join(',');
const cancellableFromTransitions = json.statuses
  .filter((s) => (json.forwardTransitions[s] ?? []).includes('cancelled'))
  .sort()
  .join(',');
if (cancellableSorted !== cancellableFromTransitions) {
  console.error(
    `  JSON.cancellable mismatch: declared [${cancellableSorted}] vs derived [${cancellableFromTransitions}]`
  );
  allOk = false;
}

if (!allOk) {
  fail('order-status drift detected. Update the source(s) above to match the JSON spec.');
}
console.log('\n[order-status-parity] all sources agree.');
