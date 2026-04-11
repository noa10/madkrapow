import { getServiceClient } from '@/lib/supabase/server';
import { createHubboPosClient } from './client';
import {
  mapHubboPosCategoryToLocal,
  mapHubboPosMenuItemToLocal,
  mapHubboPosModifierGroupToLocal,
  mapHubboPosModifierToLocal,
} from './mappers';
import type { HubboPosMenuPayload, HubboPosModifierGroup } from './types';

interface CatalogSyncResult {
  categoriesSynced: number;
  itemsSynced: number;
  modifierGroupsSynced: number;
  modifiersSynced: number;
  categoriesAdded: number;
  categoriesUpdated: number;
  itemsAdded: number;
  itemsUpdated: number;
  itemsDeactivated: number;
}

export async function syncCatalog(): Promise<CatalogSyncResult> {
  const client = createHubboPosClient();
  const supabase = getServiceClient();
  const syncedAt = new Date().toISOString();

  const menu = await client.getMenus();

  const result: CatalogSyncResult = {
    categoriesSynced: 0,
    itemsSynced: 0,
    modifierGroupsSynced: 0,
    modifiersSynced: 0,
    categoriesAdded: 0,
    categoriesUpdated: 0,
    itemsAdded: 0,
    itemsUpdated: 0,
    itemsDeactivated: 0,
  };

  await syncCategories(supabase, menu, syncedAt, result);
  await syncModifierGroups(supabase, menu, syncedAt, result);
  await syncMenuItems(supabase, menu, syncedAt, result);

  await supabase
    .from('store_settings')
    .update({
      hubbo_pos_last_catalog_sync_at: syncedAt,
      hubbo_pos_read_only_mode: true,
    })
    .eq('hubbo_pos_enabled', true);

  return result;
}

async function syncCategories(
  supabase: ReturnType<typeof getServiceClient>,
  menu: HubboPosMenuPayload,
  syncedAt: string,
  result: CatalogSyncResult
): Promise<void> {
  const { data: existingCategories } = await supabase
    .from('categories')
    .select('id, hubbo_pos_external_id')
    .not('hubbo_pos_external_id', 'is', null);

  const existingMap = new Map(
    (existingCategories || []).map((c) => [c.hubbo_pos_external_id, c.id])
  );

  for (const hpCategory of menu.categories) {
    const localData = mapHubboPosCategoryToLocal(hpCategory, syncedAt);
    const existingId = existingMap.get(hpCategory.id);

    if (existingId) {
      await supabase
        .from('categories')
        .update(localData)
        .eq('id', existingId);
      result.categoriesUpdated += 1;
    } else {
      const { data: inserted } = await supabase
        .from('categories')
        .insert(localData)
        .select('id')
        .single();
      if (inserted) {
        existingMap.set(hpCategory.id, inserted.id);
      }
      result.categoriesAdded += 1;
    }
    result.categoriesSynced += 1;
  }

  const syncedExternalIds = new Set(menu.categories.map((c) => c.id));
  const { data: staleCategories } = await supabase
    .from('categories')
    .select('id')
    .eq('hubbo_pos_source', 'hubbopos')
    .not('hubbo_pos_external_id', 'in', `(${Array.from(syncedExternalIds).map((id) => `'${id}'`).join(',')})`);

  if (staleCategories?.length) {
    await supabase
      .from('categories')
      .update({ is_active: false, hubbo_pos_last_synced_at: syncedAt })
      .in('id', staleCategories.map((c) => c.id));
  }
}

