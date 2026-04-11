import {
  HubboPosCategory,
  HubboPosMenuItem,
  HubboPosModifierGroup,
  HubboPosModifier,
} from './types';

export function mapHubboPosCategoryToLocal(
  hpCategory: HubboPosCategory,
  syncedAt: string
): {
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  hubbo_pos_external_id: string;
  hubbo_pos_last_synced_at: string;
  hubbo_pos_source: string;
} {
  return {
    name: hpCategory.name,
    description: hpCategory.description || null,
    sort_order: hpCategory.sort_order ?? 0,
    is_active: hpCategory.is_active ?? true,
    hubbo_pos_external_id: hpCategory.id,
    hubbo_pos_last_synced_at: syncedAt,
    hubbo_pos_source: 'hubbopos',
  };
}

export function mapHubboPosMenuItemToLocal(
  hpItem: HubboPosMenuItem,
  categoryId: string,
  syncedAt: string
): {
  category_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  hubbo_pos_external_id: string;
  hubbo_pos_sku: string | null;
  hubbo_pos_last_synced_at: string;
  hubbo_pos_source: string;
} {
  return {
    category_id: categoryId,
    name: hpItem.name,
    description: hpItem.description || null,
    price_cents: hpItem.price ? Math.round(hpItem.price * 100) : 0,
    image_url: hpItem.image_url || null,
    is_available: hpItem.is_available ?? true,
    sort_order: hpItem.sort_order ?? 0,
    hubbo_pos_external_id: hpItem.id,
    hubbo_pos_sku: hpItem.sku || null,
    hubbo_pos_last_synced_at: syncedAt,
    hubbo_pos_source: 'hubbopos',
  };
}

export function mapHubboPosModifierGroupToLocal(
  hpGroup: HubboPosModifierGroup,
  syncedAt: string
): {
  name: string;
  description: string | null;
  min_selections: number;
  max_selections: number;
  sort_order: number;
  hubbo_pos_external_id: string;
  hubbo_pos_last_synced_at: string;
  hubbo_pos_source: string;
} {
  return {
    name: hpGroup.name,
    description: hpGroup.description || null,
    min_selections: hpGroup.min_selections ?? 0,
    max_selections: hpGroup.max_selections ?? 1,
    sort_order: hpGroup.sort_order ?? 0,
    hubbo_pos_external_id: hpGroup.id,
    hubbo_pos_last_synced_at: syncedAt,
    hubbo_pos_source: 'hubbopos',
  };
}

export function mapHubboPosModifierToLocal(
  hpModifier: HubboPosModifier,
  groupId: string,
  syncedAt: string
): {
  modifier_group_id: string;
  name: string;
  price_delta_cents: number;
  is_default: boolean;
  is_available: boolean;
  sort_order: number;
  hubbo_pos_external_id: string;
  hubbo_pos_last_synced_at: string;
  hubbo_pos_source: string;
} {
  return {
    modifier_group_id: groupId,
    name: hpModifier.name,
    price_delta_cents: hpModifier.price_delta ? Math.round(hpModifier.price_delta * 100) : 0,
    is_default: hpModifier.is_default ?? false,
    is_available: hpModifier.is_available ?? true,
    sort_order: hpModifier.sort_order ?? 0,
    hubbo_pos_external_id: hpModifier.id,
    hubbo_pos_last_synced_at: syncedAt,
    hubbo_pos_source: 'hubbopos',
  };
}
