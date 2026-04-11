import { describe, it, expect } from 'vitest';
import { mapHubboPosCategoryToLocal, mapHubboPosMenuItemToLocal, mapHubboPosModifierGroupToLocal, mapHubboPosModifierToLocal } from '../mappers';

describe('mapHubboPosCategoryToLocal', () => {
  it('maps all fields correctly', () => {
    const hpCategory = {
      id: 'hp-cat-1',
      name: 'Beverages',
      description: 'Hot and cold drinks',
      sort_order: 2,
      is_active: true,
    };
    const syncedAt = '2026-03-31T10:00:00.000Z';

    const result = mapHubboPosCategoryToLocal(hpCategory, syncedAt);

    expect(result).toEqual({
      name: 'Beverages',
      description: 'Hot and cold drinks',
      sort_order: 2,
      is_active: true,
      hubbo_pos_external_id: 'hp-cat-1',
      hubbo_pos_last_synced_at: syncedAt,
      hubbo_pos_source: 'hubbopos',
    });
  });

  it('defaults missing optional fields', () => {
    const hpCategory = { id: 'hp-cat-2', name: 'Sides' };
    const syncedAt = '2026-03-31T10:00:00.000Z';

    const result = mapHubboPosCategoryToLocal(hpCategory, syncedAt);

    expect(result.description).toBeNull();
    expect(result.sort_order).toBe(0);
    expect(result.is_active).toBe(true);
  });

  it('converts price from decimal to cents', () => {
    const hpItem = {
      id: 'hp-item-1',
      name: 'Nasi Lemak',
      price: 12.50,
      category_id: 'cat-1',
    };
    const syncedAt = '2026-03-31T10:00:00.000Z';

    const result = mapHubboPosMenuItemToLocal(hpItem, 'cat-1', syncedAt);

    expect(result.price_cents).toBe(1250);
  });

  it('handles zero price', () => {
    const hpItem = { id: 'hp-item-2', name: 'Free Item', price: 0, category_id: 'cat-1' };
    const syncedAt = '2026-03-31T10:00:00.000Z';

    const result = mapHubboPosMenuItemToLocal(hpItem, 'cat-1', syncedAt);

    expect(result.price_cents).toBe(0);
  });

  it('maps SKU field', () => {
    const hpItem = { id: 'hp-item-3', name: 'Item', sku: 'SKU-001', category_id: 'cat-1' };
    const syncedAt = '2026-03-31T10:00:00.000Z';

    const result = mapHubboPosMenuItemToLocal(hpItem, 'cat-1', syncedAt);

    expect(result.hubbo_pos_sku).toBe('SKU-001');
  });

  it('handles missing SKU', () => {
    const hpItem = { id: 'hp-item-4', name: 'Item', category_id: 'cat-1' };
    const syncedAt = '2026-03-31T10:00:00.000Z';

    const result = mapHubboPosMenuItemToLocal(hpItem, 'cat-1', syncedAt);

    expect(result.hubbo_pos_sku).toBeNull();
  });
});

describe('mapHubboPosModifierGroupToLocal', () => {
  it('maps all fields correctly', () => {
    const hpGroup = {
      id: 'hp-group-1',
      name: 'Spice Level',
      description: 'Choose your spice level',
      min_selections: 1,
      max_selections: 3,
      sort_order: 1,
    };
    const syncedAt = '2026-03-31T10:00:00.000Z';

    const result = mapHubboPosModifierGroupToLocal(hpGroup, syncedAt);

    expect(result).toEqual({
      name: 'Spice Level',
      description: 'Choose your spice level',
      min_selections: 1,
      max_selections: 3,
      sort_order: 1,
      hubbo_pos_external_id: 'hp-group-1',
      hubbo_pos_last_synced_at: syncedAt,
      hubbo_pos_source: 'hubbopos',
    });
  });

  it('defaults min/max selections', () => {
    const hpGroup = { id: 'hp-group-2', name: 'Toppings' };
    const syncedAt = '2026-03-31T10:00:00.000Z';

    const result = mapHubboPosModifierGroupToLocal(hpGroup, syncedAt);

    expect(result.min_selections).toBe(0);
    expect(result.max_selections).toBe(1);
  });
});

describe('mapHubboPosModifierToLocal', () => {
  it('maps all fields correctly', () => {
    const hpMod = {
      id: 'hp-mod-1',
      name: 'Extra Spicy',
      price_delta: 2.00,
      is_default: false,
      is_available: true,
      sort_order: 1,
    };
    const syncedAt = '2026-03-31T10:00:00.000Z';

    const result = mapHubboPosModifierToLocal(hpMod, 'group-1', syncedAt);

    expect(result).toEqual({
      modifier_group_id: 'group-1',
      name: 'Extra Spicy',
      price_delta_cents: 200,
      is_default: false,
      is_available: true,
      sort_order: 1,
      hubbo_pos_external_id: 'hp-mod-1',
      hubbo_pos_last_synced_at: syncedAt,
      hubbo_pos_source: 'hubbopos',
    });
  });

  it('converts price delta from decimal to cents', () => {
    const hpMod = { id: 'hp-mod-2', name: 'Add Cheese', price_delta: 3.50 };
    const syncedAt = '2026-03-31T10:00:00.000Z';

    const result = mapHubboPosModifierToLocal(hpMod, 'group-1', syncedAt);

    expect(result.price_delta_cents).toBe(350);
  });

  it('defaults availability and is_default', () => {
    const hpMod = { id: 'hp-mod-3', name: 'Plain' };
    const syncedAt = '2026-03-31T10:00:00.000Z';

    const result = mapHubboPosModifierToLocal(hpMod, 'group-1', syncedAt);

    expect(result.is_default).toBe(false);
    expect(result.is_available).toBe(true);
  });
});
