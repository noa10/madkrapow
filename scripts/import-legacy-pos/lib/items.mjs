// Parser for legacy Aliments POS ITEM rows.
//
// The export encodes each line as: "<qty>x <name> | <line total RM> | <qualifier>"
// — field 2 is the LINE total (qty × unit), not the unit price. The qualifier
// is optional and may carry protein (Ayam/Daging), size (Kecil/Besar), or a
// comma-joined modifier list (spice, portion, basil choice, packaging, drink).
//
// Three naming conventions coexist in the export:
//   1. "Krapow Kentang (Kecil)" + qualifier "Ayam"   (size in name, protein in qualifier)
//   2. "Krapow Kentang Daging"  + qualifier "Kecil"  (protein in name, size in qualifier)
//   3. "Krapow Kentang Daging Kecil"                 (both in name; GrabFood style)
// Plus bare names ("Set Krapow" + qualifier "Daging") and fixed-name items
// ("Nasi Putih Siam", drinks). resolveCatalogKey() canonicalizes all of them.

import { parseMoneyToCents } from './money.mjs';
import { LEGACY_CATALOG } from './catalog.mjs';

const PROTEINS = ['daging', 'ayam'];
const SIZES = ['kecil', 'besar'];

function proteinFrom(text) {
  const t = (text ?? '').toLowerCase();
  if (t.includes('daging')) return 'daging';
  if (t.includes('ayam')) return 'ayam';
  return null;
}

function sizeFrom(text) {
  const t = (text ?? '').toLowerCase();
  if (t.includes('besar')) return 'besar';
  if (t.includes('kecil')) return 'kecil';
  return null;
}

/**
 * Split a parsed item into (catalogKey, leftover modifier tokens for notes).
 * @returns {{ catalogKey: string|null, modifierTokens: string[] }}
 */
