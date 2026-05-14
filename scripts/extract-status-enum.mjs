// Extract the latest `orders.status` allowed values from supabase migrations.
// Pure-Node ESM, zero deps. Used by scripts/check-order-status-parity.mjs and tests.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..');

/**
 * Parse a single SQL file and return every `status IN ('a','b',...)` set
 * that appears inside an ALTER ... orders_status_check ... CHECK clause.
 * Returns an array of arrays (in order of appearance).
 */
export function extractStatusSetsFromSql(sql) {
  const sets = [];
  // Match: orders_status_check CHECK (status IN ('a','b',...))
  // Tolerant to whitespace and newlines.
  const re =
    /orders_status_check\s*CHECK\s*\(\s*status\s+IN\s*\(([^)]+)\)\s*\)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const inner = m[1];
    const matches = inner.match(/'([^']+)'/g);
    if (!matches) continue;
    sets.push(matches.map((q) => q.slice(1, -1)));
  }

  // Also handle the original `CREATE TABLE ... status TEXT ... CHECK (status IN (...))`
  const createRe =
    /status\s+TEXT[^,]*?CHECK\s*\(\s*status\s+IN\s*\(([^)]+)\)\s*\)/i;
  const createMatch = sql.match(createRe);
  if (createMatch) {
    const matches = createMatch[1].match(/'([^']+)'/g);
    if (matches) sets.unshift(matches.map((q) => q.slice(1, -1)));
  }

  return sets;
}

/**
 * Walk a migrations directory in lexical order and return the LATEST set of
 * allowed status values. The latest set is the last `orders_status_check`
 * CHECK constraint encountered (or the original CREATE TABLE constraint if
 * no later ALTER exists).
 */
export function extractLatestStatusEnum(migrationsDir) {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // lexical order is the migration order in this repo

  let latest = null;
  for (const f of files) {
    const sql = readFileSync(join(migrationsDir, f), 'utf8');
    const sets = extractStatusSetsFromSql(sql);
    if (sets.length > 0) {
      // last set in this file wins
      latest = sets[sets.length - 1];
    }
  }

  if (!latest) {
    throw new Error(
      `No orders_status_check CHECK constraint found in ${migrationsDir}. The migrations directory may be malformed.`
    );
  }

  return latest;
}

// CLI: print the latest enum when invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? join(REPO_ROOT, 'supabase', 'migrations');
  const enumValues = extractLatestStatusEnum(dir);
  console.log(JSON.stringify(enumValues, null, 2));
}
