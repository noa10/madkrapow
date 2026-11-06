// Catalog mapping for the HubboPOS export.
//
// The POS menu was renamed once during the exported window (2025-06-11):
//   Beef Krapow Set / Beef Krapow Only / …  → Set Krapow Daging / Krapow Daging Sahaja / …
// so the 2024-11 → 2025-06 names are aliases of the items the canonical catalog
// sells today. Mapping them onto one row keeps per-product analytics continuous
// instead of splitting a dish across two unrelated catalog entries.
//
// Every id below points at a real menu_items row: the 00000004/… series is the
// live canonical catalog, de5a…/de5b… are the inactive legacy rows seeded by
// migrations 050 and 077.

export const MENU = {
  SET_DAGING: '00000004-0000-0000-0000-000000000003',
  SET_AYAM: '00000004-0000-0000-0000-000000000004',
  SET_DAGING_MINUMAN: '00000004-0000-0000-0000-000000000001',
  SET_AYAM_MINUMAN: '00000004-0000-0000-0000-000000000002',
  KRAPOW_DAGING_SAHAJA: '00000004-0000-0000-0000-000000000005',
  KRAPOW_AYAM_SAHAJA: '00000004-0000-0000-0000-000000000006',
  NASI_PUTIH_SIAM: '00000004-0000-0000-0000-000000000007',
  TELUR_GORENG: '00000004-0000-0000-0000-000000000008',
  KICKAPOO: '00000004-0000-0000-0000-000000000009',
  SOYA: '00000004-0000-0000-0000-000000000018',
  ICE_LEMON_TEA: '00000004-0000-0000-0000-000000000019',
  YEOS_YEOGURT: '00000004-0000-0000-0000-000000000023',
  KRAPOW_KENTANG_AYAM: '00000004-0000-0000-0000-000000000028',
  KRAPOW_KENTANG_DAGING: '00000004-0000-0000-0000-000000000027',
  POPIAH_AYAM: '00000004-0000-0000-0000-000000000030',

  // Legacy rows from 050 (inactive).
  POPIAH_DAGING: 'de5a0000-0000-4000-8000-000000000006',
  KENTANG_AYAM_KECIL: 'de5a0000-0000-4000-8000-000000000001',
  KENTANG_DAGING_KECIL: 'de5a0000-0000-4000-8000-000000000002',
  KENTANG_AYAM_BESAR: 'de5a0000-0000-4000-8000-000000000003',
  KENTANG_DAGING_BESAR: 'de5a0000-0000-4000-8000-000000000004',

  // Legacy rows from 077 (inactive).
  BEEF_CHICKEN_SET: 'de5b0000-0000-4000-8000-000000000001',
  CONTAINER_CHARGE: 'de5b0000-0000-4000-8000-000000000002',
  WINTER_MELON: 'de5b0000-0000-4000-8000-000000000003',
  SET_KAMBING: 'de5b0000-0000-4000-8000-000000000004',
  SET_KAMBING_MINUMAN: 'de5b0000-0000-4000-8000-000000000005',
  PES_KRAPOW: 'de5b0000-0000-4000-8000-000000000006',
};

/** Exact names → MENU key. */
const ALIASES = {
  'set krapow daging': 'SET_DAGING',
  'set krapow ayam': 'SET_AYAM',
  'beef krapow set': 'SET_DAGING',
  'chicken krapow set': 'SET_AYAM',
  'set krapow daging dengan minuman': 'SET_DAGING_MINUMAN',
  'set krapow ayam dengan minuman': 'SET_AYAM_MINUMAN',
  'beef krapow set with beverages': 'SET_DAGING_MINUMAN',
  'chicken krapow set with beverages': 'SET_AYAM_MINUMAN',
  'krapow daging sahaja': 'KRAPOW_DAGING_SAHAJA',
  'krapow ayam sahaja': 'KRAPOW_AYAM_SAHAJA',
  'beef krapow only': 'KRAPOW_DAGING_SAHAJA',
  'chicken krapow only': 'KRAPOW_AYAM_SAHAJA',
  'nasi putih siam': 'NASI_PUTIH_SIAM',
  rice: 'NASI_PUTIH_SIAM',
  'telur goreng': 'TELUR_GORENG',
  'fried egg': 'TELUR_GORENG',
  'ice lemon tea (300ml)': 'ICE_LEMON_TEA',
  'yeos yeogurt asli (250ml)': 'YEOS_YEOGURT',
  'soya (300ml)': 'SOYA',
  'kickapoo (320ml)': 'KICKAPOO',
  'krapow kentang ayam': 'KRAPOW_KENTANG_AYAM',
  'krapow kentang daging': 'KRAPOW_KENTANG_DAGING',
  'krapow kentang daging kecil': 'KENTANG_DAGING_KECIL',
  'popiah krapow ayam': 'POPIAH_AYAM',
  'popiah krapow daging': 'POPIAH_DAGING',
  'beef & chicken krapow set': 'BEEF_CHICKEN_SET',
  'container charge': 'CONTAINER_CHARGE',
  'winter melon (300ml)': 'WINTER_MELON',
  'set krapow kambing': 'SET_KAMBING',
  'set krapow kambing dengan minuman': 'SET_KAMBING_MINUMAN',
  'pes krapow': 'PES_KRAPOW',
};

