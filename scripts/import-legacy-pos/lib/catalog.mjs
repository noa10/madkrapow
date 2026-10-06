// Legacy catalog mapping: canonical catalog keys -> menu_items rows created by
// migration 050 (fixed UUID prefix de5a = "Desa Subang"). Base prices are
// representative legacy COUNTER prices in sen; the importer snapshots the real
// per-line prices from the export, so platform markups stay truthful.

export const LEGACY_CATEGORY_ID = 'de5a0000-0000-4000-8000-000000000000';

export const LEGACY_CATALOG = {
  'krapow-kentang-ayam-kecil': {
    id: 'de5a0000-0000-4000-8000-000000000001',
    name: 'Krapow Kentang Ayam Kecil',
    basePriceCents: 500,
  },
  'krapow-kentang-daging-kecil': {
    id: 'de5a0000-0000-4000-8000-000000000002',
    name: 'Krapow Kentang Daging Kecil',
    basePriceCents: 500,
  },
  'krapow-kentang-ayam-besar': {
    id: 'de5a0000-0000-4000-8000-000000000003',
    name: 'Krapow Kentang Ayam Besar',
    basePriceCents: 1000,
  },
  'krapow-kentang-daging-besar': {
    id: 'de5a0000-0000-4000-8000-000000000004',
    name: 'Krapow Kentang Daging Besar',
    basePriceCents: 1000,
  },
  'popiah-krapow-ayam': {
    id: 'de5a0000-0000-4000-8000-000000000005',
    name: 'Popiah Krapow Ayam',
    basePriceCents: 400,
  },
  'popiah-krapow-daging': {
    id: 'de5a0000-0000-4000-8000-000000000006',
    name: 'Popiah Krapow Daging',
    basePriceCents: 400,
  },
  'set-krapow-ayam': {
    id: 'de5a0000-0000-4000-8000-000000000007',
    name: 'Set Krapow Ayam',
    basePriceCents: 1000,
  },
  'set-krapow-daging': {
    id: 'de5a0000-0000-4000-8000-000000000008',
    name: 'Set Krapow Daging',
    basePriceCents: 1000,
  },
  'set-krapow-ayam-minuman': {
    id: 'de5a0000-0000-4000-8000-000000000009',
    name: 'Set Krapow Ayam dengan Minuman',
    basePriceCents: 1250,
  },
  'set-krapow-daging-minuman': {
    id: 'de5a0000-0000-4000-8000-00000000000a',
    name: 'Set Krapow Daging dengan Minuman',
    basePriceCents: 1250,
  },
  'krapow-ayam-sahaja': {
    id: 'de5a0000-0000-4000-8000-00000000000b',
    name: 'Krapow Ayam Sahaja',
    basePriceCents: 850,
  },
  'krapow-daging-sahaja': {
    id: 'de5a0000-0000-4000-8000-00000000000c',
    name: 'Krapow Daging Sahaja',
    basePriceCents: 850,
  },
  'nasi-putih-siam': {
    id: 'de5a0000-0000-4000-8000-00000000000d',
    name: 'Nasi Putih Siam',
    basePriceCents: 200,
  },
  'telur-goreng': {
    id: 'de5a0000-0000-4000-8000-00000000000e',
    name: 'Telur Goreng',
    basePriceCents: 200,
  },
  'kickapoo-320ml': {
    id: 'de5a0000-0000-4000-8000-00000000000f',
    name: 'Kickapoo (320ml)',
    basePriceCents: 250,
  },
  'soya-300ml': {
    id: 'de5a0000-0000-4000-8000-000000000010',
    name: 'Soya (300ml)',
    basePriceCents: 250,
  },
  'ice-lemon-tea-300ml': {
    id: 'de5a0000-0000-4000-8000-000000000011',
    name: 'Ice Lemon Tea (300ml)',
    basePriceCents: 250,
  },
};
