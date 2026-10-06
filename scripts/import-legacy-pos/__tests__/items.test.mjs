import { describe, it, expect } from 'vitest';
import {
  parseItemString,
  resolveCatalogKey,
  qualifierTokensToNotes,
} from '../lib/items.mjs';

describe('parseItemString', () => {
  // Real rows from the 2026-03 → 2026-05 export.
  it.each([
    [
      '2x Krapow Kentang (Kecil) | 10 | Ayam',
      {
        quantity: 2,
        rawName: 'Krapow Kentang (Kecil)',
        lineTotalCents: 1000,
        unitPriceCents: 500,
        catalogKey: 'krapow-kentang-ayam-kecil',
      },
    ],
    [
      '1x Krapow Kentang Daging | 5 | Kecil',
      {
        quantity: 1,
        catalogKey: 'krapow-kentang-daging-kecil',
        lineTotalCents: 500,
        unitPriceCents: 500,
      },
    ],
    [
      '1x Krapow Kentang Daging | 13 | Besar',
      {
        catalogKey: 'krapow-kentang-daging-besar',
        unitPriceCents: 1300,
      },
    ],
    [
      '1x Krapow Kentang Daging Kecil | 7',
      {
        catalogKey: 'krapow-kentang-daging-kecil',
        unitPriceCents: 700,
      },
    ],
    [
      '1x Set Krapow Daging | 13',
      { catalogKey: 'set-krapow-daging', unitPriceCents: 1300 },
    ],
    [
      '1x Set Krapow | 10 | Daging',
      { catalogKey: 'set-krapow-daging', unitPriceCents: 1000 },
    ],
    [
      '1x Set Krapow | 13 | Ayam',
      { catalogKey: 'set-krapow-ayam', unitPriceCents: 1300 },
    ],
    [
      '5x Popiah Krapow | 20 | Ayam',
      { quantity: 5, catalogKey: 'popiah-krapow-ayam', unitPriceCents: 400, lineTotalCents: 2000 },
    ],
    [
      '1x Popiah Krapow Daging | 5.6',
      { catalogKey: 'popiah-krapow-daging', unitPriceCents: 560 },
    ],
    [
      '1x Krapow Daging Sahaja | 8.5 | Biasa 🌶️,135g - Default,Holy Basil Thai (Krapow) - Default',
      { catalogKey: 'krapow-daging-sahaja', unitPriceCents: 850 },
    ],
    [
      '1x Set Krapow Daging dengan Minuman | 30.6 | Pedas 🌶️🌶️, 270g, Tiada Basil, Bekas Makanan (Photodegradable), Soya (300ml)',
      { catalogKey: 'set-krapow-daging-minuman', unitPriceCents: 3060 },
    ],
    [
      '1x Nasi Putih Siam | 2.7',
      { catalogKey: 'nasi-putih-siam', unitPriceCents: 270 },
    ],
    [
      '1x Telur Goreng | 2',
      { catalogKey: 'telur-goreng', unitPriceCents: 200 },
    ],
    [
      '1x Kickapoo (320ml) | 3.3',
      { catalogKey: 'kickapoo-320ml', unitPriceCents: 330 },
    ],
    [
      '1x Ice Lemon Tea (300ml) | 3',
      { catalogKey: 'ice-lemon-tea-300ml', unitPriceCents: 300 },
    ],
    [
      '1x Soya (300ml) | 3',
      { catalogKey: 'soya-300ml', unitPriceCents: 300 },
    ],
  ])('parses %j', (raw, expected) => {
    const parsed = parseItemString(raw);
    expect(parsed).toMatchObject(expected);
    expect(parsed.catalogItemId).toBeTruthy();
    expect(parsed.mappingError).toBeNull();
  });

  it('snapshots the legacy (platform-marked-up) unit price, not the catalog base price', () => {
    const parsed = parseItemString('1x Set Krapow Daging | 13');
    expect(parsed.unitPriceCents).toBe(1300); // catalog base is 1000
  });

  it('extracts modifier details into notes', () => {
    const parsed = parseItemString(
      '1x Set Krapow Daging dengan Minuman | 30.6 | Pedas 🌶️🌶️, 270g, Tiada Basil, Bekas Makanan (Photodegradable), Soya (300ml)'
    );
    expect(parsed.notes).toBe(
      'Spice: Pedas 🌶️🌶️ | Portion: 270g | Basil: Tiada Basil | Packaging: Bekas Makanan (Photodegradable) | Add-on: Soya (300ml)'
    );
  });

  it('drops consumed protein/size tokens from notes', () => {
    const parsed = parseItemString('2x Krapow Kentang (Kecil) | 10 | Ayam');
    expect(parsed.notes).toBe('');
  });

  it('flags unmapped names instead of guessing', () => {
    const parsed = parseItemString('1x Mystery Rendang | 10');
    expect(parsed.catalogItemId).toBeNull();
    expect(parsed.mappingError).toMatch(/Unmapped legacy item/);
  });

  it('rejects line totals not divisible by quantity', () => {
    expect(() => parseItemString('3x Nasi Putih Siam | 5')).toThrow(
      /not divisible by qty/
    );
  });

  it('rejects malformed lines', () => {
    expect(() => parseItemString('Krapow Kentang | 5')).toThrow(/Unparseable item line/);
    expect(() => parseItemString('0x Popiah Krapow | 0 | Ayam')).toThrow(/Invalid quantity/);
  });
});

describe('resolveCatalogKey edge cases', () => {
  it('returns null key for unknown names', () => {
    expect(resolveCatalogKey('Roti Benggali', '').catalogKey).toBeNull();
  });

  it('requires a protein for size-in-name format', () => {
    expect(resolveCatalogKey('Krapow Kentang (Kecil)', '').catalogKey).toBeNull();
  });
});

describe('qualifierTokensToNotes', () => {
  it('routes known token families to labelled notes', () => {
    expect(
      qualifierTokensToNotes([
        'Extra Pedas 🌶️🌶️',
        '135g - Default',
        'Holy Basil Thai (Krapow) - Default',
        'Bekas Makanan (Plastik)',
        'Kickapoo (320ml)',
      ]),
    ).toBe(
      'Spice: Extra Pedas 🌶️🌶️ | Portion: 135g | Basil: Holy Basil Thai (Krapow) | Packaging: Bekas Makanan (Plastik) | Add-on: Kickapoo (320ml)'
    );
  });

  it('keeps unknown tokens verbatim', () => {
    expect(qualifierTokensToNotes([' voucher applied'])).toBe('voucher applied');
  });
});