export function resolveCatalogKey(rawName, qualifier) {
  const name = (rawName ?? '').trim();
  const qTokens = (qualifier ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const qFirst = qTokens[0] ?? '';

  // 1. Set with drink: protein always in the name.
  if (/^Set Krapow .*dengan Minuman$/i.test(name)) {
    const protein = proteinFrom(name);
    return {
      catalogKey: protein ? `set-krapow-${protein}-minuman` : null,
      modifierTokens: qTokens,
    };
  }

  // 2. Combined name ("Krapow Kentang Daging Kecil").
  if (/^Krapow Kentang (Daging|Ayam) (Kecil|Besar)$/i.test(name)) {
    const protein = proteinFrom(name);
    const size = sizeFrom(name);
    return {
      catalogKey: protein && size ? `krapow-kentang-${protein}-${size}` : null,
      modifierTokens: qTokens,
    };
  }

  // 3. Size in name ("Krapow Kentang (Kecil)") + protein in qualifier.
  const sizeInName = /^Krapow Kentang \((Kecil|Besar)\)$/i.exec(name);
  if (sizeInName) {
    const protein = proteinFrom(qFirst);
    return {
      catalogKey: protein
        ? `krapow-kentang-${protein}-${sizeInName[1].toLowerCase()}`
        : null,
      modifierTokens: qTokens,
    };
  }

  // 4. Protein in name ("Krapow Kentang Daging") + size in qualifier.
  if (/^Krapow Kentang (Daging|Ayam)$/i.test(name)) {
    const protein = proteinFrom(name);
    const size = sizeFrom(qFirst) ?? sizeFrom(name) ?? 'kecil';
    return {
      catalogKey: `krapow-kentang-${protein}-${size}`,
      modifierTokens: qTokens,
    };
  }

  // 5. Popiah: protein in qualifier ("Popiah Krapow") or name ("Popiah Krapow Ayam").
  if (/^Popiah Krapow( (Daging|Ayam))?$/i.test(name)) {
    const protein = proteinFrom(name) ?? proteinFrom(qFirst);
    return {
      catalogKey: protein ? `popiah-krapow-${protein}` : null,
      modifierTokens: qTokens,
    };
  }

  // 6. Set Krapow: protein in qualifier ("Set Krapow" + "Daging") or name.
  if (/^Set Krapow( (Daging|Ayam))?$/i.test(name)) {
    const protein = proteinFrom(name) ?? proteinFrom(qFirst);
    return {
      catalogKey: protein ? `set-krapow-${protein}` : null,
      modifierTokens: qTokens,
    };
  }

  // 7. Krapow ... Sahaja: protein in name.
  if (/^Krapow (Daging|Ayam) Sahaja$/i.test(name)) {
    const protein = proteinFrom(name);
    return {
      catalogKey: protein ? `krapow-${protein}-sahaja` : null,
      modifierTokens: qTokens,
    };
  }

  // 8. Fixed-name items.
  const fixed = {
    'nasi putih siam': 'nasi-putih-siam',
    'telur goreng': 'telur-goreng',
    'kickapoo (320ml)': 'kickapoo-320ml',
    'soya (300ml)': 'soya-300ml',
    'ice lemon tea (300ml)': 'ice-lemon-tea-300ml',
  };
  const key = fixed[name.toLowerCase()];
  if (key) return { catalogKey: key, modifierTokens: qTokens };

  return { catalogKey: null, modifierTokens: qTokens };
}

/**
 * Classify leftover qualifier tokens into a notes string.
 * Consumed tokens (protein/size used for mapping) should not be passed in.
 */
export function qualifierTokensToNotes(tokens) {
  const notes = [];
  for (const token of tokens) {
    const t = token.trim();
    if (!t) continue;
    const lower = t.toLowerCase();
    if (lower === 'ayam' || lower === 'daging' || lower === 'kecil' || lower === 'besar') {
      continue; // protein/size already encoded in the catalog key
    }
    if (/^(tak pedas|biasa|pedas|extra pedas)/i.test(t)) {
      notes.push(`Spice: ${t}`);
      continue;
    }
    if (/^\d+g\b/i.test(t)) {
      notes.push(`Portion: ${t.replace(/\s*-\s*default$/i, '')}`);
      continue;
    }
    if (/basil/i.test(t)) {
      notes.push(`Basil: ${t.replace(/\s*-\s*default$/i, '')}`);
      continue;
    }
    if (/^bekas makanan/i.test(t)) {
      notes.push(`Packaging: ${t}`);
      continue;
    }
    if (/^(kickapoo|soya|ice lemon tea)/i.test(t)) {
      notes.push(`Add-on: ${t}`);
      continue;
    }
    notes.push(t);
  }
  return notes.join(' | ');
}

/**
 * Parse one legacy ITEM row's "Items" string.
 * @param {string} raw e.g. "2x Krapow Kentang (Kecil) | 10 | Ayam"
 * @returns {{
 *   quantity: number, rawName: string, lineTotalCents: number, unitPriceCents: number,
 *   qualifier: string, catalogKey: string|null, catalogItemId: string|null,
 *   displayName: string, notes: string, mappingError: string|null
 * }}
 */
export function parseItemString(raw) {
  const parts = String(raw).split('|').map((s) => s.trim());
  const qtyMatch = /^(\d+)x\s*(.+)$/i.exec(parts[0] ?? '');
  if (!qtyMatch) {
    throw new Error(`Unparseable item line: ${JSON.stringify(raw)}`);
  }
  const quantity = parseInt(qtyMatch[1], 10);
  const rawName = qtyMatch[2].trim();
  const lineTotalCents = parseMoneyToCents(parts[1] ?? '0', { allowSubsen: true });
  const qualifier = parts.slice(2).join(' | ');

  if (quantity < 1) {
    throw new Error(`Invalid quantity in item line: ${JSON.stringify(raw)}`);
  }
  if (lineTotalCents % quantity !== 0) {
    throw new Error(
      `Line total ${lineTotalCents}sen not divisible by qty ${quantity}: ${JSON.stringify(raw)}`
    );
  }
  const unitPriceCents = lineTotalCents / quantity;

  const { catalogKey, modifierTokens } = resolveCatalogKey(rawName, qualifier);
  const catalogItem = catalogKey ? LEGACY_CATALOG[catalogKey] : null;
  const mappingError = catalogKey
    ? null
    : `Unmapped legacy item: ${JSON.stringify(rawName)}`;

  // Notes carry modifier detail; consumed protein/size tokens are dropped.
  const consumed =
    catalogKey &&
    (catalogKey.startsWith('krapow-kentang-') ||
      catalogKey.startsWith('popiah-krapow-') ||
      catalogKey.startsWith('set-krapow-') ||
      catalogKey.startsWith('krapow-'));
  const leftover = consumed
    ? modifierTokens.filter((t) => {
        const l = t.toLowerCase();
        return !(l === 'ayam' || l === 'daging' || l === 'kecil' || l === 'besar');
      })
    : modifierTokens;
  const notes = qualifierTokensToNotes(leftover);

  return {
    quantity,
    rawName,
    lineTotalCents,
    unitPriceCents,
    qualifier,
    catalogKey,
    catalogItemId: catalogItem ? catalogItem.id : null,
    displayName: catalogItem ? catalogItem.name : rawName,
    notes,
    mappingError,
  };
}
