import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/providers/supabase_provider.dart';
import '../../../generated/tables/categories.dart';
import '../../../generated/tables/menu_item_modifier_groups.dart';
import '../../../generated/tables/menu_items.dart';
import '../../../generated/tables/modifier_groups.dart';
import '../../../generated/tables/modifiers.dart';
import '../../../generated/tables/store_settings.dart';

// ── Models ────────────────────────────────────────────────────────

class MenuItemWithModifiers {
  final MenuItemsRow item;
  final bool hasModifiers;

  MenuItemWithModifiers({required this.item, required this.hasModifiers});
}

class CategoryWithMenuItems {
  final CategoriesRow category;
  final List<MenuItemWithModifiers> menuItems;

  CategoryWithMenuItems({required this.category, required this.menuItems});
}

class ModifierGroupWithModifiers {
  final ModifierGroupsRow group;
  final List<ModifiersRow> modifiers;
  final bool isRequired;

  ModifierGroupWithModifiers({
    required this.group,
    required this.modifiers,
    required this.isRequired,
  });
}

class FullMenuItem {
  final MenuItemsRow item;
  final ({String id, String name}) category;
  final List<ModifierGroupWithModifiers> modifierGroups;

  FullMenuItem({
    required this.item,
    required this.category,
    required this.modifierGroups,
  });
}

// ── Repository ────────────────────────────────────────────────────

class MenuRepository {
  MenuRepository(this._supabase);

  final SupabaseClient _supabase;

  /// Fetch categories with their available menu items.
  /// Mirrors web's fetchCategories() — 3 queries + client-side grouping.
  Future<List<CategoryWithMenuItems>> fetchCategoriesWithItems() async {
    final categoriesRes = await _supabase
        .from('categories')
        .select()
        .eq('is_active', true)
        .order('sort_order', ascending: true);

    final itemsRes = await _supabase
        .from('menu_items')
        .select()
        .eq('is_available', true)
        .order('sort_order', ascending: true);

    final junctionRes = await _supabase
        .from('menu_item_modifier_groups')
        .select('menu_item_id');

    // Build set of item IDs that have modifiers
    final itemsWithModifiers = <String>{};
    for (final row in junctionRes) {
      itemsWithModifiers.add(row['menu_item_id'] as String);
    }

    // Parse rows
    final categories = categoriesRes
        .map((json) => CategoriesRow.fromJson(json))
        .toList();
    final items = itemsRes.map((json) => MenuItemsRow.fromJson(json)).toList();

    // Group items by category_id
    final itemsByCategory = <String, List<MenuItemsRow>>{};
    for (final item in items) {
      final catId = item.categoryId;
      itemsByCategory.putIfAbsent(catId, () => []).add(item);
    }

    return categories.map((category) {
      final categoryItems = itemsByCategory[category.id] ?? [];
      return CategoryWithMenuItems(
        category: category,
        menuItems: categoryItems
            .map((item) => MenuItemWithModifiers(
                  item: item,
                  hasModifiers: itemsWithModifiers.contains(item.id),
                ))
            .toList(),
      );
    }).toList();
  }

  /// Fetch a full menu item with its modifier groups and modifiers.
  /// Mirrors web's getItemById() — up to 5 queries.
  Future<FullMenuItem?> fetchItemById(String id) async {
    // 1. Fetch the menu item
    final itemRes = await _supabase
        .from('menu_items')
        .select()
        .eq('id', id)
        .single();

    final menuItem = MenuItemsRow.fromJson(itemRes);

    // 2. Fetch the item's category (just id and name)
    final categoryRes = await _supabase
        .from('categories')
        .select('id, name')
        .eq('id', menuItem.categoryId)
        .single();

    final category =
        (id: categoryRes['id'] as String, name: categoryRes['name'] as String);

    // 3. Fetch junction rows for this item's modifier groups
    final junctionRes = await _supabase
        .from('menu_item_modifier_groups')
        .select()
        .eq('menu_item_id', id);

    if (junctionRes.isEmpty) {
      return FullMenuItem(
        item: menuItem,
        category: category,
        modifierGroups: [],
      );
    }

    final junctions = junctionRes
        .map((json) => MenuItemModifierGroupsRow.fromJson(json))
        .toList();
    final modifierGroupIds = junctions.map((j) => j.modifierGroupId).toList();
    final isRequiredMap = {for (final j in junctions) j.modifierGroupId: j.isRequired};

    // 4. Fetch modifier groups
    final groupsRes = await _supabase
        .from('modifier_groups')
        .select()
        .inFilter('id', modifierGroupIds)
        .order('sort_order', ascending: true);

    final groups =
        groupsRes.map((json) => ModifierGroupsRow.fromJson(json)).toList();

    // 5. Fetch modifiers for all groups
    final groupIdList = groups.map((g) => g.id).toList();
    final modifiersRes = await _supabase
        .from('modifiers')
        .select()
        .inFilter('modifier_group_id', groupIdList)
        .eq('is_available', true)
        .order('sort_order', ascending: true);

    final allModifiers =
        modifiersRes.map((json) => ModifiersRow.fromJson(json)).toList();

    // Group modifiers by modifier_group_id
    final modifiersByGroup = <String, List<ModifiersRow>>{};
    for (final mod in allModifiers) {
      modifiersByGroup.putIfAbsent(mod.modifierGroupId, () => []).add(mod);
    }

    final modifierGroups = groups.map((group) {
      return ModifierGroupWithModifiers(
        group: group,
        modifiers: modifiersByGroup[group.id] ?? [],
        isRequired: isRequiredMap[group.id] ?? false,
      );
    }).toList();

    return FullMenuItem(
      item: menuItem,
      category: category,
      modifierGroups: modifierGroups,
    );
  }

  /// Fetch store settings (single row).
  Future<StoreSettingsRow> fetchStoreSettings() async {
    final res = await _supabase
        .from('store_settings')
        .select()
        .limit(1)
        .single();

    return StoreSettingsRow.fromJson(res);
  }

  // -- Realtime --

  RealtimeChannel subscribeToMenuChanges({
    required void Function() onChange,
  }) {
    return _supabase
        .channel('menu-changes')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'menu_items',
          callback: (_) => onChange(),
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'categories',
          callback: (_) => onChange(),
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'modifiers',
          callback: (_) => onChange(),
        )
        .subscribe();
  }

  void unsubscribeFromMenuChanges(RealtimeChannel channel) {
    _supabase.removeChannel(channel);
  }
}

// ── Providers ─────────────────────────────────────────────────────

final menuRepositoryProvider = Provider<MenuRepository>((ref) {
  return MenuRepository(ref.watch(supabaseProvider));
});

final categoriesWithItemsProvider =
    FutureProvider<List<CategoryWithMenuItems>>((ref) async {
  final repo = ref.watch(menuRepositoryProvider);
  return repo.fetchCategoriesWithItems();
});

final menuItemDetailProvider =
    FutureProvider.family<FullMenuItem?, String>((ref, itemId) async {
  final repo = ref.watch(menuRepositoryProvider);
  return repo.fetchItemById(itemId);
});

final storeSettingsProvider = FutureProvider<StoreSettingsRow>((ref) async {
  final repo = ref.watch(menuRepositoryProvider);
  return repo.fetchStoreSettings();
});