async function syncMenuItems(
  supabase: ReturnType<typeof getServiceClient>,
  menu: HubboPosMenuPayload,
  syncedAt: string,
  result: CatalogSyncResult
): Promise<void> {
  const { data: existingCategories } = await supabase
    .from('categories')
    .select('id, hubbo_pos_external_id')
    .not('hubbo_pos_external_id', 'is', null);

  const categoryMap = new Map(
    (existingCategories || []).map((c) => [c.hubbo_pos_external_id, c.id])
  );

  const items = menu.items || [];
  const nestedItems: HubboPosMenuPayload['items'] = [];
  for (const cat of menu.categories) {
    if (cat.items) nestedItems.push(...cat.items);
  }

  const allItems = items.length > 0 ? items : nestedItems;

  const { data: existingItems } = await supabase
    .from('menu_items')
    .select('id, hubbo_pos_external_id')
    .not('hubbo_pos_external_id', 'is', null);

  const existingItemMap = new Map(
    (existingItems || []).map((i) => [i.hubbo_pos_external_id, i.id])
  );

  for (const hpItem of allItems) {
    const categoryId = categoryMap.get(hpItem.category_id || '');
    if (!categoryId) continue;

    const localData = mapHubboPosMenuItemToLocal(hpItem, categoryId, syncedAt);
    const existingId = existingItemMap.get(hpItem.id);

    if (existingId) {
      await supabase
        .from('menu_items')
        .update(localData)
        .eq('id', existingId);
      result.itemsUpdated += 1;
    } else {
      await supabase.from('menu_items').insert(localData);
      result.itemsAdded += 1;
    }
    result.itemsSynced += 1;
  }

  const syncedExternalIds = new Set(allItems.map((i) => i.id));
  if (syncedExternalIds.size > 0) {
    const { data: staleItems } = await supabase
      .from('menu_items')
      .select('id')
      .eq('hubbo_pos_source', 'hubbopos')
      .not('hubbo_pos_external_id', 'in', `(${Array.from(syncedExternalIds).map((id) => `'${id}'`).join(',')})`);

    if (staleItems?.length) {
      await supabase
        .from('menu_items')
        .update({ is_available: false, hubbo_pos_last_synced_at: syncedAt })
        .in('id', staleItems.map((i) => i.id));
      result.itemsDeactivated += staleItems.length;
    }
  }
}

async function syncModifierGroups(
  supabase: ReturnType<typeof getServiceClient>,
  menu: HubboPosMenuPayload,
  syncedAt: string,
  result: CatalogSyncResult
): Promise<void> {
  const groups = menu.modifier_groups || [];
  const nestedGroups: HubboPosModifierGroup[] = [];
  for (const cat of menu.categories) {
    if (cat.items) {
      for (const item of cat.items) {
        if (item.modifier_groups) nestedGroups.push(...item.modifier_groups);
      }
    }
  }

  const allGroups = groups.length > 0 ? groups : nestedGroups;
  const seenGroupIds = new Set<string>();

  const { data: existingGroups } = await supabase
    .from('modifier_groups')
    .select('id, hubbo_pos_external_id')
    .not('hubbo_pos_external_id', 'is', null);

  const existingGroupMap = new Map(
    (existingGroups || []).map((g) => [g.hubbo_pos_external_id, g.id])
  );

  for (const hpGroup of allGroups) {
    if (seenGroupIds.has(hpGroup.id)) continue;
    seenGroupIds.add(hpGroup.id);

    const localData = mapHubboPosModifierGroupToLocal(hpGroup, syncedAt);
    const existingId = existingGroupMap.get(hpGroup.id);

    if (existingId) {
      await supabase
        .from('modifier_groups')
        .update(localData)
        .eq('id', existingId);
    } else {
      const { data: inserted } = await supabase
        .from('modifier_groups')
        .insert(localData)
        .select('id')
        .single();
      if (inserted) {
        existingGroupMap.set(hpGroup.id, inserted.id);
      }
    }
    result.modifierGroupsSynced += 1;

    if (hpGroup.modifiers?.length) {
      const groupId = existingGroupMap.get(hpGroup.id) || existingId;
      if (groupId) {
        for (const hpMod of hpGroup.modifiers) {
          const modData = mapHubboPosModifierToLocal(hpMod, groupId, syncedAt);
          await supabase.from('modifiers').insert(modData);
          result.modifiersSynced += 1;
        }
      }
    }
  }
}