const PROTEIN = {
  daging: { base: 'DAGING', kentang: { plain: 'KRAPOW_KENTANG_DAGING', kecil: 'KENTANG_DAGING_KECIL', besar: 'KENTANG_DAGING_BESAR' }, set: 'SET_DAGING', popiah: 'POPIAH_DAGING' },
  ayam: { base: 'AYAM', kentang: { plain: 'KRAPOW_KENTANG_AYAM', kecil: 'KENTANG_AYAM_KECIL', besar: 'KENTANG_AYAM_BESAR' }, set: 'SET_AYAM', popiah: 'POPIAH_AYAM' },
};

function proteinIn(text) {
  const t = (text ?? '').toLowerCase();
  if (t.includes('daging') || t.includes('beef')) return 'daging';
  if (t.includes('ayam') || t.includes('chicken')) return 'ayam';
  return null;
}

function sizeIn(text) {
  const t = (text ?? '').toLowerCase();
  if (t.includes('besar')) return 'besar';
  if (t.includes('kecil')) return 'kecil';
  return null;
}

/**
 * Resolve one exported ITEM line's name + qualifier onto a catalog key.
 *
 * Qualifier tokens carry modifiers (spice, basil, packaging) as well as the
 * protein/size selectors, so both are searched — "Krapow Kentang Daging | 10 |
 * Besar" and "Krapow Kentang (Kecil) | 5 | Daging" are the same two axes in a
 * different order.
 *
 * @param {string} rawName
 * @param {string} qualifier
 * @returns {{ key: string|null, note: string|null }}
 */
export function resolveMenuKey(rawName, qualifier) {
  const name = (rawName ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

  // 1. Size selector on a protein-named dish ("Krapow Kentang Daging" + Besar).
  if (/^krapow kentang (daging|ayam)$/.test(name)) {
    const protein = proteinIn(name);
    const size = sizeIn(qualifier);
    const key = size ? PROTEIN[protein].kentang[size] : PROTEIN[protein].kentang.plain;
    return { key, note: size ? `Size: ${size === 'besar' ? 'Besar' : 'Kecil'}` : null };
  }

  // 2. Protein selector on a size-named dish ("Krapow Kentang (Kecil)" + Daging).
  const sizeNamed = /^krapow kentang \((kecil|besar)\)$/.exec(name);
  if (sizeNamed) {
    const protein = proteinIn(qualifier) ?? 'daging';
    const size = sizeNamed[1];
    return {
      key: PROTEIN[protein].kentang[size],
      note: `Size: ${size === 'besar' ? 'Besar' : 'Kecil'}`,
      // Two counter rows (2026-02) recorded the size without the protein; the
      // price matches the beef variant, which is the house default.
      warning: proteinIn(qualifier)
        ? null
        : `${rawName}: protein not recorded on the row — defaulted to daging`,
    };
  }

  // 3. Bare "Krapow Kentang" — no selector in the row at all.
  if (name === 'krapow kentang') {
    return { key: 'KRAPOW_KENTANG_DAGING', note: null };
  }

  // 4. Bare "Set Krapow" / "Popiah Krapow" with the protein in the qualifier.
  if (name === 'set krapow' || name === 'popiah krapow') {
    const protein = proteinIn(qualifier);
    if (!protein) return { key: null, note: null };
    return {
      key: name === 'set krapow' ? PROTEIN[protein].set : PROTEIN[protein].popiah,
      note: null,
    };
  }

  // 5. Exact alias.
  const alias = ALIASES[name];
  if (alias) return { key: alias, note: null };

  return { key: null, note: null };
}
